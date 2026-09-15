"""Confidence-aware 1D hidden-motion analysis pipeline."""

from __future__ import annotations

import math
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from .video import estimate_audio_offset, read_frames
from .vision import (
    CalibrationModel,
    SceneAssessment,
    build_calibration_model,
    detect_corner_and_roi,
    extract_temporal_signal,
    load_ground_truth,
)

Progress = Callable[[float, str], None]


def _sigmoid(value: float) -> float:
    return float(1.0 / (1.0 + math.exp(-float(np.clip(value, -20, 20)))))


def _serialise_assessment(assessment: SceneAssessment, calibration: CalibrationModel) -> dict[str, Any]:
    return {
        "edge": list(assessment.edge) if assessment.edge else None,
        "roi": list(assessment.roi) if assessment.roi else None,
        "edge_score": round(assessment.edge_score, 4),
        "roi_score": round(assessment.roi_score, 4),
        "coverage_score": round(assessment.coverage_score, 4),
        "calibration_stability": round(calibration.stability, 4),
        "calibration_noise": round(calibration.noise, 4),
        "reasons": assessment.reasons,
    }


def _sun_metadata(scene: dict[str, Any]) -> dict[str, float | str | None]:
    latitude, longitude, recorded_at = scene.get("latitude"), scene.get("longitude"), scene.get("recorded_at")
    if latitude is None or longitude is None or not recorded_at:
        return {"status": "not_available", "elevation_deg": None, "azimuth_deg": None}
    try:
        from astral import Observer
        from astral.sun import azimuth, elevation

        moment = datetime.fromisoformat(str(recorded_at).replace("Z", "+00:00"))
        if moment.tzinfo is None:
            moment = moment.replace(tzinfo=UTC)
        observer = Observer(latitude=float(latitude), longitude=float(longitude))
        return {
            "status": "estimated",
            "elevation_deg": round(float(elevation(observer, moment)), 2),
            "azimuth_deg": round(float(azimuth(observer, moment)), 2),
        }
    except (ImportError, TypeError, ValueError):
        return {"status": "not_available", "elevation_deg": None, "azimuth_deg": None}


def _position_distribution(position: float, confidence: float, bins: int = 16) -> np.ndarray:
    centres = np.linspace(0.0, 1.0, bins)
    gaussian = np.exp(-0.5 * ((centres - position) / 0.115) ** 2)
    gaussian /= gaussian.sum() + 1e-9
    uniform = np.full(bins, 1.0 / bins)
    return confidence * gaussian + (1.0 - confidence) * uniform


def _track_probabilities(raw: list[np.ndarray]) -> list[np.ndarray]:
    """A small forward filter that prevents impossible bin-to-bin jumps."""

    if not raw:
        return []
    bins = raw[0].size
    transition = np.zeros((bins, bins), dtype=np.float64)
    for source in range(bins):
        for target in range(bins):
            distance = abs(source - target)
            transition[source, target] = math.exp(-distance / 1.25)
        transition[source] /= transition[source].sum()
    posterior = np.full(bins, 1.0 / bins)
    result: list[np.ndarray] = []
    for observation in raw:
        posterior = observation * (posterior @ transition)
        posterior /= posterior.sum() + 1e-9
        result.append(posterior)
    return result


def _position_from_probability(probability: np.ndarray) -> float:
    return float(np.dot(np.linspace(0.0, 1.0, probability.size), probability))


def _speed_and_direction(positions: list[float], timestamps: list[float]) -> tuple[str, str, float]:
    if len(positions) < 4:
        return "unknown", "unknown", 0.0
    elapsed = max(timestamps[-1] - timestamps[0], 1e-6)
    net_velocity = (positions[-1] - positions[0]) / elapsed
    velocity = float(np.median(np.diff(positions) / np.maximum(np.diff(timestamps), 1e-6)))
    magnitude = abs(velocity)
    speed_class = "still" if magnitude < 0.025 else "slow" if magnitude < 0.13 else "fast"
    if abs(net_velocity) < 0.035:
        direction = "unknown"
    elif net_velocity > 0:
        direction = "away_from_corner"
    else:
        direction = "toward_corner"
    return direction, speed_class, velocity


