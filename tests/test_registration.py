"""Camera registration must remove jitter without erasing new foreground."""

import cv2
import numpy as np

from umbra.vision import (
    align_to_reference,
    build_calibration_model,
    extract_temporal_signal,
    grayscale,
    normalised_residual,
)


def textured_empty():
    rng = np.random.default_rng(12)
    texture = rng.integers(70, 220, (160, 240), dtype=np.uint8)
    texture = cv2.GaussianBlur(texture, (5, 5), 0)
    return cv2.cvtColor(texture, cv2.COLOR_GRAY2BGR)


def shift(frame, dx, dy):
    return cv2.warpAffine(frame, np.float32([[1, 0, dx], [0, 1, dy]]), (240, 160), borderMode=cv2.BORDER_REFLECT_101)


def test_jitter_is_registered_before_calibration_noise_is_measured():
    empty = textured_empty()
    frames = [shift(empty, dx, dy) for dx, dy in [(0, 0), (3, 2), (-3, 2), (4, -3)] * 5]
    model = build_calibration_model(frames)
    assert model.noise < 2
    assert model.stability > 0.7
    residual = normalised_residual(shift(empty, -4, 3), model)
    assert np.mean(np.abs(residual[10:-10, 10:-10])) < 2


def test_registration_preserves_a_new_dark_foreground_patch():
    empty = textured_empty()
    moved = empty.copy()
    moved[90:120, 100:155] = 35
    aligned = align_to_reference(shift(moved, 4, -3), grayscale(empty))
    assert float(grayscale(aligned)[95:115, 105:150].mean()) < 45
    outside = np.abs(grayscale(aligned) - grayscale(empty))
    assert float(outside[15:70, 15:210].mean()) < 3


def test_textureless_scene_does_not_invent_a_transform():
    empty = np.full((160, 240, 3), 150, dtype=np.uint8)
    assert np.array_equal(align_to_reference(empty, grayscale(empty)), empty)


def test_large_camera_reframing_is_not_silently_accepted():
    empty = textured_empty()
    moved = shift(empty, 35, 25)
    assert np.array_equal(align_to_reference(moved, grayscale(empty)), moved)


def test_visible_body_outside_guessed_corner_band_is_not_missed():
    empty = np.full((160, 240, 3), 180, dtype=np.uint8)
    person = empty.copy()
    person[10:70, 25:40] = 35
    model = build_calibration_model([empty.copy() for _ in range(10)])
    signal = extract_temporal_signal([empty, person], model, (140, 95, 70, 50), (220, 0, 220, 150))
    assert float(signal[0]["los_energy"]) == 0
    assert float(signal[1]["los_energy"]) > 30


def test_drone_reference_does_not_change_camera_detection(tmp_path):
    from umbra.pipeline import analyse_trial
    from umbra.synthetic import generate_synthetic_bundle

    bundle = generate_synthetic_bundle(tmp_path, seed=7, frames=48)
    arguments = dict(
        calibration_path=bundle.calibration_path, main_path=bundle.main_path,
        scene={"latitude": 44.4268, "longitude": 26.1025, "recorded_at": "2026-06-21T12:00:00+00:00"},
        track_length_m=None,
    )
    alone = analyse_trial(**arguments, ground_truth_path=None)
    reference = analyse_trial(**arguments, ground_truth_path=bundle.ground_truth_path)
    for key in ["state", "timeline", "shadow_onset_s", "los_onset_s", "presence_probability"]:
        assert alone[key] == reference[key]


def test_body_before_shadow_remains_a_late_detection(tmp_path, monkeypatch):
    from umbra.pipeline import analyse_trial
    from umbra.synthetic import generate_synthetic_bundle

    bundle = generate_synthetic_bundle(tmp_path, seed=7, frames=32)

    def signal(frames, *_args):
        return [dict(energy=25.0 if i >= 15 else 0.0, los_energy=30.0 if i >= 5 else 0.0,
                     position=0.5, lateral=0.5, coherence=0.9) for i in range(len(frames))]

    monkeypatch.setattr("umbra.pipeline.extract_temporal_signal", signal)
    result = analyse_trial(calibration_path=bundle.calibration_path, main_path=bundle.main_path,
                           ground_truth_path=None, scene={}, track_length_m=None)
    assert result["los_onset_s"] < result["shadow_onset_s"]
    assert result["lead_time_s"] < 0
    assert result["state"] != "early_warning"
