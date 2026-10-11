"""Validate the private service boundary and public clip limits."""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from umbra import worker
from umbra.synthetic import generate_synthetic_bundle


def test_service_auth_and_path_validation(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(worker, "TOKEN", "t" * 32)
    monkeypatch.setattr(worker, "ROOT", tmp_path)
    client = TestClient(worker.app)
    assert client.get("/health").status_code == 401
    assert client.get("/health", headers={"Authorization": "Bearer " + "t" * 32}).status_code == 200
    for path in ("../video.mp4", "/etc/passwd", "media/invalid"):
        with pytest.raises(ValueError):
            worker.media_path(path)


def test_clip_duration_limits(monkeypatch, tmp_path: Path):
    media = tmp_path / "media"
    media.mkdir()
    name = "a" * 32
    (media / name).write_bytes(b"fixture")
    monkeypatch.setattr(worker, "ROOT", tmp_path)
    metadata = {"duration_s": 60, "frame_count": 600, "width": 640, "height": 360}
    monkeypatch.setattr(worker, "inspect_video", lambda _: metadata)
    assert worker.inspect_bounded("media/" + name, "main") == metadata
    with pytest.raises(ValueError):
        worker.inspect_bounded("media/" + name, "calibration")
    metadata["duration_s"] = 60.1
    with pytest.raises(ValueError):
        worker.inspect_bounded("media/" + name, "main")


def test_public_worker_synthetic_pipeline(monkeypatch, tmp_path: Path):
    """Use the real engine without the legacy local SQLite service."""
    import multiprocessing as mp
    import shutil

    monkeypatch.setattr(worker, "ROOT", tmp_path)
    media = tmp_path / "media"
    media.mkdir()
    bundle = generate_synthetic_bundle(tmp_path / "fixture", seed=7, frames=120,
                                       target_present=True, lighting="directional")
    ids = {"calibration": "a" * 32, "main": "b" * 32}
    shutil.copyfile(bundle.calibration_path, media / ids["calibration"])
    shutil.copyfile(bundle.main_path, media / ids["main"])
    receive, send = mp.Pipe(duplex=False)
    payload = {"id": "c" * 32, "attempt": "d" * 32,
               "paths": {role: "media/" + name for role, name in ids.items()},
               "scene": {"latitude": 44.4268, "longitude": 26.1025,
                         "recorded_at": "2026-06-21T12:00:00+00:00"}, "shadow_region": None}
    # Reader thread prevents the result/timeline from filling the IPC pipe buffer.
    import threading
    messages = []
    thread = threading.Thread(target=lambda: _read_messages(receive, messages))
    thread.start()
    worker.perform(payload, send)
    thread.join(10)
    result = messages[-1]
    assert "error" not in result
    assert result["result"]["analysis_id"] == "c" * 32
    assert result["result"]["state"] in {"early_warning", "entered_view", "strong_motion"}
    for relative in result["artifacts"].values():
        if relative:
            assert not Path(relative).is_absolute()
            assert (tmp_path / relative).is_file()


def _read_messages(receive, messages):
    try:
        while True:
            messages.append(receive.recv())
    except EOFError:
        receive.close()


def test_sampling_does_not_truncate_non_multiple_frame_rates(tmp_path: Path):
    import cv2
    import numpy as np

    from umbra.video import read_frames

    path = tmp_path / "25fps.mp4"
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), 25, (64, 48))
    assert writer.isOpened()
    for _ in range(150):
        writer.write(np.full((48, 64, 3), 100, dtype=np.uint8))
    writer.release()
    frames, timestamps, _ = read_frames(path, target_fps=10, max_frames=60)
    assert len(frames) <= 60
    assert timestamps[-1] >= 5.8