def _status(coverage: float, present: float, confidence: float) -> tuple[str, list[str]]:
    reasons: list[str] = []
    if coverage < 0.44:
        reasons.append("The corner, visible-side patch, or calibration is unsuitable")
        return "no_coverage", reasons
    if present < 0.22:
        reasons.append("No repeatable hidden-motion signal exceeds calibration noise")
        return "no_reliable_signal", reasons
    if confidence < 0.67:
        reasons.append("A motion-like cue exists, but confidence is below the strong-evidence threshold")
        return "possible_motion", reasons
    reasons.append("Temporal signal, calibration, and geometry are mutually consistent")
    return "strong_motion", reasons


def _baseline_summary(
    energies: list[float],
    noise: float,
    coverage: float,
    coherence: float,
    umbra_present: float,
) -> dict[str, dict[str, float | str]]:
    mean_energy = float(np.mean(energies))
    simple = _sigmoid((mean_energy - 1.5 * noise) / (noise + 1.0))
    fixed = _sigmoid((mean_energy - 2.8) / 1.7)
    geometry = float(np.clip(coverage * (0.35 + 0.65 * coherence), 0.0, 1.0))
    methods = {
        "frame_difference": simple,
        "fixed_temporal_model": fixed,
        "geometry_sun_rules": geometry,
        "umbra": umbra_present,
    }
    return {
        name: {
            "presence_probability": round(value, 4),
            "state": "motion" if value >= 0.5 else "no_motion",
        }
        for name, value in methods.items()
    }


def _metrics(
    timeline: list[dict[str, Any]],
    labels: list[dict[str, float | bool]],
    track_length_m: float | None,
) -> dict[str, float | int | None]:
    if not labels or not timeline:
        return {"ground_truth_available": 0, "f1": None, "position_error_norm": None}
    expected = np.array([bool(item["present"]) for item in labels], dtype=bool)
    observed = np.array([item["presence_probability"] >= 0.5 for item in timeline], dtype=bool)
    count = min(expected.size, observed.size)
    expected, observed = expected[:count], observed[:count]
    true_positive = int(np.sum(expected & observed))
    false_positive = int(np.sum(~expected & observed))
    false_negative = int(np.sum(expected & ~observed))
    precision = true_positive / max(1, true_positive + false_positive)
    recall = true_positive / max(1, true_positive + false_negative)
    f1 = 2 * precision * recall / max(1e-9, precision + recall)
    positions = [
        abs(float(timeline[index]["position_norm"]) - float(labels[index]["position_norm"]))
        for index in range(count)
        if bool(labels[index]["present"])
    ]
    position_error = float(np.mean(positions)) if positions else None
    result: dict[str, float | int | None] = {
        "ground_truth_available": 1,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "false_alert_rate": round(false_positive / max(1, int(np.sum(~expected))), 4),
        "position_error_norm": round(position_error, 4) if position_error is not None else None,
        "position_error_m": round(position_error * track_length_m, 3)
        if position_error is not None and track_length_m is not None
        else None,
    }
    return result


def _resize_like(frames: list[np.ndarray], shape: tuple[int, int]) -> list[np.ndarray]:
    target_height, target_width = shape
    return [
        frame
        if frame.shape[:2] == shape
        else cv2.resize(frame, (target_width, target_height), interpolation=cv2.INTER_AREA)
        for frame in frames
    ]


