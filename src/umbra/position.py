"""A saved camera/route/light mapping learned from a separate visible walk.

Calibration may use a complete recorded walk. Deployment is causal: each live
estimate uses only that previously saved mapping and the current/past frames.
This is empirical image-space calibration, not recovery of physical lamp height.
"""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np

from .body import night_body_tracks, upright_foreground_box
from .vision import CalibrationModel, align_to_reference, grayscale


def opening_reference(frames: list[np.ndarray], calibration: CalibrationModel) -> tuple[np.ndarray, np.ndarray]:
    if len(frames) < 8:
        raise ValueError("At least eight empty opening samples are required")
    opening = np.stack([
        cv2.GaussianBlur(grayscale(align_to_reference(frame, calibration.background)), (3, 3), 0)
        for frame in frames[:18]
    ])
    return np.median(opening, axis=0), np.std(opening, axis=0)


def foreground_residual(frame: np.ndarray, reference: np.ndarray, noise: np.ndarray) -> np.ndarray:
    current = cv2.GaussianBlur(grayscale(frame), (3, 3), 0)
    usable = (reference > 15) & (reference < 225) & (noise < 5)
    if np.count_nonzero(usable) < 32:
        raise ValueError("The saved empty view has insufficient stable light")
    bg, observed = reference[usable], current[usable]
    bg_low, bg_high = np.percentile(bg, [20, 80])
    cur_low, cur_high = np.percentile(observed, [20, 80])
    gain = float(np.clip((cur_high - cur_low) / max(bg_high - bg_low, 1), 0.5, 2.0)) if bg_high - bg_low > 8 else 1.0
    offset = float(np.median(observed - gain * bg))
    return (current - offset) / gain - reference


def observed_shadow_tip(
    residual: np.ndarray, reference: np.ndarray, noise: np.ndarray,
    model: dict[str, Any], body: tuple[int, int, int, int] | None = None,
) -> dict[str, Any] | None:
    """Measure the uncut far end of one elongated ground-shadow component.

    The end must be visible, not clipped by the image or search region. A
    centroid or wall intersection is not interchangeable with this feature.
    """
    height, width = reference.shape
    threshold = np.maximum(7, noise * 3.5)
    mask = ((residual < -threshold) & (reference > 25) & (noise < 7)).astype(np.uint8)
    ground_y = int(model["ground_y_norm"] * height)
    mask[:ground_y] = 0
    edge = np.asarray(model["wall_edge_norm"]) * [width, height, width, height]
    ex, ey, ex1, ey1 = edge
    yy, xx = np.indices(mask.shape)
    wall_x = ex + (yy - ey) * (ex1 - ex) / max(abs(ey1 - ey), 1) * (1 if ey1 >= ey else -1)
    side = model["visible_side"]
    mask[(xx - wall_x) * side < 3] = 0
    bright = cv2.dilate((residual > threshold).astype(np.uint8), np.ones((5, 5), np.uint8))
    mask[bright > 0] = 0
    if body:
        bx, by, bw, bh = body
        mask[:min(height, by + bh + 2), max(0, bx - 4):min(width, bx + bw + 4)] = 0
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
    candidates: list[tuple[float, dict[str, Any]]] = []
    for component in range(1, count):
        x, y, bw, bh, area = (int(v) for v in stats[component])
        if area < max(60, mask.size * 0.00045) or area > mask.size * 0.16:
            continue
        if (side > 0 and x + bw >= width - 1) or (side < 0 and x <= 1) or y + bh >= height - 1:
            continue  # censored tips must not train or drive the mapping
        ys, xs = np.where(labels == component)
        covariance = np.cov(np.column_stack([xs, ys]), rowvar=False)
        values = np.linalg.eigvalsh(covariance)
        if values[1] < max(25, values[0] * 3):
            continue
        if body:
            bx, by, bw_body, bh_body = body
            if y + bh < by + bh_body - height * 0.10:
                continue
            near_foot = np.min(np.hypot(xs - (bx + bw_body / 2), ys - (by + bh_body)))
            if near_foot > height * 0.30:
                continue
        signed = xs * side
        tip_slice = signed >= np.percentile(signed, 90)
        tip_x = float(np.percentile(signed, 95) * side)
        tip_y = float(np.mean(ys[tip_slice]))
        candidates.append((float(area), {
            "tip": [tip_x / width, tip_y / width],
            "shadow_box": [x, y, bw, bh],
        }))
    return max(candidates, key=lambda item: item[0])[1] if candidates else None


