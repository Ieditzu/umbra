"""Method-comparison harness checks. Synthetic frames test scoring mechanics, not field accuracy."""

import json

import cv2
import numpy as np
import pytest

from umbra.parking_eval import (
    GroundChangeBaseline,
    ReplayedTrial,
    compare,
    evaluate_manifest,
    load_manifest,
    replay,
    score_trial,
    warning_episodes,
)


def ground():
    rng = np.random.default_rng(42)
    return np.repeat(rng.integers(75, 200, (270, 480, 1), dtype=np.uint8), 3, axis=2)


def shaded(image, x, y=210):
    mask = np.zeros(image.shape[:2], np.uint8)
    cv2.ellipse(mask, (x, y), (34, 11), 65, 0, 360, 1, -1)
    result = image.copy()
    result[mask > 0] = (result[mask > 0] * 0.58).astype(np.uint8)
    return result


def walker(x):
    return {"label": "person", "score": 0.9, "box": [x, 0.45, 0.12, 0.2]}


def approach_frames():
    """Empty ground, then a moving shadow, then the road user becomes directly visible at 3.4 s."""
    image = ground()
    for i in range(12):
        yield i * 0.2, image, [], 5.0
    for i in range(5):
        yield 2.4 + i * 0.2, shaded(image, 120 + i * 9), [], 5.0
    for i in range(5):
        yield 3.4 + i * 0.2, image, [walker(0.04 + i * 0.04)], 5.0


def relit_empty_frames():
    """No road user; a uniform lighting drop that a plain difference cannot discount."""
    image = ground()
    for i in range(12):
        yield i * 0.2, image, [], 5.0
    darker = (image * 0.75).astype(np.uint8)
    for i in range(8):
        yield 2.4 + i * 0.2, darker, [], 5.0


APPROACH = {"id": "approach", "approach": True, "first_cue_s": 2.4, "first_visible_s": 3.4,
            "clear_s": 4.4, "split": "tune", "tags": ["left"]}
EMPTY = {"id": "empty", "approach": False, "split": "tune", "tags": ["light_change"]}


def records(*steps):
    """Hand-made records: (t, visible score, indirect score)."""
    return [{"t": t, "scores": {"visible": v, "indirect": i, "ground_change": 0.0},
             "available": {"visible": True, "indirect": True, "ground_change": True},
             "ms": {"detector": 4.0, "tracker": 1.0, "ground_change": 0.5}} for t, v, i in steps]


def test_combined_method_warns_before_visibility_while_detector_alone_warns_after():
    data = replay(approach_frames())
    combined = warning_episodes(data, {"thresholds": {"visible": 0.4, "indirect": 0.55}, "persistence": 1})
    visible = warning_episodes(data, {"thresholds": {"visible": 0.4}, "persistence": 1})
    trial_combined = score_trial(APPROACH, data, combined, 0.5)
    trial_visible = score_trial(APPROACH, data, visible, 0.5)
    assert trial_combined["warned"] and trial_combined["warning_time_s"] > 0
    assert trial_visible["warned"] and trial_visible["warning_time_s"] < 0
    assert trial_combined["false_alerts"] == trial_visible["false_alerts"] == 0
    # The first twelve frames only learn references, so no channel claims an estimate there.
    assert not any(record["available"]["indirect"] or record["available"]["ground_change"] for record in data[:11])


def test_lighting_change_is_a_baseline_false_alert_but_not_an_indirect_cue():
    data = replay(relit_empty_frames())
    assert warning_episodes(data, {"thresholds": {"ground_change": 0.08}, "persistence": 1})
    assert not warning_episodes(data, {"thresholds": {"indirect": 0.55}, "persistence": 1})
    outcome = score_trial(EMPTY, data, warning_episodes(data, {"thresholds": {"ground_change": 0.08}, "persistence": 1}), 0.5)
    assert outcome["false_alerts"] == 1 and outcome["exposure_s"] == pytest.approx(4.0)


def test_persistence_delays_onsets_and_brief_gaps_merge_into_one_episode():
    data = records((0, 0, 0), (0.2, 0.9, 0), (0.4, 0, 0), (0.6, 0.9, 0), (0.8, 0.9, 0), (3, 0.9, 0))
    once = warning_episodes(data, {"thresholds": {"visible": 0.5}, "persistence": 1})
    assert [(e["onset_s"], e["end_s"]) for e in once] == [(0.2, 0.8), (3, 3)]
    twice = warning_episodes(data, {"thresholds": {"visible": 0.5}, "persistence": 2})
    assert [e["onset_s"] for e in twice] == [0.8, 3]  # 3 s directly follows 0.8 s


