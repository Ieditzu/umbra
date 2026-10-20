"""Approximate single-camera distance ranges for visible road users.

Two cues, both assuming an undistorted pinhole camera with a centred optical axis:

- size: the detected class's typical real height divided by its box height;
- ground: the camera's mounting height and downward tilt with the box's ground-contact row.

These are image-based estimates with explicit ranges, not measured range. Unknown lens
distortion, wrong camera settings, partial occlusion (for example a person behind a car)
and unusual object sizes can make an object look farther away than it is.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

# (smallest, typical, largest) real height in metres. People include children.
TYPICAL_HEIGHT_M = {
    "person": (1.0, 1.7, 1.95),
    "bicycle": (0.9, 1.05, 1.2),
    "motorcycle": (1.0, 1.2, 1.5),
    "car": (1.35, 1.5, 1.9),
    "bus": (2.8, 3.2, 3.8),
    "truck": (2.0, 3.0, 4.0),
}
TILT_UNCERTAINTY_DEG = 2.0
MAX_DISTANCE_M = 40.0
EDGE = 0.005  # boxes this close to the frame edge are treated as cut off


@dataclass(frozen=True)
class CameraGeometry:
    vertical_fov_deg: float = 45.0
    height_m: float | None = None  # camera height above the ground; enables the ground cue
    tilt_deg: float = 0.0  # downward tilt of the optical axis from horizontal

    def as_dict(self) -> dict:
        return {"vertical_fov_deg": self.vertical_fov_deg, "height_m": self.height_m, "tilt_deg": self.tilt_deg}


def _size_estimate(label: str, box: list[float], half_tan: float) -> dict | None:
    sizes = TYPICAL_HEIGHT_M.get(label)
    _, y, _, h = box
    if sizes is None or h < 0.01:
        return None
    low, typical, high = (size / (h * 2 * half_tan) for size in sizes)
    if y <= EDGE or y + h >= 1 - EDGE:
        # A cut-off box is shorter than the object, so the object is at most this far.
        return {"bound": "at_most", "low_m": None, "estimate_m": None, "high_m": high, "method": "size"}
    return {"bound": "range", "low_m": low, "estimate_m": typical, "high_m": high, "method": "size"}


def _ground_estimate(box: list[float], geometry: CameraGeometry, half_tan: float) -> dict | None:
    if geometry.height_m is None:
        return None
    contact = box[1] + box[3]
    if contact >= 1 - EDGE:
        return None  # The ground contact is outside the frame.
    below_axis = math.atan((contact - 0.5) * 2 * half_tan)
    angle = math.radians(geometry.tilt_deg) + below_axis
    spread = math.radians(TILT_UNCERTAINTY_DEG)
    if angle - spread <= math.radians(1.0):
        return None  # At or near the horizon, small errors make the range unbounded.
    return {"bound": "range", "method": "ground",
            "low_m": geometry.height_m / math.tan(angle + spread),
            "estimate_m": geometry.height_m / math.tan(angle),
            "high_m": geometry.height_m / math.tan(angle - spread)}


def _combine(size: dict | None, ground: dict | None) -> dict | None:
    if size is None or ground is None:
        return size or ground
    if size["bound"] == "at_most":
        if ground["low_m"] > size["high_m"]:
            return {**size, "method": "conflict"}
        return {**ground, "high_m": min(ground["high_m"], size["high_m"]),
                "estimate_m": min(ground["estimate_m"], size["high_m"]), "method": "ground+size"}
    low, high = max(size["low_m"], ground["low_m"]), min(size["high_m"], ground["high_m"])
    if low <= high:
        estimate = min(max(ground["estimate_m"], low), high)
        return {"bound": "range", "low_m": low, "estimate_m": estimate, "high_m": high, "method": "ground+size"}
    # Disagreeing cues: keep the union so the nearer possibility is never hidden.
    return {"bound": "range", "low_m": min(size["low_m"], ground["low_m"]),
            "estimate_m": min(size["estimate_m"], ground["estimate_m"]),
            "high_m": max(size["high_m"], ground["high_m"]), "method": "conflict"}


def estimate_distance(detection: dict, geometry: CameraGeometry) -> dict | None:
    half_tan = math.tan(math.radians(geometry.vertical_fov_deg) / 2)
    box = detection["box"]
    result = _combine(_size_estimate(detection.get("label", ""), box, half_tan),
                      _ground_estimate(box, geometry, half_tan))
    if result is None or (result["low_m"] or result["high_m"]) > MAX_DISTANCE_M:
        return None
    return result


def smooth_distance(previous: dict | None, current: dict | None, weight: float = 0.5) -> dict | None:
    """Blend a track's estimate with its previous one in log space to reduce jitter."""
    if current is None:
        return None
    if previous is None or previous["bound"] != current["bound"]:
        smoothed = dict(current)
    else:
        smoothed = dict(current)
        for key in ("low_m", "estimate_m", "high_m"):
            if current[key] is not None and previous.get(key) is not None:
                smoothed[key] = math.exp(weight * math.log(current[key]) + (1 - weight) * math.log(previous[key]))
    return {key: round(value, 2) if isinstance(value, float) else value for key, value in smoothed.items()}
