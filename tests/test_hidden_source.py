"""Source-zone regressions; these are not hidden-person accuracy evaluations."""

import cv2
import numpy as np

from umbra.hidden import estimate_hidden_shadow_source, shadow_source_zone
from umbra.reports import _hidden_source_frames
from umbra.vision import build_calibration_model

EDGE = (100, 0, 100, 170)
ROI = (120, 110, 160, 65)


def empty_scene():
    frame = np.full((180, 320, 3), 140, dtype=np.uint8)
    frame[:, :100] = 45
    return frame


def with_shadow(empty, x=165, y=145, angle=25):
    frame = empty.copy()
    cv2.ellipse(frame, (x, y), (42, 7), angle, 0, 360, (55, 55, 55), -1)
    return frame


def estimate(frames, body_onset=None, edge=EDGE):
    model = build_calibration_model([empty_scene()] * 12)
    return estimate_hidden_shadow_source(frames, [i / 10 for i in range(len(frames))], model, ROI, edge, body_onset)


def test_shadow_axis_projects_a_zone_on_the_hidden_wall_side():
    mask = np.zeros((180, 320), dtype=np.uint8)
    cv2.ellipse(mask, (165, 145), (42, 7), 25, 0, 360, 1, -1)
    zone = shadow_source_zone(mask, EDGE, 1)
    assert zone is not None
    assert zone["position_norm"][0] < 100 / 320
    assert abs(zone["wall_intersection_norm"][0] - 100 / 320) < 1e-6
    assert zone["uncertainty_norm"][0] > 0


def test_projection_works_with_a_wall_on_the_right_too():
    mask = np.zeros((180, 320), dtype=np.uint8)
    cv2.ellipse(mask, (150, 145), (42, 7), -25, 0, 360, 1, -1)
    zone = shadow_source_zone(mask, (220, 0, 220, 170), -1)
    assert zone is not None and zone["position_norm"][0] > 220 / 320


def test_dot_needs_repeated_evidence_and_disappears_on_missing_shadow():
    empty = empty_scene()
    frames = [empty.copy() for _ in range(18)] + [with_shadow(empty, x=165 + i * 2) for i in range(8)] + [empty.copy() for _ in range(3)]
    result = estimate(frames)
    assert result["status"] == "estimated"
    assert result["calibrated"] is False
    samples = result["samples"]
    assert all(sample["position_norm"] is None for sample in samples[:19])
    assert all(sample["position_norm"] is not None for sample in samples[19:26])
    assert all(sample["position_norm"] is None for sample in samples[-3:])


def test_dot_does_not_require_a_future_body_appearance_or_reference_video():
    empty = empty_scene()
    frames = [empty.copy() for _ in range(18)] + [with_shadow(empty) for _ in range(7)]
    result = estimate(frames, body_onset=None)
    assert result["status"] == "estimated"
    assert result["samples"][-1]["position_norm"] is not None


def test_body_entry_suppresses_hidden_source_evidence():
    empty = empty_scene()
    frames = [empty.copy() for _ in range(18)] + [with_shadow(empty) for _ in range(12)]
    result = estimate(frames, body_onset=2.3)
    assert any(s["position_norm"] for s in result["samples"][19:23])
    assert all(s["position_norm"] is None for s in result["samples"][23:])


def test_past_dots_do_not_change_when_future_frames_change():
    empty = empty_scene()
    frames = [empty.copy() for _ in range(18)] + [with_shadow(empty, x=165 + i) for i in range(10)]
    prefix = estimate(frames[:24])
    full = estimate(frames)
    changed = estimate(frames[:24] + [empty.copy() for _ in range(4)])
    assert prefix["samples"] == full["samples"][:24] == changed["samples"][:24]


def test_dot_can_reverse_instead_of_forcing_approaching_progress():
    empty = empty_scene()
    # Moving the observed source ray down and back up must move the proxy too.
    heights = [145, 148, 151, 154, 151, 148, 145, 142]
    frames = [empty.copy() for _ in range(18)] + [with_shadow(empty, y=y) for y in heights]
    samples = [s for s in estimate(frames)["samples"] if s["position_norm"]]
    ys = [s["position_norm"][1] for s in samples]
    assert max(ys) > ys[0] and ys[-1] < max(ys)


def test_static_shadow_and_global_lamp_flicker_do_not_create_a_dot():
    empty = with_shadow(empty_scene())  # present throughout the empty opening
    frames = [empty.copy() for _ in range(18)]
    frames += [np.clip(empty * gain + 3, 0, 255).astype(np.uint8) for gain in [0.8, 1.1, 1.2, 0.9] * 2]
    assert estimate(frames)["status"] == "unavailable"


def test_a_round_dark_patch_is_not_a_defensible_source_ray():
    mask = np.zeros((180, 320), dtype=np.uint8)
    cv2.circle(mask, (155, 140), 15, 1, -1)
    assert shadow_source_zone(mask, EDGE, 1) is None


def test_no_wall_or_weak_pole_geometry_means_no_position_estimate():
    empty = empty_scene()
    frames = [empty.copy() for _ in range(18)] + [with_shadow(empty) for _ in range(6)]
    assert estimate(frames, edge=None)["status"] == "unavailable"
    flat = np.full_like(empty, 140)
    flat[:, 99:102] = 45
    model = build_calibration_model([flat] * 12)
    result = estimate_hidden_shadow_source(frames, [i / 10 for i in range(len(frames))], model, ROI, EDGE, None)
    assert result["status"] == "unavailable"
    assert "contrast" in result["reason"]


def test_new_unavailable_estimate_does_not_fall_back_to_a_legacy_animation():
    assert _hidden_source_frames({}) is None
    assert _hidden_source_frames({"hidden_source_estimate": {"status": "unavailable", "samples": []}}) == {}


def test_source_preview_cannot_promote_a_refused_night_warning(tmp_path, monkeypatch):
    from umbra.pipeline import analyse_trial
    from umbra.synthetic import generate_synthetic_bundle

    bundle = generate_synthetic_bundle(tmp_path, seed=7, frames=48)
    class PreviewTracker:
        def __init__(self, *_args):
            pass

        def update(self, _frame):
            return {"position_norm": [0.2, 0.4], "state": "estimated"}

    monkeypatch.setattr("umbra.pipeline.PositionTracker", PreviewTracker)
    result = analyse_trial(
        calibration_path=bundle.calibration_path, main_path=bundle.main_path,
        ground_truth_path=None, track_length_m=None,
        scene={"latitude": 44.4268, "longitude": 26.1025, "recorded_at": "2026-06-21T00:00:00+00:00"},
        position_calibration=({"limitation": "test fixture", "fit_error_px": 0, "internal_check_error_px": 0}, np.zeros((1, 1)), np.zeros((1, 1))),
    )
    assert result["hidden_source_estimate"]["status"] == "estimated"
    assert result["hidden_source_estimate"]["shadow_warning_eligible"] is False
    assert result["state"] == "no_coverage"
    assert result["hidden_motion"] is None
