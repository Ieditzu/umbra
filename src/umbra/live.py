"""Bounded local camera sessions using a previously saved position calibration."""

from __future__ import annotations

import base64
import ipaddress
import struct
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlsplit

import cv2
import numpy as np

from .position import PositionTracker
from .service import UmbraService


def decode_live_jpeg(data: bytes) -> np.ndarray:
    if not 4 <= len(data) <= 512_000 or data[:2] != b"\xff\xd8":
        raise ValueError("Send a JPEG frame smaller than 512 KB")
    # Inspect JPEG dimensions before native decoding to bound decompression.
    offset, dimensions = 2, None
    while offset + 4 <= len(data):
        if data[offset] != 0xFF:
            break
        while offset < len(data) and data[offset] == 0xFF:
            offset += 1
        marker = data[offset]
        offset += 1
        if marker in (0xD8, 0xD9, 0x01) or 0xD0 <= marker <= 0xD7:
            continue
        if offset + 2 > len(data):
            break
        length = struct.unpack(">H", data[offset:offset + 2])[0]
        if length < 2 or offset + length > len(data):
            break
        if marker in (0xC0, 0xC1, 0xC2) and length >= 7:
            dimensions = struct.unpack(">HH", data[offset + 3:offset + 7])
            break
        offset += length
    if dimensions is None or not 8 <= dimensions[0] <= 1080 or not 8 <= dimensions[1] <= 1920:
        raise ValueError("Live frames must be valid JPEGs no larger than 1920 × 1080")
    frame = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError("Could not decode the camera frame")
    return frame


def validate_camera_url(url: str) -> str:
    try:
        parsed = urlsplit(url)
        address = ipaddress.ip_address(parsed.hostname or "")
        _port = parsed.port
    except (ValueError, TypeError) as error:
        raise ValueError("Use an RTSP URL with the camera's private LAN IP address") from error
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
        address = address.ipv4_mapped
    networks = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"] if address.version == 4 else ["fc00::/7"]
    private_lan = any(address in ipaddress.ip_network(network) for network in networks)
    if parsed.scheme not in {"rtsp", "rtsps"} or not private_lan:
        raise ValueError("Only RTSP cameras at private LAN IP addresses are supported")
    if len(url) > 2048 or any(ord(char) < 32 for char in url):
        raise ValueError("Invalid camera URL")
    return url


class NetworkCamera:
    """Continuously drain RTSP into one latest frame; never replay a backlog."""

    def __init__(self, url: str) -> None:
        url = validate_camera_url(url)
        self.capture = cv2.VideoCapture(url, cv2.CAP_FFMPEG, [
            cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 4000,
            cv2.CAP_PROP_READ_TIMEOUT_MSEC, 1500,
        ])
        if not self.capture.isOpened():
            self.capture.release()
            raise ValueError("Could not connect to the LAN camera. Check its RTSP address and credentials.")
        self.lock = threading.Lock()
        self.stopped = threading.Event()
        self.ready = threading.Event()
        self.latest: tuple[np.ndarray, float, int] | None = None
        self.sequence = 0
        self.thread = threading.Thread(target=self._read, daemon=True, name="umbra-rtsp")
        self.thread.start()
        if not self.ready.wait(2):
            self.close()
            raise ValueError("The LAN camera connected but did not deliver a frame")

    def _read(self) -> None:
        try:
            while not self.stopped.is_set():
                ok, frame = self.capture.read()
                if not ok or frame is None or frame.size > 3840 * 2160 * 3:
                    break
                self.sequence += 1
                with self.lock:
                    self.latest = frame, time.monotonic(), self.sequence
                self.ready.set()
        finally:
            self.capture.release()
            self.stopped.set()

    def frame(self) -> tuple[np.ndarray, int]:
        with self.lock:
            if self.latest is None or time.monotonic() - self.latest[1] > 1.0:
                raise ValueError("The camera has no fresh frame. Reconnect the stream.")
            return self.latest[0].copy(), self.latest[2]

    def close(self) -> None:
        self.stopped.set()
        self.thread.join(timeout=2)


