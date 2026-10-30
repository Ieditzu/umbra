"""Confidence-aware pavement-shadow early-warning pipeline."""

from __future__ import annotations

import math
from collections.abc import Callable
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from .body import night_body_tracks
from .position import PositionTracker
from .sun import sun_metadata
from .video import estimate_audio_offset, read_frames
from .vision import (
    CalibrationModel,
    SceneAssessment,
    build_calibration_model,
    detect_corner_and_roi,
    extract_scene_shadow_signal,
    extract_temporal_signal,
    load_ground_truth,
    manual_shadow_assessment,
    manual_track_labels,
)

Progress = Callable[[float, str], None]


def _sigmoid(value: float) -> float:
    return float(1.0 / (1.0 + math.exp(-float(np.clip(value, -20, 20)))))


def _serialise_assessment(assessment: SceneAssessment, calibration: CalibrationModel) -> dict[str, Any]:
    return {
        "edge": list(assessment.edge) if assessment.edge else None,
        "roi": list(assessment.roi) if assessment.roi else None,
        "entry_zone": [0, 0, calibration.background.shape[1], max(32, int(calibration.background.shape[0] * 0.50))]
        if assessment.roi and assessment.source == "automatic"
        else None,
        "edge_score": round(assessment.edge_score, 4),
        "roi_score": round(assessment.roi_score, 4),
        "coverage_score": round(assessment.coverage_score, 4),
        "calibration_stability": round(calibration.stability, 4),
        "calibration_noise": round(calibration.noise, 4),
        "reasons": assessment.reasons,
        "roi_source": assessment.source,
    }


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
        direction = "toward_corner"
    else:
        direction = "away_from_corner"
    return direction, speed_class, velocity


def _onset(timestamps: list[float], scores: list[float], threshold: float = 0.5, persist: int = 2) -> float | None:
    run = 0
    for index, score in enumerate(scores):
        if score >= threshold:
            run += 1
            if run >= persist:
                return float(timestamps[index - persist + 1])
        else:
            run = 0
    return None


def _hidden_motion_from_shadow(
    timestamps: list[float],
    signal: list[dict[str, Any]],
    presence: list[float],
    shadow_onset: float | None,
    los_onset: float | None,
) -> dict[str, Any] | None:
    """Show observed shadow travel as a relative pre-entry motion cue, not a body location."""

    if shadow_onset is None or los_onset is None or los_onset - shadow_onset < 0.45:
        return None
    observations = [
        (index, timestamp, float(cue["position"]))
        for index, (timestamp, cue, score) in enumerate(zip(timestamps, signal, presence, strict=True))
        if shadow_onset <= timestamp < los_onset and score >= 0.5
        and math.isfinite(float(cue["position"]))
    ]
    if len(observations) < 5 or observations[-1][1] - observations[0][1] < 0.4:
        return None
    raw = np.asarray([position for _, _, position in observations], dtype=np.float64)
    smoothed = np.asarray([
        np.median(raw[max(0, index - 1): min(len(raw), index + 2)])
        for index in range(len(raw))
    ])
    start = float(np.median(smoothed[:3]))
    end = float(np.median(smoothed[-3:]))
    displacement = end - start
    if abs(displacement) < 0.07:
        return None
    progress = np.clip((smoothed - start) / displacement, 0.0, 1.0)
    progress = np.maximum.accumulate(progress)
    observed_duration = max(observations[-1][1] - observations[0][1], 1e-3)
    frames = [
        {
            "frame_index": index,
            "timestamp_s": round(timestamp, 3),
            "progress_norm": round(float(value), 3),
        }
        for (index, timestamp, _), value in zip(observations, progress, strict=True)
    ]
    return {
        "kind": "relative_shadow_motion",
        "basis": "shadow centroid before visible body entry",
        "shadow_image_direction": "right" if displacement > 0 else "left",
        "estimated_preentry_duration_s": round(observed_duration, 3),
        "warning": "Green dot is an estimated hidden position derived from relative shadow travel, not measured ground truth.",
        "frames": frames,
    }