def test_onsets_outside_the_labelled_window_are_false_alerts_and_late_ones_miss():
    data = records(*[(t / 5, 0, 0) for t in range(41)])  # 0..8 s
    early, inside, after = {"onset_s": 0.5, "end_s": 0.6}, {"onset_s": 3.0, "end_s": 3.5}, {"onset_s": 7.5, "end_s": 7.6}
    trial = {**APPROACH, "first_cue_s": None, "first_visible_s": 3.2, "clear_s": 6.0}
    result = score_trial(trial, data, [early, inside, after], 0.5)
    assert result["warned"] and result["warning_time_s"] == 0.2
    assert result["false_alerts"] == 2
    assert result["exposure_s"] == pytest.approx(8.2 - 3.3)
    assert not score_trial(trial, data, [early, after], 0.5)["warned"]


def test_operating_points_are_fixed_on_tuning_trials_and_reported_on_test_trials():
    noisy = records(*[(t / 5, 0.45 if t % 10 == 0 else 0.0, 0) for t in range(60)])
    approach = records(*[(t / 5, 0.85 if 15 <= t <= 20 else 0.0, 0) for t in range(30)])
    tune = [ReplayedTrial(EMPTY, noisy), ReplayedTrial(APPROACH, approach)]
    test = [ReplayedTrial({**EMPTY, "id": "e2", "split": "test"}, noisy),
            ReplayedTrial({**APPROACH, "id": "a2", "split": "test"}, approach)]
    result = compare(tune + test, targets=[0.0], tolerance_s=0.5)
    assert result["reported_split"] == "test" and not result["parameters_selected_on_reported_trials"]
    visible = result["matched"][0]["methods"]["visible"]
    assert visible["point"]["thresholds"]["visible"] > 0.45
    assert visible["false_alerts"] == 0 and visible["warned"] == 1
    assert visible["by_tag"]["left"]["approaches"] == 1
    same = compare(tune, targets=[0.0])
    assert same["parameters_selected_on_reported_trials"]
    with pytest.raises(ValueError, match="tuning"):
        compare(test)


def test_unmatchable_false_alert_target_is_reported_unavailable():
    data = records(*[(t / 5, 0.95, 0) for t in range(20)])
    result = compare([ReplayedTrial(EMPTY, data)], targets=[0.0])
    assert result["matched"][0]["methods"]["visible"]["available"] is False


def test_ground_change_baseline_resets_on_timestamp_reset_and_stale_gap():
    image = ground()
    baseline = GroundChangeBaseline()
    for i in range(12):
        assert baseline.update(image, i * 0.2)["available"] is (i == 11)
    assert not baseline.update(image, 1.0)["available"]  # backward timestamp
    for i in range(11):
        baseline.update(image, 1.2 + i * 0.2)
    assert baseline.update(image, 9.0)["available"] is False  # stale gap


def test_manifest_validation_rejects_inconsistent_labels(tmp_path):
    (tmp_path / "clip.avi").write_bytes(b"x")

    def write(trial):
        path = tmp_path / "manifest.json"
        path.write_text(json.dumps({"trials": [{"id": "t", "video": "clip.avi", **trial}]}))
        return path

    assert load_manifest(write({"approach": False}))["trials"][0]["split"] == "test"
    for bad in [{"approach": True, "first_visible_s": 3},
                {"approach": True, "first_visible_s": 3, "clear_s": 2},
                {"approach": True, "first_visible_s": 3, "clear_s": 5, "first_cue_s": 4},
                {"approach": False, "first_visible_s": 3},
                {"approach": False, "split": "train"},
                {"approach": "yes"}]:
        with pytest.raises(ValueError):
            load_manifest(write(bad))


def test_end_to_end_replay_caches_detector_results(tmp_path):
    video = tmp_path / "empty.avi"
    writer = cv2.VideoWriter(str(video), cv2.VideoWriter_fourcc(*"MJPG"), 5, (480, 270))
    for _ in range(25):
        writer.write(ground())
    writer.release()
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps({"trials": [
        {"id": "tune-empty", "video": "empty.avi", "split": "tune", "approach": False},
        {"id": "test-empty", "video": "empty.avi", "split": "test", "approach": False}]}))
    calls = []

    def detector(frame):
        calls.append(frame.shape)
        return []

    result = evaluate_manifest(manifest, detector, "fake", tmp_path / "cache", max_fps=10)
    assert len(calls) == 50
    assert result["reported_split"] == "test" and result["field_validated"] is False
    assert result["trials"][0]["video"] == "empty.avi"
    combined = result["matched"][0]["methods"]["combined"]
    assert combined["false_alerts"] == 0 and combined["exposure_min"] > 0
    evaluate_manifest(manifest, detector, "fake", tmp_path / "cache", max_fps=10)
    assert len(calls) == 50  # cached
    evaluate_manifest(manifest, detector, "other-model", tmp_path / "cache", max_fps=10)
    assert len(calls) == 100  # model change invalidates the cache