def fit_position_mapping(tips: np.ndarray, bodies: np.ndarray, width: int, height: int) -> dict[str, Any]:
    """Fit only the observed one-dimensional route; reject weak visible pairs."""
    if len(tips) < 5 or len(bodies) != len(tips):
        raise ValueError("Need at least five visible body/shadow pairs with an unclipped shadow tip. Use a wider view or a longer calibration walk.")
    origin = tips.mean(axis=0)
    _, _, vectors = np.linalg.svd(tips - origin, full_matrices=False)
    axis = vectors[0]
    if axis[0] < 0:
        axis = -axis
    coordinate = (tips - origin) @ axis
    span = float(np.ptp(coordinate))
    body_span = float(np.ptp(bodies[:, 0]))
    if span < 0.12 or body_span < 0.06:
        raise ValueError("Calibration walk has too little visible movement; include more of the person and shadow")
    design = np.column_stack([np.ones(len(coordinate)), coordinate])
    coefficients = np.linalg.lstsq(design, bodies, rcond=None)[0]
    errors = (design @ coefficients - bodies)[:, :2] * [width, height]
    error_px = float(np.sqrt(np.mean(np.sum(errors**2, axis=1))))
    held_errors = []
    for i in range(len(tips)):
        keep = np.arange(len(tips)) != i
        fitted = np.linalg.lstsq(design[keep], bodies[keep], rcond=None)[0]
        held_errors.append((design[i] @ fitted - bodies[i])[:2] * [width, height])
    loo_px = float(np.sqrt(np.mean(np.sum(np.asarray(held_errors)**2, axis=1))))
    if error_px > width * 0.025 or loo_px > width * 0.035:
        raise ValueError("Visible body/shadow pairs do not support a repeatable mapping. Check for multiple lights, clipping, or an incorrect body track.")
    perpendicular = tips - origin - coordinate[:, None] * axis
    return {
        "tip_origin": origin.tolist(), "tip_axis": axis.tolist(),
        "coefficients": coefficients.tolist(), "tip_range": [float(coordinate.min()), float(coordinate.max())],
        "perpendicular_tolerance": max(0.018, float(np.max(np.linalg.norm(perpendicular, axis=1))) * 2),
        "fit_error_px": round(error_px, 3), "internal_check_error_px": round(loo_px, 3),
        "pair_count": len(tips), "body_height_norm": float(np.median(bodies[:, 2])),
        "max_extrapolation_spans": 1.6,
    }


def calibrate_position(
    frames: list[np.ndarray], timestamps: list[float], calibration: CalibrationModel,
    edge: tuple[int, int, int, int], roi: tuple[int, int, int, int],
) -> tuple[dict[str, Any], np.ndarray, np.ndarray]:
    height, width = calibration.background.shape
    if calibration.stability < 0.52 or abs(edge[3] - edge[1]) < height * 0.25:
        raise ValueError("A stable empty view and a clear wall edge are required")
    reference, noise = opening_reference(frames, calibration)
    model: dict[str, Any] = {
        "method": "saved_shadow_body_mapping_v1", "aspect_ratio": width / height,
        "wall_edge_norm": (np.asarray(edge) / [width, height, width, height]).tolist(),
        "visible_side": 1 if roi[0] + roi[2] / 2 > (edge[0] + edge[2]) / 2 else -1,
        "ground_y_norm": 0.50,
        "limitation": "Experimental camera/route/light-specific mapping from a prior visible walk. On-screen body height only; no physical lamp height or independent field accuracy is established.",
        "assumptions": "Same fixed camera, dominant light, walking route and approximately similar person height; complete shadow tip visible",
    }
    boxes = night_body_tracks(frames, calibration)
    tips, bodies, pairs = [], [], []
    for index, (frame, box) in enumerate(zip(frames, boxes, strict=True)):
        if box is None or index < 18:
            continue
        x, y, bw, bh = box
        if x < 2 or x + bw >= width - 2 or y < 2 or y + bh >= height - 2:
            continue
        registered = align_to_reference(frame, calibration.background)
        cue = observed_shadow_tip(foreground_residual(registered, reference, noise), reference, noise, model, box)
        if cue is None:
            if len(tips) >= 5:
                break  # do not resume on a different fragment after the tip clips
            continue
        tips.append(cue["tip"])
        bodies.append([(x + bw / 2) / width, (y + bh * 0.50) / height, bh / height])
        pairs.append({"timestamp_s": round(timestamps[index], 3), "body_box": list(box), "shadow_box": cue["shadow_box"]})
    model.update(fit_position_mapping(np.asarray(tips), np.asarray(bodies), width, height))
    model["pairs"] = pairs
    return model, reference, noise


