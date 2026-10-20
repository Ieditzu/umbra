"""Synthetic numerical checks; these do not establish real optical performance."""

import io
import json
import zipfile
from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from umbra.api import create_app
from umbra.config import Settings
from umbra.periscope import PeriscopeLab, fit_transport, reconstruct


def synthetic_transport(side=4):
    """Independent positive spatial responses with overlapping, smooth support."""
    yy, xx = np.mgrid[:24, :24]
    centers = np.linspace(3, 20, side)
    matrix = np.column_stack([
        (0.025 * np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / 12) + 0.001).ravel()
        for cy in centers for cx in centers
    ])
    dark = np.full(24 * 24, 0.018)
    return dark, matrix


def photograph(linear):
    pixels = np.asarray(linear).reshape(24, 24)
    srgb = np.where(pixels <= 0.0031308, pixels * 12.92, 1.055 * np.maximum(pixels, 0) ** (1 / 2.4) - 0.055)
    gray = np.rint(np.clip(srgb, 0, 1) * 255).astype(np.uint8)
    image = cv2.resize(gray, (192, 192), interpolation=cv2.INTER_NEAREST)
    return cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 98])[1].tobytes()


def test_reconstructs_unseen_random_patterns_with_noise():
    dark, matrix = synthetic_transport()
    rng = np.random.default_rng(419)
    model, diagnostics = fit_transport(dark, dark, dark + matrix.sum(axis=1), matrix + dark[:, None])
    assert diagnostics["effective_rank"] == 16
    for _ in range(12):
        target = rng.integers(0, 2, size=16)
        measured = dark + matrix @ target + rng.normal(0, 0.00003, dark.size)
        result = reconstruct(model, measured)
        assert result["status"] == "estimated"
        assert np.mean((np.array(result["values"]) - target) ** 2) < 0.002


def test_refuses_rank_deficiency_drift_and_nonadditive_capture():
    dark, matrix = synthetic_transport()
    rank_one = np.tile(matrix[:, :1], (1, 16))
    with pytest.raises(ValueError, match="independent"):
        fit_transport(dark, dark, dark + rank_one.sum(axis=1), dark[:, None] + rank_one)
    with pytest.raises(ValueError, match="background changed"):
        fit_transport(dark, dark + 0.01, dark + matrix.sum(axis=1), dark[:, None] + matrix)
    with pytest.raises(ValueError, match="white reference"):
        fit_transport(dark, dark, dark + matrix.sum(axis=1) * 2, dark[:, None] + matrix)


def test_withholds_missing_signal_and_measurements_outside_model():
    dark, matrix = synthetic_transport()
    model, _ = fit_transport(dark, dark, dark + matrix.sum(axis=1), dark[:, None] + matrix)
    empty = reconstruct(model, dark)
    assert empty["status"] == "no_signal" and empty["values"] is None
    mismatch = reconstruct(model, dark + np.indices((24, 24)).sum(axis=0).ravel() % 2 * 0.2)
    assert mismatch["status"] == "measurement_mismatch" and mismatch["values"] is None


def prepare_experiment(client, side=4):
    response = client.post("/api/v1/periscope", json={"name": "Synthetic optics fixture", "grid_side": side})
    assert response.status_code == 201, response.text
    experiment = response.json()
    prefix = f"/api/v1/periscope/{experiment['id']}"
    dark, matrix = synthetic_transport(side)
    captures = {"dark": dark, "dark_check": dark, "white": dark + matrix.sum(axis=1)}
    captures.update({f"cell-{i}": dark + matrix[:, i] for i in range(side ** 2)})
    for label, values in captures.items():
        response = client.post(f"{prefix}/captures/{label}", files={"file": ("surface.jpg", photograph(values), "image/jpeg")})
        assert response.status_code == 200, response.text
    response = client.post(f"{prefix}/fit")
    assert response.status_code == 200, response.text
    return prefix, response.json(), dark, matrix


