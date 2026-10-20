"""Controlled image tests: mechanism checks, never field-accuracy claims."""

import cv2
import numpy as np
import pytest

from umbra.parking import ParkingTracker
from umbra.parking_evidence import ParkingEvidence
from umbra.parking_shadow import GroundShadowMonitor


def ground():
    rng = np.random.default_rng(42)
    pixels = rng.integers(75, 200, (270, 480, 1), dtype=np.uint8)
    return np.repeat(pixels, 3, axis=2)


def shaded(image, x, y=210, angle=0, solid=False):
    mask = np.zeros(image.shape[:2], np.uint8)
    cv2.ellipse(mask, (x, y), (34, 11), angle, 0, 360, 1, -1)
    result = image.copy()
    result[mask > 0] = 45 if solid else (result[mask > 0] * 0.58).astype(np.uint8)
    return result


def warm(monitor, image):
    for i in range(12):
        result = monitor.update(image, [], i * 0.2, np.float64([[1, 0, 0], [0, 1, 0]]), True)
    assert result["state"] == "watching"


def test_indirect_warning_precedes_any_visible_detection_without_manual_reference():
    image = ground()
    tracker = ParkingTracker()
    for i in range(12):
        result = tracker.update(image, [], 1 + i * 0.2)
    assert result["shadow"]["state"] == "watching"
    for i in range(5):
        result = tracker.update(shaded(image, 120 + i * 9, angle=65), [], 4 + i * 0.2)
    assert result["state"] == "shadow_cue"
    assert result["detections"] == []
    cue = result["shadow"]["cues"][0]
    assert cue["texture_correlation"] > 0.8
    assert cue["direction"] == "rightward" and cue["source"] == "unconfirmed"
    assert len(cue["contour"]) >= 3
    event = result["evidence"]["episodes"][0]
    assert event["warning_s"] > cue["observed_since_s"]
    assert event["visible_road_users_at_warning"] == 0
    assert event["lead_s"] is None  # No invented ground truth.
    assert tracker.update(image, [], 5.2)["state"] == "observing"


def test_uniform_brightness_and_white_balance_changes_are_not_moving_shadows():
    image = ground()
    monitor = GroundShadowMonitor()
    warm(monitor, image)
    for i in range(5):
        altered = np.clip(image * [0.8 + i * 0.025, 0.9, 1.1], 0, 255).astype(np.uint8)
        assert not monitor.update(altered, [], 3 + i * 0.2, None, True)["cues"]


@pytest.mark.parametrize("solid,stationary", [(True, False), (False, True)])
def test_plain_dark_objects_and_stationary_shadows_do_not_trigger(solid, stationary):
    image = ground()
    monitor = GroundShadowMonitor()
    warm(monitor, image)
    for i in range(6):
        result = monitor.update(shaded(image, 120 if stationary else 120 + i * 9, solid=solid), [], 3 + i * 0.2, None, True)
        assert result["cues"] == []


def test_visible_object_exclusion_and_selected_ground_side():
    image = ground()
    monitor = GroundShadowMonitor()
    monitor.set_zone("right")
    warm(monitor, image)
    for i in range(5):
        assert not monitor.update(shaded(image, 120 + i * 9), [], 3 + i * 0.2, None, True)["cues"]
    monitor.set_zone("ground")
    warm(monitor, image)
    for i in range(5):
        result = monitor.update(shaded(image, 120 + i * 9), [{"box": [0.1, 0.6, 0.4, 0.35]}], 3 + i * 0.2, None, True)
        assert result["cues"] == []
    with pytest.raises(ValueError):
        monitor.set_zone("wrong")


def test_parked_cars_do_not_prevent_automatic_ground_reference():
    monitor = GroundShadowMonitor()
    image = ground()
    for i in range(12):
        result = monitor.update(image, [{"label": "car", "box": [0, .4, .25, .5], "velocity": [0, 0]}], i * .2, None, True)
    assert result["state"] == "watching"


def test_movement_accumulates_and_unreliable_motion_disables_indirect_warnings():
    image = ground()
    monitor = GroundShadowMonitor()
    warm(monitor, image)
    for i in range(6):
        result = monitor.update(image, [], 3 + i * 0.2, np.float64([[1, 0, .5], [0, 1, 0]]), True)
    assert result["state"] == "camera_moved" and not result["cues"]
    assert monitor.reference is None
    assert monitor.update(image, [], 5, np.float64([[1, 0, 0], [0, 1, 0]]), False)["state"] == "unstable"


def test_multiple_cues_keep_separate_histories_and_all_clear_on_missing_signal():
    image = ground()
    monitor = GroundShadowMonitor()
    warm(monitor, image)
    for i in range(5):
        result = monitor.update(shaded(shaded(image, 90 + i * 8), 390 - i * 8, y=155), [], 3 + i * .2, None, True)
    assert len(result["cues"]) == 2
    assert {cue["side"] for cue in result["cues"]} == {"left", "right"}
    assert monitor.update(image, [], 4.2, None, True)["cues"] == []


def test_evidence_requires_manual_labels_and_counts_negative_leads_and_unrelated_cues():
    evidence = ParkingEvidence()
    shadow = {"cues": [{"id": 1, "side": "left", "observed_since_s": 8}]}
    evidence.update(shadow, 10, [])
    evidence.update(shadow, 10.4, [])
    assert len(evidence.snapshot()["episodes"]) == 1
    evidence.update({"cues": []}, 11.5, [])
    evidence.update(shadow, 12, [])
    evidence.update({"cues": [{"id": 2, "side": "right", "observed_since_s": 13}]}, 14, [])
    segment = evidence.segment_id
    evidence.review(1, "first_visible", 11, 15, segment)
    evidence.review(2, "first_visible", 11.5, 15, segment)
    result = evidence.review(3, "unrelated", None, 15, segment)
    assert result["summary"]["early_warnings"] == 1
    assert result["summary"]["reviewed_approaches"] == 2
    assert result["summary"]["unrelated_cues"] == 1
    assert result["summary"]["median_lead_s"] == 0.25
    with pytest.raises(ValueError):
        evidence.review(1, "first_visible", 80, 15, segment)
    with pytest.raises(ValueError):
        evidence.review(1, "first_visible", 11, 15, "old-segment")
    assert evidence.review(1, "unreviewed", None, 15, segment)["episodes"][0]["lead_s"] is None


def test_playback_seek_clears_reference_and_uses_new_evidence_segment():
    tracker = ParkingTracker()
    image = ground()
    first = tracker.update(image, [], 10)["evidence"]["segment_id"]
    assert tracker.update(image, [], 1)["evidence"]["segment_id"] != first
