"""Causal, uncalibrated shadow-source zones behind a visible wall edge.

Back-projecting a cast shadow's image axis supplies a source *ray*, not the
hidden person's distance along it. The dot marks a coarse near-corner zone on
that ray. It is not a recovered body position, identity, pose or metric track.
"""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np

from .vision import CalibrationModel, align_to_reference, grayscale


def shadow_source_zone(
    mask: np.ndarray,
    edge: tuple[int, int, int, int],
    visible_side: int,
) -> dict[str, Any] | None:
    """Intersect an observed elongated ground shadow with a verified wall edge."""
    height, width = mask.shape
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8))
    candidates: list[tuple[float, dict[str, Any]]] = []
    ex, ey, ex1, ey1 = edge
    if abs(ey1 - ey) < height * 0.25:
        return None
    slope = (ex1 - ex) / (ey1 - ey)
    for component in range(1, count):
        x, y, bw, bh, area = (int(v) for v in stats[component])
        if area < max(45, mask.size * 0.0004) or area > mask.size * 0.12:
            continue
        yy, xx = np.where(labels == component)
        points = np.column_stack([xx, yy]).astype(np.float32)
        centre = points.mean(axis=0)
        covariance = np.cov(points, rowvar=False)
        eigenvalues, eigenvectors = np.linalg.eigh(covariance)
        if eigenvalues[1] < 30 or eigenvalues[1] < eigenvalues[0] * 4:
            continue
        axis = eigenvectors[:, 1]
        if axis[0] * visible_side < 0:
            axis = -axis
        denominator = axis[0] - slope * axis[1]
        if abs(axis[0]) < 0.25 or abs(denominator) < 0.25:
            continue
        distance = (ex + slope * (centre[1] - ey) - centre[0]) / denominator
        intersection = centre + distance * axis
        nearest_wall = float(np.min((xx - (ex + slope * (yy - ey))) * visible_side))
        if nearest_wall < -4 or nearest_wall > width * 0.20 or distance > 0:
            continue
        if not height * 0.40 <= intersection[1] <= height * 0.96:
            continue
        # Depth along the hidden ray is unknowable without light/camera/ground
        # calibration. Use a fixed near-corner zone, never a fitted gait or a
        # path normalized by the eventual body-entry frame.
        near, far = width * 0.02, width * 0.12
        point = intersection - axis * ((near + far) / 2)
        if not (0 <= point[0] < width and 0 <= point[1] < height):
            continue
        zone = {
            "position_norm": [float(point[0] / width), float(point[1] / height)],
            "wall_intersection_norm": [float(intersection[0] / width), float(intersection[1] / height)],
            "uncertainty_norm": [float((far - near) / (2 * width)), float(max(8, np.sqrt(eigenvalues[0]) * 2) / height)],
            "angle_deg": float(np.degrees(np.arctan2(axis[1], axis[0]))),
            "shadow_box": [x, y, bw, bh],
        }
        candidates.append((area / (1 + nearest_wall / 30), zone))
    return max(candidates, key=lambda item: item[0])[1] if candidates else None


