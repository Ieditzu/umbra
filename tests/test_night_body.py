"""Controlled regressions for low-light body evidence, not field accuracy claims."""

import cv2
import numpy as np

from umbra.body import night_body_tracks, upright_foreground_box
from umbra.reports import _recorded_body_boxes, _sampled_video_fps
from umbra.vision import build_calibration_model


def night_background():
    yy, xx = np.indices((180, 320))
    level = (25 + xx * 0.12 + yy * 0.08).astype(np.uint8)
    return np.stack([level // 2, level, np.minimum(level * 1.5, 255).astype(np.uint8)], axis=2)


def walker(frame, x=125, bright=False):
    image = frame.copy()
    colour = (95, 105, 110) if bright else (7, 8, 9)
    cv2.circle(image, (x + 12, 35), 8, colour, -1)
    cv2.rectangle(image, (x + 4, 45), (x + 24, 92), colour, -1)
    cv2.line(image, (x + 9, 87), (x, 122), colour, 8)
    cv2.line(image, (x + 19, 87), (x + 32, 122), colour, 8)
    return image


def test_upright_core_is_separate_from_a_long_attached_ground_shadow():
    mask = np.zeros((270, 480), dtype=np.uint8)
    mask[35:170, 160:192] = 1
    mask[163:177, 170:430] = 1
    box = upright_foreground_box(mask)
    assert box is not None
    x, y, width, height = box
    assert x <= 160 and y <= 35 and y + height >= 170
    assert x + width < 225


def test_horizontal_shadow_and_ground_noise_are_not_a_body():
    mask = np.zeros((270, 480), dtype=np.uint8)
    mask[130:148, 130:430] = 1
    mask[190:250, 70:95] = 1
    assert upright_foreground_box(mask) is None


def test_thin_exposure_fringe_does_not_extend_the_head_box():
    mask = np.zeros((270, 480), dtype=np.uint8)
    mask[40:170, 160:195] = 1
    mask[20:40, 175:177] = 1
    box = upright_foreground_box(mask)
    assert box is not None and box[1] >= 38


def test_dark_walker_persists_when_stopped_and_disappears_when_gone():
    empty = night_background()
    model = build_calibration_model([empty.copy() for _ in range(12)])
    person = walker(empty)
    frames = [empty.copy() for _ in range(18)] + [person.copy() for _ in range(60)] + [empty.copy() for _ in range(3)]
    tracks = night_body_tracks(frames, model)
    assert not any(tracks[:19])  # opening and one-frame confirmation
    assert all(box is not None for box in tracks[19:78])
    assert tracks[-3:] == [None] * 3  # no invented/predicted held rectangle
    x, y, width, height = tracks[30]
    assert x < 135 and x + width > 150 and y < 40 and y + height >= 120


def test_light_clothing_is_detected_too():
    empty = night_background()
    model = build_calibration_model([empty.copy() for _ in range(12)])
    frames = [empty.copy() for _ in range(18)] + [walker(empty, bright=True) for _ in range(5)]
    assert all(box is not None for box in night_body_tracks(frames, model)[19:])


def test_lamp_flicker_exposure_offset_and_sensor_noise_do_not_make_bodies():
    empty = night_background()
    model = build_calibration_model([empty.copy() for _ in range(12)])
    rng = np.random.default_rng(42)
    frames = [empty.copy() for _ in range(18)]
    for i in range(20):
        gain = [0.8, 1.2, 1.0][i % 3]
        noise = rng.normal(0, 2, empty.shape)
        frames.append(np.clip(empty * gain + 4 + noise, 0, 255).astype(np.uint8))
    assert not any(night_body_tracks(frames, model))


def test_trial_opening_removes_fixed_empty_video_mismatch():
    empty = night_background()
    model = build_calibration_model([empty.copy() for _ in range(12)])
    trial_empty = empty.copy()
    trial_empty[30:135, 210:240] = 90  # static mismatch must not be a body
    frames = [trial_empty.copy() for _ in range(18)] + [walker(trial_empty) for _ in range(6)]
    tracks = night_body_tracks(frames, model)
    assert not any(tracks[:19])
    assert all(box and box[0] < 170 and box[0] + box[2] < 200 for box in tracks[19:])


def test_body_can_leave_at_the_image_boundary():
    empty = night_background()
    model = build_calibration_model([empty.copy() for _ in range(12)])
    frames = [empty.copy() for _ in range(18)] + [walker(empty, x=294) for _ in range(4)]
    assert all(box and box[0] > 280 and box[0] + box[2] <= 320 for box in night_body_tracks(frames, model)[19:])


def test_no_body_is_invented_during_short_baseline_or_black_frames():
    empty = night_background()
    model = build_calibration_model([empty.copy() for _ in range(12)])
    assert night_body_tracks([], model) == []
    assert night_body_tracks([empty] * 5, model) == [None] * 5
    assert night_body_tracks([np.zeros_like(empty)] * 25, model) == [None] * 25


def test_report_reuses_exact_body_evidence_including_absent_frames():
    assert _recorded_body_boxes({}) is None
    evidence = {"body_detection": {"samples": [
        {"frame_index": 20, "box": [25, 30, 45, 100]},
        {"frame_index": 21, "box": None},
    ]}}
    assert _recorded_body_boxes(evidence) == {20: (25, 30, 45, 100), 21: None}


def test_replay_rate_matches_sampled_source_timestamps():
    for fps, step in [(30.08573655494934, 4), (29.97, 3), (10, 1)]:
        timestamps = [index * step / fps for index in range(49)]
        replay_fps = _sampled_video_fps(timestamps)
        assert abs(replay_fps - fps / step) < 1e-8
        assert abs(48 / replay_fps - timestamps[-1]) < 1e-8
    assert _sampled_video_fps([]) == 10


def test_night_pipeline_keeps_body_evidence_separate_from_shadow_coverage(tmp_path, monkeypatch):
    from umbra.pipeline import analyse_trial
    from umbra.synthetic import generate_synthetic_bundle

    bundle = generate_synthetic_bundle(tmp_path, seed=7, frames=48)
    monkeypatch.setattr("umbra.pipeline.night_body_tracks", lambda frames, _calibration: [
        (100, 25, 30, 90) if index >= 22 else None for index in range(len(frames))
    ])
    result = analyse_trial(
        calibration_path=bundle.calibration_path, main_path=bundle.main_path,
        ground_truth_path=None, track_length_m=None,
        scene={"latitude": 44.4268, "longitude": 26.1025, "recorded_at": "2026-06-21T00:00:00+00:00"},
    )
    assert result["state"] == "no_coverage"  # a body is not an early shadow warning
    assert result["los_detected"] is True
    assert result["hidden_motion"] is None
    assert result["body_detection"]["samples"][22]["box"] == [100, 25, 30, 90]
    assert all(point["los_probability"] == 0 for point in result["timeline"][:22])
    assert all(point["los_probability"] == 0.9 for point in result["timeline"][22:])
