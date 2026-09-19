import io
import zipfile
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from umbra.api import create_app
from umbra.config import Settings
from umbra.pipeline import _metrics, analyse_trial
from umbra.synthetic import generate_synthetic_bundle
from umbra.video import estimate_audio_offset, write_mp4
from umbra.vision import load_ground_truth


def test_metrics_align_timestamps_and_exclude_invalid_labels():
    timeline = [
        {"timestamp_s": 1.0, "presence_probability": 0.9, "position_norm": 0.2},
        {"timestamp_s": 1.1, "presence_probability": 0.1, "position_norm": 0.5},
        {"timestamp_s": 8.0, "presence_probability": 0.9, "position_norm": 0.9},
    ]
    labels = [
        {"timestamp_s": 0.0, "present": True, "position_norm": 0.2},
        {"timestamp_s": 0.1, "present": True, "position_norm": 0.8, "valid": False},
    ]
    result = _metrics(timeline, labels, 4.0, offset_s=1.0)
    assert result["evaluated_samples"] == 1
    assert result["f1"] == 1
    assert result["position_error_m"] == 0
    assert result["false_alert_rate"] is None
    assert _metrics(timeline, labels, None, offset_s=20)["ground_truth_available"] == 0


@pytest.mark.parametrize("lag", [-20, 30])
def test_audio_offset_with_unequal_durations(monkeypatch, lag):
    main = np.zeros(500)
    truth = np.zeros(700)
    main[200 + lag] = 20
    truth[200] = 20
    monkeypatch.setattr("umbra.video.extract_audio_envelope", lambda path: main if path.name == "main" else truth)
    result = estimate_audio_offset(Path("main"), Path("truth"))
    assert result["offset_s"] == pytest.approx(lag / 50)


def test_missing_markers_are_not_negative_ground_truth(tmp_path):
    path = tmp_path / "no-markers.mp4"
    frame = np.full((120, 160, 3), 128, dtype=np.uint8)
    write_mp4(path, [frame] * 30)
    labels, alignment = load_ground_truth(path)
    assert alignment["confidence"] == 0
    assert all(not label["valid"] for label in labels)


def test_refusal_has_complete_dashboard_shape(tmp_path):
    path = tmp_path / "blank.mp4"
    write_mp4(path, [np.full((120, 160, 3), 128, dtype=np.uint8)] * 20)
    result = analyse_trial(calibration_path=path, main_path=path, ground_truth_path=None, scene={}, track_length_m=None)
    assert result["state"] == "no_coverage"
    assert result["direction"] == "unknown"
    assert result["position_range_norm"] is None
    assert result["presence_probability"] is None
    assert result["reasons"]
    assert result["model"]["trained"] is False


def test_empty_scene_refuses_motion_and_position(tmp_path):
    bundle = generate_synthetic_bundle(tmp_path, target_present=False)
    result = analyse_trial(calibration_path=bundle.calibration_path, main_path=bundle.main_path,
                           ground_truth_path=bundle.ground_truth_path, scene={}, track_length_m=4)
    assert result["state"] == "no_reliable_signal"
    assert result["position_range_m"] is None
    assert result["direction"] == "unknown"


def test_evidence_bundle_is_portable_and_reopenable(tmp_path):
    settings = Settings(data_dir=tmp_path, max_upload_bytes=10_000_000)
    settings.ensure_directories()
    app = create_app(settings)
    demo = app.state.service.create_synthetic_demo(
        {"seed": 7, "frames": 60, "lighting": "directional", "target_present": True},
        lambda *_: None,
    )
    with TestClient(app) as client:
        analysis_id = demo["analysis_id"]
        result = client.get(f"/api/v1/analyses/{analysis_id}").json()["result"]
        assert result["evidence"]["kind"] == "synthetic"
        assert result["visualization"]["available"] is True
        assert result["visualizations"] == {"corner_trial_available": True, "hidden_path_available": True}
        assert result["provenance"]["sources"][1]["metadata"]["seed"] == 7
        history = client.get(f"/api/v1/scenes/{demo['scene_id']}").json()["analyses"]
        assert history[0]["id"] == analysis_id
        response = client.get(f"/api/v1/analyses/{analysis_id}/bundle")
        assert response.status_code == 200
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            assert set(archive.namelist()) == {"report.html", "result.json", "predictions.csv", "corner-trial-visualization.mp4", "hidden-path-visualization.mp4"}
            assert archive.read("corner-trial-visualization.mp4")[4:8] == b"ftyp"
            assert archive.read("hidden-path-visualization.mp4")[4:8] == b"ftyp"
            report = archive.read("report.html").decode()
            assert "data:image/png;base64," in report
            assert "Evidence: synthetic" in report
            assert 'src="/artifacts/' not in report