def estimate_hidden_shadow_source(
    frames: list[np.ndarray],
    timestamps: list[float],
    calibration: CalibrationModel,
    roi: tuple[int, int, int, int],
    edge: tuple[int, int, int, int] | None,
    body_onset: float | None,
) -> dict[str, Any]:
    """Observe source zones using current/past frames, with no held missing dot.

    The empty opening initializes a fixed photometric baseline. This recorded
    experiment does not require a future body appearance or a reference video.
    """
    result: dict[str, Any] = {
        "method": "shadow_axis_source_zone_v1",
        "status": "unavailable",
        "calibrated": False,
        "basis": "observed cast-shadow axis back-projected across a static wall edge",
        "assumptions": [
            "One dominant cast shadow on approximately flat ground",
            "The selected vertical edge is the actual occluder",
            "Near-corner depth is a display prior, not a measured distance",
        ],
        "uncertainty_kind": "Display source zone, not a calibrated confidence interval",
        "limitation": "Coarse near-corner source zone only. Distance along the hidden ray is not measured; this is not confirmed person detection.",
        "samples": [],
    }
    if not frames or edge is None or calibration.stability < 0.52:
        result["reason"] = "No reliable static wall geometry or empty calibration"
        return result
    height, width = calibration.background.shape
    ex, ey, ex1, ey1 = edge
    if abs(ey1 - ey) < height * 0.25 or abs(ex1 - ex) > abs(ey1 - ey) * 0.3:
        result["reason"] = "No upright occluding wall edge"
        return result
    edge_x = int((ex + ex1) / 2)
    pad = max(12, int(width * 0.05))
    if not pad + 4 <= edge_x < width - pad - 4:
        result["reason"] = "Wall is too close to the image border"
        return result
    top, bottom = int(height * 0.12), int(height * 0.65)
    left = calibration.background[top:bottom, edge_x - pad:edge_x - 4].mean(axis=1)
    right = calibration.background[top:bottom, edge_x + 4:edge_x + pad].mean(axis=1)
    if float(np.mean(np.abs(left - right))) < 12:
        result["reason"] = "Vertical edge lacks broad wall-side contrast"
        return result
    rx, ry, rw, rh = roi
    visible_side = 1 if rx + rw / 2 > edge_x else -1
    result["wall_edge"] = list(edge)
    result["visible_side"] = visible_side
    registered = [align_to_reference(frame, calibration.background) for frame in frames]
    gray = [cv2.GaussianBlur(grayscale(frame), (3, 3), 0) for frame in registered]
    baseline_count = min(18, len(gray))
    opening = np.stack(gray[:baseline_count])
    reference = np.median(opening, axis=0)
    noise = np.std(opening, axis=0)
    threshold = np.maximum(7.0, noise * 3.5)
    usable = (reference > 15) & (reference < 225) & (noise < 5)
    ground = np.zeros_like(reference, dtype=bool)
    x0 = max(0, min(edge_x, rx) - int(width * 0.05))
    x1 = min(width, max(edge_x, rx + rw) + int(width * 0.05))
    y0, y1 = max(int(height * 0.48), ry - int(height * 0.08)), min(height, ry + rh + int(height * 0.05))
    ground[y0:y1, x0:x1] = True
    yy, xx = np.indices(reference.shape)
    wall_x = ex + (yy - ey) * (ex1 - ex) / (ey1 - ey)
    ground &= ((xx - wall_x) * visible_side >= 3) & (reference > 25) & (noise < 7)
    previous: np.ndarray | None = None
    confirmations = 0
    for index, (current, timestamp) in enumerate(zip(gray, timestamps, strict=True)):
        sample: dict[str, Any] = {"frame_index": index, "timestamp_s": round(timestamp, 3), "position_norm": None}
        if index < baseline_count or (body_onset is not None and timestamp >= body_onset) or np.count_nonzero(usable) < 32:
            result["samples"].append(sample)
            previous, confirmations = None, 0
            continue
        bg, observed = reference[usable], current[usable]
        bg_low, bg_high = np.percentile(bg, [20, 80])
        cur_low, cur_high = np.percentile(observed, [20, 80])
        gain = float(np.clip((cur_high - cur_low) / max(bg_high - bg_low, 1), 0.5, 2.0)) if bg_high - bg_low > 8 else 1.0
        offset = float(np.median(observed - gain * bg))
        residual = (current - offset) / gain - reference
        dark = ((residual < -threshold) & ground).astype(np.uint8)
        bright_edges = cv2.dilate((residual > threshold).astype(np.uint8), np.ones((5, 5), np.uint8))
        dark[bright_edges > 0] = 0
        dark = cv2.morphologyEx(dark, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        dark = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        zone = shadow_source_zone(dark, edge, visible_side) if np.mean(np.abs(residual) > threshold) < 0.35 else None
        if zone is None:
            previous, confirmations = None, 0
        else:
            point = np.asarray(zone["position_norm"])
            nearby = previous is not None and np.linalg.norm((point - previous) * [width, height]) < width * 0.08
            confirmations = confirmations + 1 if nearby else 1
            # Causal smoothing only; never force forward motion or bridge gaps.
            point = point * 0.55 + previous * 0.45 if nearby else point
            previous = point
            if confirmations >= 2:
                sample.update(zone)
                sample["position_norm"] = [round(float(value), 5) for value in point]
                result["status"] = "estimated"
        result["samples"].append(sample)
    if result["status"] != "estimated":
        result["reason"] = "No persistent elongated shadow supports a hidden source zone"
    return result
