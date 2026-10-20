"""Parking tracking/API checks. Mock detections test logic, not detector accuracy."""

import time

import cv2
import numpy as np
from fastapi.testclient import TestClient

from umbra.api import create_app
from umbra.config import Settings
from umbra.parking import ParkingTracker
from umbra.parking_api import ParkingSession, ParkingSessions
from umbra.parking_detector import RoadUserDetector


def background():
    rng = np.random.default_rng(340)
    pixels = rng.integers(70, 185, (270, 480), dtype=np.uint8)
    pixels = cv2.GaussianBlur(pixels, (3, 3), 0)
    return cv2.cvtColor(pixels, cv2.COLOR_GRAY2BGR)


def road_user(x, label="car", y=0.45):
    return {"label": label, "score": 0.92, "box": [x, y, 0.12, 0.2]}


def test_cross_traffic_is_causal_requires_history_and_uses_relative_motion():
    image = background()
    first, replay = ParkingTracker(), ParkingTracker()
    outputs = []
    for i, x in enumerate([0.04, 0.08, 0.12, 0.16]):
        result = first.update(image, [road_user(x)], 10 + i * 0.2)
        outputs.append(result)
        assert result == replay.update(image, [road_user(x)], 10 + i * 0.2)
    assert outputs[0]["state"] == "observing"
    assert outputs[-1]["state"] == "cross_traffic"
    assert outputs[-1]["alerts"][0]["side"] == "left"
    assert first.update(image, [], 11)["alerts"] == []
    # A new scene cannot retain tracks/velocity from the old view.
    assert first.update(image, [road_user(0.16)], 1)["state"] == "observing"


def test_departing_or_static_side_objects_do_not_raise_cross_traffic():
    image = background()
    for positions in [[0.16, 0.12, 0.08, 0.04], [0.08] * 4]:
        tracker = ParkingTracker()
        results = [tracker.update(image, [road_user(x)], 1 + i * 0.2) for i, x in enumerate(positions)]
        assert all(result["state"] == "observing" for result in results)


def test_bad_exposure_is_limited_not_a_clear_path_or_collision_claim():
    for brightness in [0, 255]:
        tracker = ParkingTracker()
        image = np.full((270, 480, 3), brightness, dtype=np.uint8)
        tracker.update(image, [road_user(0.44)], 1)
        result = tracker.update(image, [road_user(0.44)], 1.2)
        assert result["state"] == "limited"
        assert result["alerts"] == []


def test_visible_path_obstacle_does_not_require_an_empty_scene_or_mapping():
    tracker = ParkingTracker()
    image = background()
    tracker.update(image, [road_user(0.44, "person")], 1)
    result = tracker.update(image, [road_user(0.44, "person")], 1.3)
    assert result["state"] == "obstacle"
    assert result["detections"][0]["risk"] == "in_path"
    assert result["shadow"]["state"] == "needs_reference"


def test_camera_translation_does_not_turn_a_static_car_into_cross_traffic():
    image = background()
    tracker = ParkingTracker()
    for i in range(4):
        shifted = cv2.warpAffine(image, np.float32([[1, 0, i * 8], [0, 1, 0]]), (480, 270), borderMode=cv2.BORDER_REFLECT)
        output = tracker.update(shifted, [road_user(0.05 + i * 8 / 480)], 1 + i * 0.2)
        assert output["state"] == "observing"
    assert output["motion_reliable"]


def test_shadow_reference_requires_stillness_and_missing_cues_clear_immediately():
    image = background()
    tracker = ParkingTracker()
    tracker.request_empty_reference()
    for i in range(8):
        output = tracker.update(image, [], i * 0.2 + 1)
    assert output["shadow"]["state"] == "watching"
    for i, x in enumerate([150, 159, 168, 177]):
        shadow = image.copy()
        cv2.ellipse(shadow, (x, 210), (42, 7), 0, 0, 360, (30, 30, 30), -1)
        output = tracker.update(shadow, [], 3 + i * 0.2)
    assert output["shadow"]["state"] == "possible_motion"
    assert "source is unconfirmed" in output["shadow"]["message"]
    assert tracker.update(image, [], 4)["shadow"].get("box") is None
    moved = cv2.warpAffine(image, np.float32([[1, 0, 10], [0, 1, 0]]), (480, 270), borderMode=cv2.BORDER_REFLECT)
    assert tracker.update(moved, [], 4.2)["shadow"]["state"] == "camera_moved"


def test_detector_decodes_and_filters_coco_classes_without_downloading_model():
    class Net:
        def setInput(self, blob):
            assert blob.shape == (1, 3, 640, 640)
            # OpenCV Zoo expects RGB values in the original [0,255] range.
            assert blob[0, 0, 0, 0] == 30
        def forward(self):
            output = np.zeros((1, 8400, 85), dtype=np.float32)
            output[0, 0, :5] = [3, 3, 2, 2, 0.95]
            output[0, 0, 5] = 0.9  # person
            output[0, 1, :5] = [15, 15, 2, 2, 0.95]
            output[0, 1, 5 + 56] = 0.9  # chair, not a road user
            return output
    instance = RoadUserDetector.__new__(RoadUserDetector)
    import threading
    instance.net, instance.lock = Net(), threading.Lock()
    grids, strides = [], []
    for stride in (8, 16, 32):
        yy, xx = np.mgrid[:640 // stride, :640 // stride]
        grids.append(np.stack((xx, yy), axis=-1).reshape(-1, 2))
        strides.append(np.full((len(grids[-1]), 1), stride))
    instance.grid, instance.strides = np.concatenate(grids), np.concatenate(strides)
    result = instance.detect(np.full((360, 640, 3), [10, 20, 30], dtype=np.uint8))
    assert len(result) == 1 and result[0]["label"] == "person"
    assert all(0 <= coordinate <= 1 for coordinate in result[0]["box"])


def test_parking_api_starts_without_scene_training_and_expires_stale_sessions(tmp_path):
    settings = Settings(tmp_path, 10_000_000)
    settings.ensure_directories()
    app = create_app(settings)
    class Detector:
        def detect(self, _frame):
            return [road_user(0.44, "person")]
    app.state.parking.detector = Detector()
    encoded = cv2.imencode(".jpg", background())[1].tobytes()
    with TestClient(app) as client:
        start = client.post("/api/v1/parking/sessions", json={})
        assert start.status_code == 201
        session_id = start.json()["id"]
        route = f"/api/v1/parking/sessions/{session_id}"
        for timestamp in [1, 1.3]:
            response = client.post(route + "/frame", files={"file": ("parking.jpg", encoded)}, data={"timestamp_s": timestamp})
            assert response.status_code == 200, response.text
        assert response.json()["state"] == "obstacle"
        assert client.post(route + "/reference").status_code == 200
        assert client.post(route + "/frame", files={"file": ("bad.jpg", b"invalid")}).status_code == 422
        assert client.post(route + "/frame", files={"file": ("a.jpg", encoded)}, data={"timestamp_s": -1}).status_code == 422
        app.state.parking.sessions[session_id].touched = time.monotonic() - 60
        assert client.post(route + "/frame", files={"file": ("a.jpg", encoded)}).status_code == 404
        assert client.delete(route).status_code == 200


def test_expiry_releases_network_reader(tmp_path):
    manager = ParkingSessions(tmp_path)
    class Reader:
        closed = False
        def close(self):
            self.closed = True
    reader = Reader()
    manager.sessions["expired"] = ParkingSession(camera=reader, touched=time.monotonic() - 60)
    import pytest
    with pytest.raises(KeyError):
        manager.get("expired")
    assert reader.closed
    manager.close_all()