def _automatic_hidden_overlay_path(
    background: np.ndarray,
    roi: tuple[int, int, int, int],
    signal: list[dict[str, Any]],
    motion: dict[str, Any],
) -> list[list[float]] | None:
    """Infer a nearby occluding side from the shadow's first position and static contrast."""

    observations = motion["frames"]
    if len(observations) < 5:
        return None
    first = [float(signal[item["frame_index"]]["lateral"]) for item in observations[:3]]
    last = [float(signal[item["frame_index"]]["lateral"]) for item in observations[-3:]]
    travel = float(np.median(last) - np.median(first))
    if abs(travel) < 0.065:
        return None
    direction = 1 if travel > 0 else -1
    height, width = background.shape
    roi_x, roi_y, roi_width, roi_height = roi
    shadow_x = roi_x + float(np.median(first)) * roi_width
    blur = cv2.GaussianBlur(background.astype(np.float32), (0, 0), 3)
    top, bottom = int(height * 0.77), int(height * 0.94)
    if bottom - top < 12:
        return None
    radius = max(5, int(width * 0.015))
    separation = max(8, int(width * 0.02))
    near = max(radius, int(shadow_x - width * 0.18)) if direction > 0 else int(shadow_x + separation)
    far = int(shadow_x - separation) if direction > 0 else min(width - radius - 1, int(shadow_x + width * 0.18))
    if far <= near:
        return None
    candidates = []
    for x in range(near, far + 1):
        contrast = float(np.mean(np.abs(blur[top:bottom, x - radius] - blur[top:bottom, x + radius])))
        weighted = contrast * math.exp(-abs(x - shadow_x) / max(12.0, width * 0.045))
        candidates.append((weighted, contrast, x))
    _, contrast, edge_x = max(candidates)
    if contrast < 18 or abs(edge_x - shadow_x) > width * 0.12:
        return None
    inset = max(12, int(width * 0.04))
    route_length = max(int(width * 0.14), int(abs(travel) * roi_width * 1.2))
    corner_x = edge_x - direction * inset
    start_x = corner_x - direction * route_length
    if not width * 0.06 <= start_x <= width * 0.94 or not width * 0.06 <= corner_x <= width * 0.94:
        return None
    # The dot represents the hidden person's estimated image-space position,
    # so place the route on the occluding building facade rather than on the
    # pavement where the shadow itself is observed.
    hidden_y = int(height * 0.31)
    return [
        [round(start_x / width, 4), round(hidden_y / height, 4)],
        [round(corner_x / width, 4), round(hidden_y / height, 4)],
    ]


