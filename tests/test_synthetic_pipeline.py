from pathlib import Path

from umbra.pipeline import analyse_trial
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
