import time

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from umbra.api import create_app
from umbra.config import Settings
from umbra.live import decode_live_jpeg, validate_camera_url
from umbra.position import PositionTracker
from umbra.store import Store


def fixture_mapping():
    return {
        "method": "saved_shadow_body_mapping_v1", "aspect_ratio": 320 / 180,
        "wall_edge_norm": [100 / 320, 0, 100 / 320, 1], "visible_side": 1,
        "ground_y_norm": 0.50, "tip_origin": [0.7, 0.45], "tip_axis": [1, 0],
        "tip_range": [-0.1, 0.1], "coefficients": [[0.24, 0.35, 0.45], [0.4, 0.02, 0.02]],
        "perpendicular_tolerance": 0.05, "max_extrapolation_spans": 1.6,
        "fit_error_px": 1, "internal_check_error_px": 2, "pair_count": 8,
        "body_height_norm": 0.45, "source_trial_id": "test", "limitation": "controlled fixture",
    }


def empty_frame():
    image = np.full((180, 320, 3), 140, dtype=np.uint8)
    image[:, :100] = 45
    return image


def shadow_frame():
    image = empty_frame()
    cv2.ellipse(image, (160, 140), (40, 7), 25, 0, 360, (50, 50, 50), -1)
    return image


def tracker():
    return PositionTracker(fixture_mapping(), cv2.cvtColor(empty_frame(), cv2.COLOR_BGR2GRAY).astype(np.float32), np.zeros((180, 320), dtype=np.float32))


def jpeg(frame):
    ok, encoded = cv2.imencode(".jpg", frame)
    assert ok
    return encoded.tobytes()


def test_per_frame_tracker_is_causal_and_missing_evidence_clears_the_dot():
    first, second = tracker(), tracker()
    prefix = [empty_frame()] * 4 + [shadow_frame()] * 4
    observed = [first.update(frame) for frame in prefix]
    assert observed == [second.update(frame) for frame in prefix]
    assert observed[-1]["state"] == "estimated"
    assert observed[-1]["position_norm"][0] < 100 / 320
    assert first.update(empty_frame())["position_norm"] is None


def test_live_tracker_rejects_wrong_aspect_and_clears_a_previous_dot():
    instance = tracker()
    instance.update(shadow_frame())
    assert instance.update(shadow_frame())["state"] == "estimated"
    output = instance.update(np.zeros((180, 180, 3), dtype=np.uint8))
    assert output["state"] == "camera_mismatch" and output["position_norm"] is None


def test_body_visibility_does_not_create_a_hidden_dot():
    frame = empty_frame()
    frame[25:130, 150:175] = 10
    instance = tracker()
    instance.update(frame)
    output = instance.update(frame)
    assert output["state"] == "body_visible"
    assert output["position_norm"] is None


def test_jpeg_dimension_and_payload_limits():
    assert decode_live_jpeg(jpeg(empty_frame())).shape == (180, 320, 3)
    for payload in [b"not a jpeg", b"\xff\xd8" + b"x" * 512000, jpeg(np.zeros((1200, 20, 3), dtype=np.uint8))]:
        with pytest.raises(ValueError):
            decode_live_jpeg(payload)


def test_cctv_url_is_restricted_to_explicit_private_lan_rtsp():
    assert validate_camera_url("rtsp://192.168.1.20:554/stream")
    assert validate_camera_url("rtsp://user:password@10.1.2.3/stream")
    for url in ["file:///etc/passwd", "http://192.168.1.1/admin", "rtsp://127.0.0.1/", "rtsp://[::ffff:127.0.0.1]/", "rtsp://169.254.169.254/", "rtsp://8.8.8.8/", "rtsp://192.0.2.2/", "rtsp://localhost/", "rtsp://224.0.0.1/", "rtsp://192.168.1.2:999999/x"]:
        with pytest.raises(ValueError):
            validate_camera_url(url)


def test_live_api_requires_saved_mapping_and_invalidates_replaced_empty_view(tmp_path):
    settings = Settings(tmp_path / "data", 10_000_000)
    settings.ensure_directories()
    app = create_app(settings)
    store = app.state.store
    scene = store.create_scene({"name": "live camera"})
    route = f"/api/v1/scenes/{scene['id']}"
    with TestClient(app) as client:
        assert client.post(route + "/live-sessions", json={}).status_code == 422
        def media(role):
            return store.create_media({"scene_id": scene["id"], "role": role, "original_name": "clip.mp4", "path": "/tmp/clip.mp4"})
        empty, main = media("calibration"), media("main")
        directory = settings.model_dir / "cameras"
        directory.mkdir()
        path = directory / "test.npz"
        np.savez_compressed(path, reference=cv2.cvtColor(empty_frame(), cv2.COLOR_BGR2GRAY).astype(np.float32), noise=np.zeros((180, 320)))
        store.save_position_calibration(scene["id"], "map-1", empty["id"], main["id"], fixture_mapping(), str(path))
        detail = client.get(route).json()
        assert detail["position_calibration"]["id"] == "map-1"
        assert "reference_path" not in detail["position_calibration"]
        session = client.post(route + "/live-sessions", json={}).json()
        frame_route = f"/api/v1/live/{session['id']}/frame"
        for _ in range(2):
            response = client.post(frame_route, files={"file": ("frame.jpg", jpeg(shadow_frame()), "image/jpeg")})
            assert response.status_code == 200, response.text
        assert response.json()["state"] == "estimated"
        response = client.post(frame_route, files={"file": ("frame.jpg", jpeg(empty_frame()), "image/jpeg")})
        assert response.json()["position_norm"] is None
        assert client.post(frame_route, files={"file": ("frame.jpg", b"invalid", "image/jpeg")}).status_code == 422
        media("calibration")
        assert client.post(frame_route, files={"file": ("frame.jpg", jpeg(empty_frame()), "image/jpeg")}).status_code == 422
        assert client.delete(f"/api/v1/live/{session['id']}").status_code == 200
        assert client.post(frame_route, files={"file": ("frame.jpg", jpeg(empty_frame()), "image/jpeg")}).status_code == 404
        assert client.delete(route + "/position-calibration").status_code == 200
        assert not path.exists()


def test_live_session_expiry_and_shutdown_release_camera_resources(tmp_path):
    from umbra.live import LiveSession, LiveSessions
    from umbra.service import UmbraService

    settings = Settings(tmp_path, 10_000)
    manager = LiveSessions(UmbraService(settings, Store(tmp_path / "test.sqlite3")))
    class Camera:
        closed = False
        def close(self):
            self.closed = True
    camera = Camera()
    manager.sessions["expired"] = LiveSession("scene", "map", tracker(), camera=camera, touched=time.monotonic() - 60)
    with pytest.raises(KeyError):
        manager.get("expired")
    assert camera.closed
    manager.close_all()