def map_shadow_to_body(model: dict[str, Any], cue: dict[str, Any]) -> dict[str, Any] | None:
    tip = np.asarray(cue["tip"], dtype=float)
    origin, axis = np.asarray(model["tip_origin"]), np.asarray(model["tip_axis"])
    coordinate = float((tip - origin) @ axis)
    if np.linalg.norm(tip - origin - coordinate * axis) > model["perpendicular_tolerance"]:
        return None
    low, high = model["tip_range"]
    span = max(high - low, 1e-6)
    outside = max(low - coordinate, coordinate - high, 0) / span
    if outside > model["max_extrapolation_spans"]:
        return None
    x, y, body_height = np.asarray([1, coordinate]) @ np.asarray(model["coefficients"])
    if not 0 <= x <= 1 or not 0 <= y <= 1 or not 0.12 <= body_height <= 0.90:
        return None
    ex, ey, ex1, ey1 = model["wall_edge_norm"]
    wall_x = ex + (y - ey) * (ex1 - ex) / (ey1 - ey)
    if (x - wall_x) * model["visible_side"] >= -0.004:
        return None  # a hidden dot may not cross onto the visible side
    error = max(0.018, model["internal_check_error_px"] / 480) * (1 + outside * 2)
    return {
        "position_norm": [float(x), float(y)],
        "uncertainty_norm": [error, error * model["aspect_ratio"]],
        "body_height_norm": float(body_height), "angle_deg": 0.0,
        "shadow_box": cue["shadow_box"], "extrapolated": outside > 0,
    }


class PositionTracker:
    """Identical per-frame estimator for recorded replay and live camera input."""

    def __init__(self, model: dict[str, Any], reference: np.ndarray, noise: np.ndarray) -> None:
        self.model, self.reference, self.noise = model, reference, noise
        self.previous: np.ndarray | None = None
        self.confirmations = 0
        self.body_previous: tuple[int, int, int, int] | None = None
        self.body_confirmations = 0

    def update(self, frame: np.ndarray) -> dict[str, Any]:
        h, w = frame.shape[:2]
        if abs(w / h / self.model["aspect_ratio"] - 1) > 0.025:
            self.previous, self.confirmations = None, 0
            return {"state": "camera_mismatch", "position_norm": None, "reason": "Camera aspect ratio differs from the saved calibration"}
        target_h, target_w = self.reference.shape
        frame = cv2.resize(frame, (target_w, target_h), interpolation=cv2.INTER_AREA)
        frame = align_to_reference(frame, self.reference)
        residual = foreground_residual(frame, self.reference, self.noise)
        threshold = np.maximum(7, self.noise * 3.5)
        foreground = np.abs(residual) > threshold
        if float(np.mean(foreground)) > 0.35:
            self.previous, self.confirmations, self.body_previous, self.body_confirmations = None, 0, None, 0
            return {"state": "camera_mismatch", "position_norm": None, "reason": "Camera view or illumination differs from calibration"}
        body = upright_foreground_box(foreground, self.body_previous)
        if body:
            nearby = self.body_previous is not None and abs(body[0] - self.body_previous[0]) < target_w * 0.15
            self.body_confirmations = self.body_confirmations + 1 if nearby else 1
            self.body_previous = body
        else:
            self.body_previous, self.body_confirmations = None, 0
        if body and self.body_confirmations >= 2:
            self.previous, self.confirmations = None, 0
            return {"state": "body_visible", "position_norm": None, "body_box": [body[0] / target_w, body[1] / target_h, body[2] / target_w, body[3] / target_h]}
        cue = observed_shadow_tip(residual, self.reference, self.noise, self.model, body)
        estimate = map_shadow_to_body(self.model, cue) if cue else None
        if estimate is None:
            self.previous, self.confirmations = None, 0
            return {"state": "watching", "position_norm": None}
        point = np.asarray(estimate["position_norm"])
        nearby = self.previous is not None and np.linalg.norm(point - self.previous) < 0.10
        self.confirmations = self.confirmations + 1 if nearby else 1
        point = point * 0.70 + self.previous * 0.30 if nearby else point
        self.previous = point
        if self.confirmations < 2:
            return {"state": "watching", "position_norm": None}
        estimate["position_norm"] = point.tolist()
        return {"state": "estimated", **estimate}