def _status(
    coverage: float,
    present: float,
    confidence: float,
    los_present: bool,
    lead_time: float | None,
    shadow_seen: bool,
) -> tuple[str, list[str]]:
    reasons: list[str] = []
    if coverage < 0.44:
        reasons.append("The corner, visible-side patch, or calibration is unsuitable")
        return "no_coverage", reasons
    if los_present and (not shadow_seen or confidence < 0.35 or lead_time is None or lead_time <= 0):
        reasons.append("A person entered the frame without a prior pavement-shadow warning")
        return "entered_view", reasons
    if not shadow_seen or present < 0.5 or confidence < 0.35:
        reasons.append("No repeatable pavement-shadow signal exceeds calibration noise")
        return "no_reliable_signal", reasons
    if los_present and lead_time is not None and lead_time > 0:
        reasons.append(f"Pavement shadow preceded line-of-sight by {lead_time:.2f} s")
        return "early_warning", reasons
    if confidence < 0.67:
        reasons.append("A pavement shadow is present; the walker has not entered the frame")
        return "possible_motion", reasons
    reasons.append("A pavement shadow is approaching the corner before line-of-sight")
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
        "fixed_signal_threshold": fixed,
        "coverage_coherence_rule": geometry,
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
    offset_s: float = 0.0,
) -> dict[str, float | int | str | None]:
    # Audio offset is main time minus ground-truth time. Match timestamps,
    # never row indices: cameras can have different rates and start times.
    labels = sorted(labels, key=lambda item: float(item["timestamp_s"]))
    pairs = []
    label_times = np.array([float(item["timestamp_s"]) + offset_s for item in labels])
    for point in timeline:
        if not labels:
            break
        timestamp = float(point["timestamp_s"])
        index = int(np.searchsorted(label_times, timestamp))
        candidates = [i for i in (index - 1, index) if 0 <= i < len(labels)]
        nearest = min(candidates, key=lambda i: abs(label_times[i] - timestamp))
        if abs(label_times[nearest] - timestamp) <= 0.075 and labels[nearest].get("valid", True):
            pairs.append((point, labels[nearest]))
    if not pairs:
        return {"ground_truth_available": 0, "f1": None, "position_error_norm": None}
    if len({float(label["timestamp_s"]) for _, label in pairs}) < 3:
        return {
            "ground_truth_available": 1,
            "evaluated_samples": len(pairs),
            "f1": None,
            "position_error_norm": None,
            "validation_note": "At least three distinct truth frames are needed for a performance score.",
        }
    timeline, labels = map(list, zip(*pairs, strict=True))
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
    result: dict[str, float | int | str | None] = {
        "ground_truth_available": 1,
        "evaluated_samples": count,
        "true_positive": true_positive,
        "false_positive": false_positive,
        "false_negative": false_negative,
        "true_negative": int(np.sum(~expected & ~observed)),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "false_alert_rate": round(false_positive / int(np.sum(~expected)), 4) if np.any(~expected) else None,
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
    manual_ground_truth: dict[str, Any] | None = None,
    progress: Progress | None = None,
    position_calibration: tuple[dict[str, Any], np.ndarray, np.ndarray] | None = None,
) -> dict[str, Any]:
    """Run the complete, conservative analysis for one locally stored trial."""

    update = progress or (lambda _progress, _message: None)
    update(0.10, "Decoding calibration")
    calibration_frames, _, calibration_info = read_frames(calibration_path, target_fps=10, max_frames=180)
    calibration = build_calibration_model(calibration_frames)
    reviewed_region = manual_ground_truth.get("main_shadow_region") if manual_ground_truth else None
    assessment = (
        manual_shadow_assessment(calibration.background, calibration.stability, reviewed_region)
        if isinstance(reviewed_region, dict)
        else detect_corner_and_roi(calibration.background, calibration.stability)
    )
    update(0.27, "Decoding trial footage")
    main_frames, timestamps, main_info = read_frames(main_path, target_fps=10, max_frames=600)
    main_frames = _resize_like(main_frames, calibration.background.shape)
    sun = sun_metadata(scene)
    streetlamp_mode = sun["above_horizon"] is False and isinstance(reviewed_region, dict)
    illumination_source = "streetlamp" if streetlamp_mode else "sun" if sun["above_horizon"] is True else "unknown"
    lamp_pool_brightness: float | None = None
    if streetlamp_mode and assessment.roi is not None:
        x, y, width, height = assessment.roi
        lamp_pool_brightness = round(float(np.mean(calibration.background[y : y + height, x : x + width])), 2)
        if lamp_pool_brightness < 55.0:
            assessment.coverage_score = min(assessment.coverage_score, 0.43)
            assessment.reasons.append("Selected streetlamp pavement is too dark in the empty calibration")
    illumination = {"source": illumination_source, "selected_pool_brightness": lamp_pool_brightness}
    if assessment.roi is None:
        return {
            "state": "no_coverage",
            "confidence": 0.0,
            "presence_probability": None,
            "position_range_norm": None,
            "position_range_m": None,
            "direction": "unknown",
            "speed_class": "unknown",
            "velocity_track_units_per_s": None,
            "lead_time_s": None,
            "shadow_onset_s": None,
            "los_onset_s": None,
            "los_detected": False,
            "hidden_motion": None,
            "hidden_source_estimate": None,
            "reasons": assessment.reasons,
            "confidence_factors": {},
            "model": {"name": "calibration_temporal_evidence", "version": "0.2", "trained": False},
            "scene_assessment": _serialise_assessment(assessment, calibration),
            "sun": sun,
            "illumination": illumination,
            "timeline": [],
            "baselines": {},
            "metrics": {"ground_truth_available": 0, "f1": None, "position_error_norm": None, "lead_time_s": None},
            "message": "Umbra did not find a defensible automatic corner region. Reframe and recalibrate.",
            "video": {"calibration": calibration_info, "main": main_info},
        }
    update(0.42, "Normalising exposure and extracting temporal residuals")
    tuned = assessment.source == "manual_phone"
    signal = (
        extract_scene_shadow_signal(main_frames, calibration, assessment.roi)
        if tuned else extract_temporal_signal(main_frames, calibration, assessment.roi, assessment.edge)
    )
    energies = [float(item["energy"]) for item in signal]
    los_energies = [float(item["los_energy"]) for item in signal]
    coherences = [float(item["coherence"]) for item in signal]
    energy_scale = calibration.noise * 1.35 + 1.2
    los_scale = calibration.noise * 2.2 + 1.6
    presence = (
        [float(item["presence"]) for item in signal]
        if tuned else [_sigmoid((energy - 1.35 * calibration.noise) / energy_scale) for energy in energies]
    )
    los_scores = (
        [0.0] * len(signal)
        if tuned else [_sigmoid((energy - 3.2 * calibration.noise) / los_scale) for energy in los_energies]
    )
    body_detection = None
    if sun["above_horizon"] is False:
        update(0.56, "Separating low-light upright foreground from cast shadows")
        body_boxes = night_body_tracks(main_frames, calibration)
        los_scores = [0.9 if box is not None else 0.0 for box in body_boxes]
        body_detection = {
            "method": "low_light_upright_foreground_v1",
            "baseline_samples": min(18, len(main_frames)),
            "limitation": "Silhouette evidence, not semantic person recognition. The trial opening must be empty.",
            "samples": [
                {"frame_index": index, "timestamp_s": round(timestamp, 3), "box": list(box) if box else None}
                for index, (timestamp, box) in enumerate(zip(timestamps, body_boxes, strict=True))
            ],
        }
    raw_probabilities = [
        _position_distribution(float(item["position"]), present) for item, present in zip(signal, presence, strict=True)
    ]
    filtered = _track_probabilities(raw_probabilities)
    positions = [_position_from_probability(probability) for probability in filtered]
    peak_energy = float(np.max(energies)) if energies else 0.0
    peak_presence = float(np.max(presence)) if presence else 0.0
    coherence = float(np.mean(coherences))
    signal_strength = float(np.clip(peak_energy / (calibration.noise * 3.2 + 1.0), 0.0, 1.0))
    present_probability = peak_presence
    disagreement = float(
        np.std(
            [
                _sigmoid((float(np.mean(energies)) - 1.5 * calibration.noise) / (calibration.noise + 1.0)),
                _sigmoid((peak_energy - 2.8) / 1.7),
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
    shadow_onset = _onset(timestamps, presence)
    los_onset = _onset(timestamps, los_scores)
    entry_source = "automatic"
    manual_entry = manual_ground_truth.get("main_entry_timestamp_s") if manual_ground_truth else None
    if isinstance(manual_entry, (int, float)) and 0 <= manual_entry <= (timestamps[-1] if timestamps else 0):
        los_onset = float(manual_entry)
        entry_source = "manual_review"
    lead_time = None
    if shadow_onset is not None and los_onset is not None:
        lead_time = round(los_onset - shadow_onset, 3)
    hidden_motion = _hidden_motion_from_shadow(timestamps, signal, presence, shadow_onset, los_onset)
    if hidden_motion is not None:
        automatic_path = _automatic_hidden_overlay_path(calibration.background, assessment.roi, signal, hidden_motion)
        if automatic_path is not None:
            hidden_motion["overlay_path"] = automatic_path
            hidden_motion["path_source"] = "automatic_wall_edge_proxy"
    los_present = los_onset is not None
    state, state_reasons = _status(
        assessment.coverage_score, present_probability, confidence, los_present, lead_time,
        shadow_onset is not None,
    )
    if entry_source == "manual_review" and state == "early_warning" and lead_time is not None:
        state_reasons = [f"Pavement shadow preceded reviewed body entry by {lead_time:.2f} s"]
    if sun["above_horizon"] is False and not streetlamp_mode:
        state = "no_coverage"
        confidence = 0.0
        hidden_motion = None
        state_reasons = [
            "Sun below the horizon. Select a streetlamp-lit pavement area on the corner trial to test artificial-light shadows."
        ]
    elif streetlamp_mode and state == "no_coverage":
        hidden_motion = None
    update(0.65, "Applying saved camera position mapping")
    if position_calibration is not None:
        mapping, reference, noise = position_calibration
        tracker = PositionTracker(mapping, reference, noise)
        samples = [{"frame_index": i, "timestamp_s": round(timestamp, 3), **tracker.update(frame)}
                   for i, (frame, timestamp) in enumerate(zip(main_frames, timestamps, strict=True))]
        hidden_source_estimate = {
            "method": "saved_shadow_body_mapping_v1", "calibrated": True,
            "status": "estimated" if any(s["position_norm"] for s in samples) else "unavailable",
            "calibration_kind": "empirical camera/route/light mapping, not physical geometry reconstruction",
            "calibration_id": mapping.get("calibration_id"),
            "limitation": mapping["limitation"], "samples": samples,
            "source_media_id": mapping.get("source_media_id"),
            "mapping": mapping,
            "fit_error_px": mapping["fit_error_px"],
            "internal_check_error_px": mapping["internal_check_error_px"],
        }
    else:
        hidden_source_estimate = {
            "method": "saved_shadow_body_mapping_v1", "status": "calibration_required", "calibrated": False,
            "limitation": "Save a separate camera calibration walk before estimating hidden body position.",
            "reason": "No saved position mapping for this camera", "samples": [],
        }
    # The uncalibrated source preview does not promote a refused night scene
    # into a validated warning or claim that a person has been detected.
    hidden_source_estimate["shadow_warning_eligible"] = state in {"possible_motion", "strong_motion", "early_warning"}
    direction, speed_class, velocity = _speed_and_direction(positions, timestamps)
    if tuned or state in {"no_coverage", "no_reliable_signal"}:
        direction, speed_class, velocity = "unknown", "unknown", None
    timeline = [
        {
            "timestamp_s": round(timestamp, 3),
            "presence_probability": round(present, 4),
            "los_probability": round(los_score, 4),
            "position_norm": round(position, 4),
            "position_bins": [round(float(value), 5) for value in probability],
            "signal_energy": round(energy, 4),
        }
        for timestamp, present, los_score, position, probability, energy in zip(
            timestamps, presence, los_scores, positions, filtered, energies, strict=True
        )
    ]
    baselines = {} if tuned else _baseline_summary(
        energies, calibration.noise, assessment.coverage_score, coherence, present_probability
    )
    labels: list[dict[str, float | bool]] = []
    alignment: dict[str, Any] = {"method": "not_requested", "confidence": 0.0}
    if manual_ground_truth and ground_truth_path:
        update(0.76, "Using manually reviewed ground-truth labels")
        labels, alignment = manual_track_labels(manual_ground_truth)
    elif ground_truth_path:
        update(0.76, "Auto-labeling controlled ground-truth footage")
        labels, alignment = load_ground_truth(ground_truth_path)
    if labels and ground_truth_path and alignment["method"] != "synthetic_clock":
        sync = estimate_audio_offset(main_path, ground_truth_path)
        label_confidence = float(alignment["confidence"])
        label_method = str(alignment.get("method", "unknown"))
        alignment = {**alignment, **sync, "label_method": label_method, "label_confidence": label_confidence}
        if float(sync["confidence"]) >= 0.45:
            alignment["confidence"] = min(label_confidence, float(sync["confidence"]))
        elif label_confidence >= 0.45:
            alignment["offset_s"] = 0.0
            alignment["confidence"] = round(label_confidence * 0.7, 3)
            alignment["sync_note"] = "Audio sync was unreliable; labels use zero offset and need review."
        else:
            alignment["confidence"] = min(label_confidence, float(sync["confidence"]))
        if float(alignment["confidence"]) < 0.35:
            labels = []
            alignment["withheld"] = "Ground-truth alignment confidence is too low"
    metrics = _metrics(timeline, labels, track_length_m, float(alignment.get("offset_s", 0.0)))
    metrics["lead_time_s"] = lead_time
    metrics["shadow_onset_s"] = shadow_onset
    metrics["los_onset_s"] = los_onset
    update(0.90, "Preparing confidence-aware result")
    tracked = state in {"possible_motion", "strong_motion", "early_warning"}
    return {
        "state": state,
        "confidence": round(confidence, 4),
        "presence_probability": round(present_probability, 4),
        "position_range_norm": [
            round(float(np.quantile(positions, 0.2)), 4),
            round(float(np.quantile(positions, 0.8)), 4),
        ]
        if tracked
        else None,
        "position_range_m": [
            round(float(np.quantile(positions, 0.2)) * track_length_m, 3),
            round(float(np.quantile(positions, 0.8)) * track_length_m, 3),
        ]
        if track_length_m is not None and tracked
        else None,
        "direction": direction,
        "speed_class": speed_class,
        "velocity_track_units_per_s": round(velocity, 4) if velocity is not None else None,
        "lead_time_s": lead_time,
        "shadow_onset_s": round(shadow_onset, 3) if shadow_onset is not None else None,
        "los_onset_s": round(los_onset, 3) if los_onset is not None else None,
        "los_detected": los_present,
        "hidden_motion": hidden_motion,
        "hidden_source_estimate": hidden_source_estimate,
        "entry_source": entry_source,
        "body_detection": body_detection,
        "model": {
            "name": "scene_tuned_pavement_residual" if tuned else "calibration_temporal_evidence",
            "version": "0.3" if tuned else "0.2",
            "trained": False,
            **({"role": "Calibrated on this trial's empty opening; test on another trial to validate"} if tuned else {}),
        },
        "confidence_factors": {
            "coverage": round(assessment.coverage_score, 4),
            "signal_strength": round(signal_strength, 4),
            "temporal_coherence": round(coherence, 4),
            "method_disagreement": round(disagreement, 4),
        },
        "reasons": [*assessment.reasons, *state_reasons],
        "scene_assessment": _serialise_assessment(assessment, calibration),
        "sun": sun,
        "illumination": illumination,
        "timeline": timeline,
        "baselines": baselines,
        "ground_truth": {"alignment": alignment, "labels": labels},
        "metrics": metrics,
        "video": {"calibration": calibration_info, "main": main_info},
    }
