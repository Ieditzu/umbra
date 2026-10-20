"""Distance-estimate geometry checks. Exact pinhole fixtures test the maths, not field accuracy."""

import math

import numpy as np
import pytest

from umbra.parking import ParkingTracker
from umbra.parking_distance import CameraGeometry, estimate_distance, smooth_distance

HALF_TAN = math.tan(math.radians(22.5))  # default 45 degree vertical field of view


def person_at(distance, y=0.3, real_height=1.7):
    height = real_height / (distance * 2 * HALF_TAN)
    return {"label": "person", "score": 0.9, "box": [0.4, y, 0.1, height]}


def test_size_cue_gives_a_range_that_includes_children():
    result = estimate_distance(person_at(5), CameraGeometry())
    assert result["method"] == "size" and result["bound"] == "range"
    assert result["estimate_m"] == pytest.approx(5.0)
    # A 1 m child at 2.9 m would produce the same box, so the near bound must allow it.
    assert result["low_m"] == pytest.approx(5 / 1.7, rel=1e-3)
    assert result["high_m"] == pytest.approx(5 * 1.95 / 1.7, rel=1e-3)


def test_wider_lens_makes_the_same_box_closer():
    narrow = estimate_distance(person_at(5), CameraGeometry(vertical_fov_deg=45))
    wide = estimate_distance(person_at(5), CameraGeometry(vertical_fov_deg=90))
    assert wide["estimate_m"] < narrow["estimate_m"]


def test_cut_off_boxes_only_give_an_upper_bound():
    for box in ([0.4, 0.0, 0.1, 0.5], [0.4, 0.6, 0.1, 0.4]):
        result = estimate_distance({"label": "car", "box": box}, CameraGeometry())
        assert result["bound"] == "at_most" and result["low_m"] is None and result["high_m"] > 0


def test_ground_cue_narrows_the_size_range_when_they_agree():
    contact = 0.5 + math.tan(math.atan(1 / 5) - math.radians(5)) / (2 * HALF_TAN)
    detection = person_at(5)
    detection["box"][1] = contact - detection["box"][3]
    geometry = CameraGeometry(height_m=1.0, tilt_deg=5)
    result = estimate_distance(detection, geometry)
    size_only = estimate_distance(detection, CameraGeometry())
    assert result["method"] == "ground+size"
    assert result["estimate_m"] == pytest.approx(5.0, rel=1e-3)
    assert result["low_m"] > size_only["low_m"] and result["high_m"] <= size_only["high_m"]


def test_disagreeing_cues_keep_the_nearer_possibility():
    detection = person_at(20, y=0.05)  # small box, but ground contact low in the frame
    detection["box"][1] = 0.9 - detection["box"][3]
    result = estimate_distance(detection, CameraGeometry(height_m=1.0, tilt_deg=10))
    assert result["method"] == "conflict"
    assert result["low_m"] < 5 < result["high_m"]


def test_contact_near_the_horizon_and_unknown_classes_are_not_estimated():
    detection = {"label": "person", "box": [0.4, 0.2, 0.1, 0.3]}  # contact at mid-frame
    result = estimate_distance(detection, CameraGeometry(height_m=1.0, tilt_deg=0))
    assert result["method"] == "size"  # ground cue refused, size cue kept
    assert estimate_distance({"label": "dog", "box": [0.4, 0.2, 0.1, 0.3]}, CameraGeometry()) is None
    assert estimate_distance(person_at(80), CameraGeometry()) is None  # beyond 40 m


def test_smoothing_blends_matching_bounds_and_resets_on_bound_change():
    previous = {"bound": "range", "low_m": 2.0, "estimate_m": 4.0, "high_m": 8.0, "method": "size"}
    current = {"bound": "range", "low_m": 8.0, "estimate_m": 16.0, "high_m": 32.0, "method": "size"}
    assert smooth_distance(previous, current)["estimate_m"] == pytest.approx(8.0)
    cut = {"bound": "at_most", "low_m": None, "estimate_m": None, "high_m": 3.0, "method": "size"}
    assert smooth_distance(previous, cut) == cut
    assert smooth_distance(previous, None) is None


def test_tracker_attaches_smoothed_distances_and_forgets_them_on_new_settings():
    rng = np.random.default_rng(3)
    image = np.repeat(rng.integers(70, 185, (270, 480, 1), dtype=np.uint8), 3, axis=2)
    tracker = ParkingTracker()
    first = tracker.update(image, [person_at(5)], 1)["detections"][0]["distance"]
    farther = person_at(6)
    farther["box"][1] = 0.3 + person_at(5)["box"][3] - farther["box"][3]  # feet stay put
    second = tracker.update(image, [farther], 1.2)["detections"][0]
    assert first["estimate_m"] == pytest.approx(5.0)
    assert second["age"] == 2 and 5 < second["distance"]["estimate_m"] < 6  # same track, blended
    tracker.set_geometry(CameraGeometry(vertical_fov_deg=90))
    result = tracker.update(image, [person_at(10)], 1.4)
    assert result["camera_geometry"]["vertical_fov_deg"] == 90
    assert result["detections"][0]["distance"]["estimate_m"] == pytest.approx(10 * HALF_TAN / math.tan(math.radians(45)), rel=1e-2)