def analyse_trial(
    *,
    calibration_path: Path,
    main_path: Path,
    ground_truth_path: Path | None,
    scene: dict[str, Any],
    track_length_m: float | None,
    progress: Progress | None = None,
) -> dict[str, Any]:
    """Run the complete, conservative analysis for one locally stored trial."""

    update = progress or (lambda _progress, _message: None)
    update(0.10, "Decoding calibration")
    calibration_frames, _, calibration_info = read_frames(calibration_path, target_fps=10, max_frames=180)
    calibration = build_calibration_model(calibration_frames)
    assessment = detect_corner_and_roi(calibration.background, calibration.stability)
    update(0.27, "Decoding trial footage")
    main_frames, timestamps, main_info = read_frames(main_path, target_fps=10, max_frames=600)
    main_frames = _resize_like(main_frames, calibration.background.shape)
    sun = _sun_metadata(scene)
    if assessment.roi is None:
        return {
            "state": "no_coverage",
            "confidence": 0.0,
            "scene_assessment": _serialise_assessment(assessment, calibration),
            "sun": sun,
            "timeline": [],
            "baselines": {},
            "metrics": {"ground_truth_available": 0, "f1": None, "position_error_norm": None},
            "message": "Umbra did not find a defensible automatic corner region. Reframe and recalibrate.",
            "video": {"calibration": calibration_info, "main": main_info},
        }
    update(0.42, "Normalising exposure and extracting temporal residuals")
    signal = extract_temporal_signal(main_frames, calibration, assessment.roi)
    energies = [float(item["energy"]) for item in signal]
    coherences = [float(item["coherence"]) for item in signal]
    energy_scale = calibration.noise * 1.35 + 1.2
    presence = [_sigmoid((energy - 1.35 * calibration.noise) / energy_scale) for energy in energies]
    raw_probabilities = [
        _position_distribution(float(item["position"]), present) for item, present in zip(signal, presence, strict=True)
    ]
    filtered = _track_probabilities(raw_probabilities)
    positions = [_position_from_probability(probability) for probability in filtered]
    coherence = float(np.mean(coherences))
    signal_strength = float(np.clip(np.median(energies) / (calibration.noise * 3.2 + 1.0), 0.0, 1.0))
    present_probability = float(np.mean(presence))
    disagreement = float(
        np.std(
            [
                _sigmoid((float(np.mean(energies)) - 1.5 * calibration.noise) / (calibration.noise + 1.0)),
                _sigmoid((float(np.mean(energies)) - 2.8) / 1.7),
                assessment.coverage_score * (0.35 + 0.65 * coherence),
            ]
        )
    )
    confidence = float(
        np.clip(
            (assessment.coverage_score * max(signal_strength, 0.02) * max(coherence, 0.05)) ** (1 / 3)
            * (1.0 - min(0.5, disagreement)),
            0.0,
            1.0,
        )
    )
    state, state_reasons = _status(assessment.coverage_score, present_probability, confidence)
    direction, speed_class, velocity = _speed_and_direction(positions, timestamps)
    timeline = [
        {
            "timestamp_s": round(timestamp, 3),
            "presence_probability": round(present, 4),
            "position_norm": round(position, 4),
            "position_bins": [round(float(value), 5) for value in probability],
            "signal_energy": round(energy, 4),
        }
        for timestamp, present, position, probability, energy in zip(
            timestamps, presence, positions, filtered, energies, strict=True
        )
    ]
    baselines = _baseline_summary(energies, calibration.noise, assessment.coverage_score, coherence, present_probability)
    labels: list[dict[str, float | bool]] = []
    alignment: dict[str, Any] = {"method": "not_requested", "confidence": 0.0}
    if ground_truth_path:
        update(0.76, "Auto-labeling controlled ground-truth footage")
        labels, alignment = load_ground_truth(ground_truth_path)
        if alignment["method"] != "synthetic_clock":
            sync = estimate_audio_offset(main_path, ground_truth_path)
            alignment = {**alignment, **sync}
            if float(alignment["confidence"]) < 0.45:
                labels = []
                alignment["withheld"] = "Ground-truth alignment confidence is too low"
    metrics = _metrics(timeline, labels, track_length_m)
    update(0.90, "Preparing confidence-aware result")
    return {
        "state": state,
        "confidence": round(confidence, 4),
        "presence_probability": round(present_probability, 4),
        "position_range_norm": [
            round(float(np.quantile(positions, 0.2)), 4),
            round(float(np.quantile(positions, 0.8)), 4),
        ],
        "position_range_m": [
            round(float(np.quantile(positions, 0.2)) * track_length_m, 3),
            round(float(np.quantile(positions, 0.8)) * track_length_m, 3),
        ]
        if track_length_m is not None
        else None,
        "direction": direction,
        "speed_class": speed_class,
        "velocity_track_units_per_s": round(velocity, 4),
        "model": {"name": "calibration_temporal_evidence", "version": "0.1", "trained": False},
        "confidence_factors": {
            "coverage": round(assessment.coverage_score, 4),
            "signal_strength": round(signal_strength, 4),
            "temporal_coherence": round(coherence, 4),
            "method_disagreement": round(disagreement, 4),
        },
        "reasons": [*assessment.reasons, *state_reasons],
        "scene_assessment": _serialise_assessment(assessment, calibration),
        "sun": sun,
        "timeline": timeline,
        "baselines": baselines,
        "ground_truth": {"alignment": alignment, "labels": labels},
        "metrics": metrics,
        "video": {"calibration": calibration_info, "main": main_info},
    }