@dataclass
class LiveSession:
    scene_id: str
    calibration_id: str
    tracker: PositionTracker
    camera: NetworkCamera | None = None
    touched: float = field(default_factory=time.monotonic)
    lock: threading.Lock = field(default_factory=threading.Lock)
    last_sequence: int = -1
    last_result: dict[str, Any] | None = None


class LiveSessions:
    def __init__(self, service: UmbraService) -> None:
        self.service = service
        self.sessions: dict[str, LiveSession] = {}
        self.lock = threading.Lock()
        self.stopped = threading.Event()
        self.reaper: threading.Thread | None = None

    def _reap(self) -> None:
        while not self.stopped.wait(5):
            with self.lock:
                self._expire()

    def _expire(self) -> None:
        stale = [key for key, session in self.sessions.items() if time.monotonic() - session.touched > 45]
        for key in stale:
            session = self.sessions.pop(key)
            if session.camera:
                session.camera.close()

    def start(self, scene_id: str, camera_url: str | None = None) -> dict[str, Any]:
        with self.lock:
            self._expire()
            if len(self.sessions) >= 4:
                raise ValueError("Four live sessions are already open. Stop an unused camera first.")
            record, reference, noise = self.service.load_camera_position(scene_id)
            camera = NetworkCamera(camera_url) if camera_url else None
            session_id = str(uuid.uuid4())
            self.sessions[session_id] = LiveSession(scene_id, record["id"], PositionTracker(record["model"], reference, noise), camera)
            if self.reaper is None:
                self.reaper = threading.Thread(target=self._reap, daemon=True, name="umbra-live-cleanup")
                self.reaper.start()
        return {"id": session_id, "scene_id": scene_id, "source": "network" if camera else "browser", "calibration_id": record["id"]}

    def get(self, session_id: str) -> LiveSession:
        with self.lock:
            self._expire()
            session = self.sessions.get(session_id)
            if session is None:
                raise KeyError("Live session expired. Start detection again.")
            record = self.service.store.get_position_calibration(session.scene_id)
            latest = [m for m in self.service.store.list_media(session.scene_id) if m["role"] == "calibration"]
            if record is None or record["id"] != session.calibration_id or not latest or latest[-1]["id"] != record["calibration_media_id"]:
                raise ValueError("Camera calibration changed. Stop and restart detection.")
            session.touched = time.monotonic()
            return session

    def browser_frame(self, session_id: str, data: bytes) -> dict[str, Any]:
        session = self.get(session_id)
        if session.camera:
            raise ValueError("This session uses a network camera")
        if not session.lock.acquire(blocking=False):
            raise ValueError("Wait for the previous frame before sending another")
        try:
            return {**session.tracker.update(decode_live_jpeg(data)), "calibration_id": session.calibration_id}
        finally:
            session.lock.release()

    def network_frame(self, session_id: str) -> dict[str, Any]:
        session = self.get(session_id)
        if session.camera is None:
            raise ValueError("This session uses a browser camera")
        with session.lock:
            frame, sequence = session.camera.frame()
            if sequence == session.last_sequence and session.last_result:
                return session.last_result
            result = session.tracker.update(frame)
            h, w = frame.shape[:2]
            resized = cv2.resize(frame, (640, round(h * 640 / w)))
            ok, image = cv2.imencode(".jpg", resized, [cv2.IMWRITE_JPEG_QUALITY, 75])
            if not ok:
                raise ValueError("Could not encode camera preview")
            result.update(image="data:image/jpeg;base64," + base64.b64encode(image).decode(), sequence=sequence, calibration_id=session.calibration_id)
            session.last_sequence, session.last_result = sequence, result
            return result

    def close(self, session_id: str) -> None:
        with self.lock:
            session = self.sessions.pop(session_id, None)
        if session and session.camera:
            session.camera.close()

    def close_all(self) -> None:
        self.stopped.set()
        for key in list(self.sessions):
            self.close(key)
