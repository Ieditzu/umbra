from pathlib import Path

import numpy as np

from umbra.pipeline import _automatic_hidden_overlay_path, _hidden_motion_from_shadow, analyse_trial
from umbra.synthetic import generate_synthetic_bundle


def scene() -> dict[str, object]:
    return {
        "latitude": 44.4268,
        "longitude": 26.1025,
        "recorded_at": "2026-06-21T12:00:00+00:00",
    }


def test_directional_synthetic_trial_produces_timeline_and_metrics(tmp_path: Path) -> None:
    bundle = generate_synthetic_bundle(tmp_path / "directional", seed=7, frames=72, lighting="directional")
    result = analyse_trial(
        calibration_path=bundle.calibration_path,
        main_path=bundle.main_path,
        ground_truth_path=bundle.ground_truth_path,
        scene=scene(),
        track_length_m=4.0,
    )
    assert result["scene_assessment"]["roi"] is not None
    assert len(result["timeline"]) == 72
    assert result["metrics"]["ground_truth_available"] == 1
    assert result["state"] in {"possible_motion", "strong_motion", "early_warning", "no_reliable_signal"}


def test_flat_synthetic_trial_does_not_claim_strong_motion(tmp_path: Path) -> None:
    bundle = generate_synthetic_bundle(tmp_path / "flat", seed=8, frames=72, lighting="flat")
    result = analyse_trial(
        calibration_path=bundle.calibration_path,
        main_path=bundle.main_path,
        ground_truth_path=None,
        scene=scene(),
        track_length_m=None,
    )
    assert result["state"] != "strong_motion"


def test_directional_synthetic_reports_positive_lead_time(tmp_path: Path) -> None:
    bundle = generate_synthetic_bundle(tmp_path / "lead", seed=7, frames=100, lighting="directional")
    result = analyse_trial(
        calibration_path=bundle.calibration_path,
        main_path=bundle.main_path,
        ground_truth_path=bundle.ground_truth_path,
        scene=scene(),
        track_length_m=4.0,
    )
    assert result["los_detected"] is True
    assert result["lead_time_s"] is not None
    assert result["lead_time_s"] > 0
    assert result["state"] == "early_warning"
    assert result["shadow_onset_s"] < result["los_onset_s"]


def test_solar_shadow_warning_is_withheld_when_sun_is_below_horizon(tmp_path: Path) -> None:
    bundle = generate_synthetic_bundle(tmp_path / "night", seed=7, frames=72, lighting="directional")
    night_scene = {**scene(), "recorded_at": "2026-06-21T00:00:00+00:00"}
    result = analyse_trial(
        calibration_path=bundle.calibration_path,
        main_path=bundle.main_path,
        ground_truth_path=None,
        scene=night_scene,
        track_length_m=None,
    )
    assert result["sun"]["above_horizon"] is False
    assert result["state"] == "no_coverage"
    assert result["hidden_motion"] is None
    assert any("sun below the horizon" in reason.lower() for reason in result["reasons"])


def test_night_trial_can_use_a_reviewed_streetlamp_area(tmp_path: Path) -> None:
    bundle = generate_synthetic_bundle(tmp_path / "lamp", seed=7, frames=72, lighting="directional")
    result = analyse_trial(
        calibration_path=bundle.calibration_path,
        main_path=bundle.main_path,
        ground_truth_path=None,
        scene={**scene(), "recorded_at": "2026-06-21T00:00:00+00:00"},
        track_length_m=None,
        manual_ground_truth={"main_shadow_region": {"x": 0.1, "y": 0.6, "width": 0.7, "height": 0.3}},
    )
    assert result["sun"]["above_horizon"] is False
    assert result["illumination"]["source"] == "streetlamp"
    assert result["illumination"]["selected_pool_brightness"] >= 55
    assert result["state"] != "no_coverage"
    assert not any("Select a streetlamp-lit" in reason for reason in result["reasons"])


def test_manual_review_overrides_body_entry_timestamp(tmp_path: Path) -> None:
    bundle = generate_synthetic_bundle(tmp_path / "manual", seed=7, frames=100, lighting="directional")
    automatic = analyse_trial(
        calibration_path=bundle.calibration_path,
        main_path=bundle.main_path,
        ground_truth_path=None,
        scene=scene(),
        track_length_m=4.0,
    )
    assert automatic["shadow_onset_s"] is not None
    entry_time = float(automatic["shadow_onset_s"]) + 0.4
    result = analyse_trial(
        calibration_path=bundle.calibration_path,
        main_path=bundle.main_path,
        ground_truth_path=bundle.ground_truth_path,
        scene=scene(),
        track_length_m=4.0,
        manual_ground_truth={
            "corner": {"x": 0.15, "y": 0.8},
            "far_point": {"x": 0.85, "y": 0.8},
            "samples": [{"timestamp_s": 1.0, "x": 0.5, "y": 0.8}],
            "main_entry_timestamp_s": entry_time,
        },
    )
    assert result["entry_source"] == "manual_review"
    assert result["los_onset_s"] == entry_time
    assert result["ground_truth"]["alignment"]["method"] == "timestamp_fallback"


def test_hidden_motion_tracks_shadow_only_until_body_entry() -> None:
    timestamps = [index / 10 for index in range(20)]
    signal = [{"position": 0.2 + index * 0.018} for index in range(20)]
    motion = _hidden_motion_from_shadow(timestamps, signal, [0.9] * 20, 0.2, 1.4)
    assert motion is not None
    assert motion["kind"] == "relative_shadow_motion"
    assert motion["frames"][0]["frame_index"] == 2
    assert motion["frames"][-1]["timestamp_s"] < 1.4
    progress = [frame["progress_norm"] for frame in motion["frames"]]
    assert progress == sorted(progress)
    assert progress[-1] > 0.8


def test_hidden_motion_rejects_static_shadow_and_short_lead() -> None:
    timestamps = [index / 10 for index in range(20)]
    static = [{"position": 0.4} for _ in timestamps]
    assert _hidden_motion_from_shadow(timestamps, static, [1.0] * 20, 0.2, 1.5) is None
    moving = [{"position": 0.2 + index * 0.018} for index in range(20)]
    assert _hidden_motion_from_shadow(timestamps, moving, [1.0] * 20, 0.2, 0.5) is None


def test_hidden_overlay_path_uses_nearby_wall_not_manual_points() -> None:
    background = np.full((268, 480), 185, dtype=np.float32)
    background[:, :125] = 85
    signal = [{"lateral": 0.32 + index * 0.014} for index in range(13)]
    motion = {"frames": [{"frame_index": index} for index in range(13)]}
    path = _automatic_hidden_overlay_path(background, (43, 193, 327, 67), signal, motion)
    assert path is not None
    assert path[0][0] < path[1][0] < 0.25
    assert _automatic_hidden_overlay_path(np.full_like(background, 185), (43, 193, 327, 67), signal, motion) is None