def test_api_persists_real_measurement_path_without_receiving_test_target(tmp_path: Path):
    settings = Settings(data_dir=tmp_path, max_upload_bytes=10_000_000)
    settings.ensure_directories()
    with TestClient(create_app(settings)) as client:
        prefix, experiment, dark, matrix = prepare_experiment(client)
        unseen = np.random.default_rng(68).integers(0, 2, size=16)
        measured = photograph(dark + matrix @ unseen)
        # The display is deliberately WRONG. It must never become solver input.
        client.put(f"{prefix}/display", json={"cells": (1 - unseen).tolist()})
        response = client.post(f"{prefix}/reconstruct", files={"file": ("camera.jpg", measured, "image/jpeg")})
        assert response.status_code == 201, response.text
        result = response.json()
        assert result["status"] == "estimated"
        assert np.mean((np.array(result["values"]) - unseen) ** 2) < 0.01
        assert result["model_id"] == experiment["calibration"]["id"]
        assert client.get(f"{prefix}/files/{result['id']}.png").status_code == 200
        evidence = client.get(f"{prefix}/files/{result['id']}.json").json()
        assert evidence["calibration"]["captures"] == experiment["captures"]
        assert "display" not in evidence
        client.put(f"{prefix}/display", json={"cells": unseen.tolist()})
        repeated = client.post(f"{prefix}/reconstruct", files={"file": ("camera.jpg", measured, "image/jpeg")}).json()
        assert repeated["values"] == result["values"]
        bundle = client.get(f"{prefix}/bundle")
        assert bundle.status_code == 200
        with zipfile.ZipFile(io.BytesIO(bundle.content)) as archive:
            assert "display" not in json.loads(archive.read("experiment.json"))
            assert f"{result['model_id']}.npz" in archive.namelist()
            assert all(capture["file"] in archive.namelist() for capture in experiment["captures"].values())
    with TestClient(create_app(settings)) as restarted:
        restored = restarted.get(prefix).json()
        assert restored["calibration"]["id"] == result["model_id"]
        assert len(restored["results"]) == 2
        assert restarted.get(f"{prefix}/display").json()["cells"] == unseen.tolist()
        # Replacing a capture invalidates the current model; old evidence survives.
        restarted.post(f"{prefix}/captures/dark", files={"file": ("dark.jpg", photograph(dark), "image/jpeg")})
        assert restarted.get(prefix).json()["calibration"] is None
        assert restarted.post(f"{prefix}/reconstruct", files={"file": ("camera.jpg", measured, "image/jpeg")}).status_code == 422
        assert restarted.get(f"{prefix}/files/{result['id']}.json").status_code == 200


def test_api_validates_capture_labels_shapes_upload_limits_and_region(tmp_path):
    settings = Settings(data_dir=tmp_path, max_upload_bytes=10_000_000)
    settings.ensure_directories()
    with TestClient(create_app(settings)) as client:
        prefix, _, dark, _ = prepare_experiment(client, side=2)
        photo = photograph(dark)
        assert client.post(f"{prefix}/captures/cell-99", files={"file": ("a.jpg", photo)}).status_code == 422
        assert client.post(f"{prefix}/captures/dark", files={"file": ("a.jpg", b"x" * 512_001)}).status_code == 422
        small = cv2.imencode(".jpg", np.full((100, 100, 3), 50, dtype=np.uint8))[1].tobytes()
        assert client.post(f"{prefix}/captures/dark", files={"file": ("a.jpg", small)}).status_code == 422
        assert client.put(f"{prefix}/display", json={"cells": [1] * 16}).status_code == 422
        assert client.put(f"{prefix}/display", json={"cells": [0, 0, 0, 2]}).status_code == 422
        assert client.put(f"{prefix}/region", json={"x": 0.9, "y": 0, "width": 0.5, "height": 1}).status_code == 422
        response = client.put(f"{prefix}/region", json={"x": 0.1, "y": 0.1, "width": 0.8, "height": 0.8})
        assert response.status_code == 200 and response.json()["calibration"] is None
        assert client.post(f"{prefix}/fit").status_code == 200
        assert client.get("/api/v1/periscope/unknown").status_code == 404


def test_missing_calibration_and_path_escape_are_rejected(tmp_path):
    lab = PeriscopeLab(tmp_path)
    data = lab.create("Incomplete", 4, {"x": 0, "y": 0, "width": 1, "height": 1})
    with pytest.raises(ValueError, match="Missing"):
        lab.fit(data["id"])
    with pytest.raises(KeyError):
        lab.get("../outside")
    with pytest.raises(KeyError):
        lab.artifact(data["id"], "../experiment.json")
    with pytest.raises(ValueError, match="valid calibration"):
        lab.solve(data["id"], b"fake")


def test_refuses_clipped_calibration_photographs(tmp_path):
    lab = PeriscopeLab(tmp_path)
    data = lab.create("Clipped", 2, {"x": 0, "y": 0, "width": 1, "height": 1})
    for label in ["dark", "dark_check", "white", "cell-0", "cell-1", "cell-2", "cell-3"]:
        lab.capture(data["id"], label, photograph(np.ones(576)))
    with pytest.raises(ValueError, match="clips highlights"):
        lab.fit(data["id"])


def test_display_revision_acknowledgement_and_recoverable_removal(tmp_path):
    settings = Settings(data_dir=tmp_path, max_upload_bytes=10_000_000)
    settings.ensure_directories()
    with TestClient(create_app(settings)) as client:
        experiment = client.post("/api/v1/periscope", json={"name": "Archive test", "grid_side": 2}).json()
        prefix = f"/api/v1/periscope/{experiment['id']}"
        display = client.put(f"{prefix}/display", json={"cells": [0, 1, 1, 0]}).json()
        assert client.post(f"{prefix}/display/ack", json={"revision": display["revision"]}).status_code == 200
        assert client.get(f"{prefix}/display").json()["acknowledged_revision"] == display["revision"]
        client.put(f"{prefix}/display", json={"cells": [1, 0, 0, 1]})
        assert client.post(f"{prefix}/display/ack", json={"revision": display["revision"]}).status_code == 422
        assert "acknowledged_revision" not in client.get(f"{prefix}/display").json()
        assert client.delete(prefix).json()["status"] == "archived"
        assert client.get(prefix).status_code == 404
        assert client.get("/api/v1/periscope").json() == []
        assert (tmp_path / "periscope" / ".archive" / experiment["id"] / "experiment.json").is_file()
