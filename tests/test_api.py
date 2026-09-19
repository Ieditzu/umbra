from pathlib import Path

from fastapi.testclient import TestClient

from umbra.api import create_app
from umbra.config import Settings
from umbra.synthetic import generate_synthetic_bundle


def test_health_and_scene_creation(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path / "data", max_upload_bytes=10_000_000)
    settings.ensure_directories()
    with TestClient(create_app(settings)) as client:
        health = client.get("/api/v1/health")
        assert health.status_code == 200
        assert health.json()["name"] == "umbra"
        response = client.post("/api/v1/scenes", json={"name": "Test corner"})
        assert response.status_code == 201
        assert response.json()["name"] == "Test corner"


def test_scene_deletion_removes_imported_media(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path / "data", max_upload_bytes=10_000_000)
    settings.ensure_directories()
    bundle = generate_synthetic_bundle(tmp_path / "fixture", seed=19, frames=30)
    with TestClient(create_app(settings)) as client:
        scene = client.post("/api/v1/scenes", json={"name": "Delete import"}).json()
        with bundle.calibration_path.open("rb") as handle:
            response = client.post(
                f"/api/v1/scenes/{scene['id']}/media/calibration",
                files={"file": (bundle.calibration_path.name, handle, "video/mp4")},
            )
        assert response.status_code == 201, response.text
        stored_path = Path(response.json()["path"])
        assert stored_path.exists()

        response = client.delete(f"/api/v1/scenes/{scene['id']}")

        assert response.status_code == 200
        assert response.json() == {"scene_id": scene["id"]}
        assert not stored_path.exists()
        assert client.get(f"/api/v1/scenes/{scene['id']}").status_code == 404


def test_video_import_and_trial_registration(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path / "data", max_upload_bytes=10_000_000)
    settings.ensure_directories()
    bundle = generate_synthetic_bundle(tmp_path / "fixture", seed=33, frames=60)
    with TestClient(create_app(settings)) as client:
        scene = client.post("/api/v1/scenes", json={"name": "Import test"}).json()
        media: dict[str, str] = {}
        for role, path in (
            ("calibration", bundle.calibration_path),
            ("main", bundle.main_path),
            ("ground_truth", bundle.ground_truth_path),
        ):
            with path.open("rb") as handle:
                response = client.post(
                    f"/api/v1/scenes/{scene['id']}/media/{role}",
                    files={"file": (path.name, handle, "video/mp4")},
                )
            assert response.status_code == 201, response.text
            media[role] = response.json()["id"]
        response = client.post(
            f"/api/v1/scenes/{scene['id']}/trials",
            json={
                "name": "Imported trial",
                "calibration_media_id": media["calibration"],
                "main_media_id": media["main"],
                "ground_truth_media_id": media["ground_truth"],
                "track_length_m": 4,
            },
        )
        assert response.status_code == 201, response.text

        trial = response.json()
        labels = {
            "ground_truth_media_id": media["ground_truth"],
            "corner": {"x": 0.1, "y": 0.8},
            "far_point": {"x": 0.9, "y": 0.8},
            "samples": [{"timestamp_s": 1.0, "x": 0.4, "y": 0.8}],
            "main_entry_timestamp_s": 1.25,
        }
        saved = client.put(f"/api/v1/trials/{trial['id']}/manual-ground-truth", json=labels)
        assert saved.status_code == 200, saved.text
        assert saved.json()["samples"] == labels["samples"]
        assert client.get(f"/api/v1/trials/{trial['id']}/manual-ground-truth").json()["main_entry_timestamp_s"] == 1.25
        streamed = client.get(f"/api/v1/media/{media['ground_truth']}/stream")
        assert streamed.status_code == 200
        assert "content-disposition" not in streamed.headers
