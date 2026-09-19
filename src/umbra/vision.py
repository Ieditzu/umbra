"""Calibration, corner assessment, and automatic ground-truth helpers."""

from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from .video import read_frames


@dataclass(slots=True)
class CalibrationModel:
    background: np.ndarray
    stable_mask: np.ndarray
    lit_mask: np.ndarray
    noise: float
    stability: float


@dataclass(slots=True)
class SceneAssessment:
    edge: tuple[int, int, int, int] | None
    roi: tuple[int, int, int, int] | None
    edge_score: float
    roi_score: float
    coverage_score: float
    reasons: list[str]


def grayscale(frame: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).astype(np.float32)


def build_calibration_model(frames: list[np.ndarray]) -> CalibrationModel:
    if len(frames) < 8:
        raise ValueError("Use at least eight stable calibration frames.")
    gray_frames = np.stack([grayscale(frame) for frame in frames])
    background = np.median(gray_frames, axis=0)
    deviation = np.std(gray_frames, axis=0)
    cutoff = float(np.quantile(deviation, 0.72))
    stable_mask = deviation <= max(cutoff, 0.6)
    noise = float(np.median(deviation[stable_mask]))
    frame_means = gray_frames[:, stable_mask].mean(axis=1)
    brightness_drift = float(np.std(frame_means))
    stability = float(np.clip(1.0 - (noise / 8.0 + brightness_drift / 22.0), 0.0, 1.0))
    pavement_level = float(np.quantile(background, 0.65))
    lit_mask = background >= (0.78 * pavement_level)
    return CalibrationModel(
        background=background,
        stable_mask=stable_mask,
        lit_mask=lit_mask,
        noise=noise,
        stability=stability,
    )


def _roi_score(image: np.ndarray, roi: tuple[int, int, int, int]) -> float:
    x, y, width, height = roi
    patch = image[y : y + height, x : x + width]
    if patch.size == 0:
        return 0.0
    laplacian = cv2.Laplacian(patch.astype(np.uint8), cv2.CV_32F)
    texture = float(np.std(laplacian))
    luminance = float(np.mean(patch))
    frame_height = image.shape[0]
    texture_score = float(np.clip(1.0 - texture / 28.0, 0.0, 1.0))
    exposure_score = float(np.clip(1.0 - abs(luminance - 140.0) / 140.0, 0.0, 1.0))
    ground_bias = float(np.clip(y / max(1, frame_height), 0.0, 1.0))
    bright_bias = float(np.clip((luminance - 70.0) / 90.0, 0.0, 1.0))
    shadow_frac = float(np.mean(patch < float(np.quantile(image, 0.42))))
    sunlit_score = float(np.clip(1.0 - shadow_frac, 0.0, 1.0))
    return (
        0.18 * texture_score
        + 0.12 * exposure_score
        + 0.14 * ground_bias
        + 0.12 * bright_bias
        + 0.44 * sunlit_score
    )


def _edge_contrast(image: np.ndarray, edge: tuple[int, int, int, int]) -> float:
    height, width = image.shape[:2]
    mid_x = int((edge[0] + edge[2]) / 2)
    pad = 14
    left = image[:, max(0, mid_x - pad) : max(1, mid_x)]
    right = image[:, mid_x : min(width, mid_x + pad)]
    if left.size == 0 or right.size == 0:
        return 0.0
    return float(np.clip(abs(float(np.mean(left)) - float(np.mean(right))) / 70.0, 0.0, 1.0))


def los_band(
    roi: tuple[int, int, int, int],
    frame_height: int,
    edge: tuple[int, int, int, int] | None = None,
) -> tuple[int, int, int, int]:
    """Broad upper entry zone for anonymous walker/foreground onset.

    A main camera is intentionally framed wide enough to show the corner,
    the pavement shadow path, and a walker after they clear the corner.  The
    upper half is a useful conservative entry zone: it sees the upper body as
    it becomes visible while remaining largely separate from the lower
    pavement-shadow ROI.
    """
    x, _y, width, _height = roi
    band_h = max(32, int(frame_height * 0.50))
    if edge is not None:
        edge_x = int((edge[0] + edge[2]) / 2)
        x0 = min(x, edge_x)
        x1 = max(x + width, edge_x + 24)
        return (max(0, x0), 0, max(32, x1 - x0), band_h)
    return (x, 0, width, band_h)


def detect_corner_and_roi(background: np.ndarray, stability: float) -> SceneAssessment:
    """Find a vertical corner edge and a pavement patch for cast-shadow tracking.

    The method returns no coverage when it cannot make a defensible automatic
    choice. It never substitutes a manual rectangle.
    """

    image = background.astype(np.uint8)
    height, width = image.shape[:2]
    edges = cv2.Canny(image, 45, 140)
    lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi / 180,
        threshold=max(30, height // 5),
        minLineLength=max(40, height // 3),
        maxLineGap=18,
    )
    candidates: list[tuple[float, tuple[int, int, int, int]]] = []
    if lines is not None:
        for raw in lines[:, 0]:
            x1, y1, x2, y2 = (int(value) for value in raw)
            dx, dy = x2 - x1, y2 - y1
            length = float(np.hypot(dx, dy))
            verticality = abs(dy) / (length + 1e-6)
            centrality = 1.0 - abs(((x1 + x2) / 2) - width / 2) / (width / 2)
            edge = (x1, y1, x2, y2)
            contrast = _edge_contrast(image, edge)
            score = (
                0.42 * min(1.0, length / (height * 0.75))
                + 0.18 * verticality
                + 0.08 * centrality
                + 0.32 * contrast
            )
            if verticality > 0.82:
                candidates.append((score, edge))
    if not candidates:
        return SceneAssessment(None, None, 0.0, 0.0, 0.0, ["No stable corner-like edge found"])

    edge_score, edge = max(candidates, key=lambda item: item[0])
    edge_x = int((edge[0] + edge[2]) / 2)
    candidate_rois: list[tuple[float, tuple[int, int, int, int]]] = []
    patch_width = max(44, int(width * 0.28))
    for y_frac in (0.50, 0.58):
        y = max(0, int(height * y_frac))
        patch_height = min(max(44, int(height * 0.38)), height - y)
        if patch_height < 32:
            continue
        for side in (-1, 1):
            for inset in (8, int(patch_width * 0.4), int(patch_width * 0.8), int(patch_width * 1.15)):
                x = edge_x + inset if side == 1 else edge_x - patch_width - inset
                x = max(0, min(x, width - patch_width))
                roi = (x, y, patch_width, patch_height)
                candidate_rois.append((_roi_score(image, roi), roi))
        for x in (int(width * 0.40), int(width * 0.52), int(width * 0.64)):
            x = max(0, min(x, width - patch_width))
            candidate_rois.append((_roi_score(image, (x, y, patch_width, patch_height)), (x, y, patch_width, patch_height)))
    if not candidate_rois:
        return SceneAssessment(edge, None, edge_score, 0.0, 0.0, ["No pavement patch could be placed"])
    roi_score, roi = max(candidate_rois, key=lambda item: item[0])
    coverage = float(np.clip(0.50 * edge_score + 0.28 * roi_score + 0.22 * stability, 0.0, 1.0))
    reasons: list[str] = []
    if edge_score < 0.55:
        reasons.append("Corner edge is weak or too short")
    if roi_score < 0.38:
        reasons.append("Visible-side region is too dark, busy, or reflective")
    if stability < 0.52:
        reasons.append("Calibration contains camera movement or changing exposure")
    if not reasons:
        reasons.append("Automatic corner and pavement region selected")
    else:
        coverage = min(coverage, 0.43)
    return SceneAssessment(edge, roi, edge_score, roi_score, coverage, reasons)


def normalised_residual(frame: np.ndarray, calibration: CalibrationModel) -> np.ndarray:
    current = grayscale(frame)
    reference = calibration.background
    mask = calibration.stable_mask
    reference_level = float(np.median(reference[mask]))
    current_level = float(np.median(current[mask]))
    gain = current_level / max(reference_level, 1.0)
    corrected = current / max(gain, 0.15)
    residual = cv2.GaussianBlur(corrected - reference, (0, 0), 1.3)
    return residual


def extract_temporal_signal(
    frames: list[np.ndarray],
    calibration: CalibrationModel,
    roi: tuple[int, int, int, int],
    edge: tuple[int, int, int, int] | None = None,
) -> list[dict[str, float | np.ndarray]]:
    x, y, width, height = roi
    lx, ly, lw, lh = los_band(roi, frames[0].shape[0], edge)
    signal: list[dict[str, float | np.ndarray]] = []
    prior_patch: np.ndarray | None = None
    for frame in frames:
        residual = normalised_residual(frame, calibration)
        patch = residual[y : y + height, x : x + width]
        person = residual[ly : ly + lh, lx : lx + lw]
        lit = calibration.lit_mask[y : y + height, x : x + width]
        darkness = np.maximum(-patch, 0.0)
        if lit.shape == darkness.shape:
            darkness = np.where(lit, darkness, 0.0)
        energy = float(darkness[lit].mean()) if lit.any() else 0.0
        los_energy = float(np.mean(np.maximum(-person, 0.0))) if person.size else 0.0
        weights = darkness**1.35
        total = float(weights.sum())
        if total > 1e-4:
            yy, xx = np.indices(weights.shape)
            position = float(np.clip((yy * weights).sum() / (total * max(1, height - 1)), 0.0, 1.0))
            lateral = float((xx * weights).sum() / (total * max(1, width - 1)))
        else:
            position, lateral = 0.5, 0.5
        if prior_patch is None:
            coherence = 0.5
        else:
            first, second = patch.ravel(), prior_patch.ravel()
            denominator = float(np.linalg.norm(first) * np.linalg.norm(second))
            coherence = float(np.clip(abs(np.dot(first, second)) / (denominator + 1e-6), 0.0, 1.0))
        signal.append(
            {
                "energy": energy,
                "los_energy": los_energy,
                "position": position,
                "lateral": lateral,
                "coherence": coherence,
                "residual": patch,
            }
        )
        prior_patch = patch
    return signal


def find_aruco_track_labels(path: Path) -> list[dict[str, float | bool]]:
    """Extract coarse position from a controlled ground-truth camera.

    Marker 10 denotes the corner-side endpoint and marker 11 the far endpoint.
    The moving target is the largest foreground blob between the markers.
    """

    frames, timestamps, _ = read_frames(path, target_fps=10, resize_width=480)
    aruco = cv2.aruco  # type: ignore[attr-defined]
    dictionary = aruco.getPredefinedDictionary(aruco.DICT_4X4_50)
    detector = aruco.ArucoDetector(dictionary) if hasattr(aruco, "ArucoDetector") else None
    subtractor = cv2.createBackgroundSubtractorMOG2(history=24, varThreshold=24, detectShadows=False)
    labels: list[dict[str, float | bool]] = []
    marker_centres: dict[int, np.ndarray] = {}
    for index, frame in enumerate(frames):
        marker_centres = {}
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        if detector is not None:
            corners, ids, _ = detector.detectMarkers(gray)
        else:
            corners, ids, _ = aruco.detectMarkers(gray, dictionary)
        if ids is not None:
            for marker_corners, marker_id in zip(corners, ids.flatten(), strict=False):
                if int(marker_id) in {10, 11}:
                    marker_centres[int(marker_id)] = marker_corners.reshape(-1, 2).mean(axis=0)
        foreground = subtractor.apply(frame)
        foreground = cv2.morphologyEx(foreground, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        contours, _ = cv2.findContours(foreground, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        candidates = [contour for contour in contours if cv2.contourArea(contour) > frame.shape[0] * frame.shape[1] * 0.002]
        valid = (
            index >= 24
            and 10 in marker_centres and 11 in marker_centres
            and float(np.linalg.norm(marker_centres[11] - marker_centres[10])) > 20
        )
        present = bool(candidates and valid)
        position = 0.5
        if present:
            contour = max(candidates, key=cv2.contourArea)
            moments = cv2.moments(contour)
            if moments["m00"]:
                point = np.array([moments["m10"] / moments["m00"], moments["m01"] / moments["m00"]])
                start, end = marker_centres[10], marker_centres[11]
                vector = end - start
                position = float(np.clip(np.dot(point - start, vector) / (np.dot(vector, vector) + 1e-6), 0.0, 1.0))
        labels.append({"timestamp_s": timestamps[index], "position_norm": position, "present": present, "valid": bool(valid)})
    return labels


def find_person_track_labels(path: Path) -> list[dict[str, float | bool]]:
    """Label a walker facing the camera when ArUco 10/11 are absent.

    Larger apparent height means closer to the camera / corner.
    """

    frames, timestamps, _ = read_frames(path, target_fps=10, resize_width=480)
    subtractor = cv2.createBackgroundSubtractorMOG2(history=18, varThreshold=20, detectShadows=False)
    labels: list[dict[str, float | bool]] = []
    for index, frame in enumerate(frames):
        foreground = subtractor.apply(frame)
        foreground = cv2.morphologyEx(foreground, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
        contours, _ = cv2.findContours(foreground, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        height, width = frame.shape[:2]
        min_area = height * width * 0.004
        people = []
        for contour in contours:
            if cv2.contourArea(contour) < min_area:
                continue
            x, y, box_w, box_h = cv2.boundingRect(contour)
            if box_h < box_w * 1.15 or box_h < height * 0.12:
                continue
            people.append((box_h, y + box_h))
        valid = index >= 12
        present = bool(people and valid)
        position = 0.5
        if present:
            box_h, _foot = max(people, key=lambda item: item[0])
            position = float(np.clip((box_h / height - 0.12) / 0.70, 0.0, 1.0))
        labels.append(
            {
                "timestamp_s": timestamps[index],
                "position_norm": position,
                "present": present,
                "valid": valid and present,
            }
        )
    return labels


def load_ground_truth(path: Path) -> tuple[list[dict[str, float | bool]], dict[str, Any]]:
    """Prefer a synthetic fixture's labels; otherwise auto-label marker or person footage."""

    sibling = path.with_name("ground_truth.csv")
    if sibling.exists():
        with sibling.open(newline="", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
        labels = [
            {
                "timestamp_s": float(row["timestamp_s"]),
                "position_norm": float(row["position_norm"]),
                "present": row["present"].lower() == "true",
            }
            for row in rows
        ]
        return labels, {"method": "synthetic_clock", "offset_s": 0.0, "confidence": 1.0}
    marker_labels = find_aruco_track_labels(path)
    marker_usable = sum(bool(label.get("valid")) for label in marker_labels)
    if marker_usable:
        return marker_labels, {
            "method": "aruco_foreground",
            "offset_s": 0.0,
            "confidence": 0.65,
            "valid_samples": marker_usable,
            "label_limitations": "Automatic foreground estimates require visual review; stationary targets may be missed.",
        }
    person_labels = find_person_track_labels(path)
    person_usable = sum(bool(label.get("valid")) for label in person_labels)
    return person_labels, {
        "method": "person_foreground",
        "offset_s": 0.0,
        "confidence": 0.5 if person_usable else 0.0,
        "valid_samples": person_usable,
        "label_limitations": "No ArUco 10/11; person blob height is a coarse distance proxy and needs review.",
    }
