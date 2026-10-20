"""Short-lived browser, video-replay and LAN-camera parking sessions."""

from __future__ import annotations

import base64
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Annotated

import cv2
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from .live import NetworkCamera, decode_live_jpeg
from .parking import ParkingTracker
from .parking_detector import RoadUserDetector, install_model


@dataclass
class ParkingSession:
    tracker: ParkingTracker = field(default_factory=ParkingTracker)
    camera: NetworkCamera | None = None
    touched: float = field(default_factory=time.monotonic)
    lock: threading.Lock = field(default_factory=threading.Lock)
    sequence: int = -1
    result: dict | None = None


class ParkingSessions:
    def __init__(self, model_dir: Path):
        self.model_dir = model_dir
        self.detector = None
        self.sessions: dict[str, ParkingSession] = {}
        self.lock = threading.RLock()
        self.stopped = threading.Event()
        self.reaper: threading.Thread | None = None

    def start(self, camera_url: str | None = None):
        with self.lock:
            if len(self.sessions) >= 4:
                raise ValueError("Stop an unused parking camera before opening another")
            if self.detector is None:
                self.detector = RoadUserDetector(install_model(self.model_dir))
            camera = NetworkCamera(camera_url) if camera_url else None
            session_id = str(uuid.uuid4())
            self.sessions[session_id] = ParkingSession(camera=camera)
            if self.reaper is None:
                self.reaper = threading.Thread(target=self._reap, daemon=True, name="umbra-parking-cleanup")
                self.reaper.start()
            return {"id": session_id, "source": "network" if camera else "browser"}

    def _reap(self):
        while not self.stopped.wait(3):
            with self.lock:
                expired = [key for key, value in self.sessions.items() if time.monotonic() - value.touched > 45]
            for key in expired:
                self.close(key)

    def get(self, session_id):
        with self.lock:
            session = self.sessions.get(session_id)
            if not session or time.monotonic() - session.touched > 45:
                self.close(session_id)
                raise KeyError("Parking session expired. Start the camera again.")
            session.touched = time.monotonic()
            return session

    def frame(self, session_id: str, raw: bytes | None = None, timestamp: float | None = None):
        session = self.get(session_id)
        if not session.lock.acquire(blocking=False):
            raise ValueError("Wait for the previous frame")
        try:
            started = time.monotonic()
            if session.camera:
                if raw is not None:
                    raise ValueError("This session reads a LAN camera")
                frame, sequence = session.camera.frame()
                if sequence == session.sequence and session.result:
                    return session.result
                session.sequence = sequence
                timestamp = None
            else:
                if raw is None:
                    raise ValueError("Send a camera frame")
                frame = decode_live_jpeg(raw)
            detections = self.detector.detect(frame)
            result = session.tracker.update(frame, detections, timestamp)
            if session.camera:
                h, w = frame.shape[:2]
                encoded = cv2.imencode(".jpg", cv2.resize(frame, (640, round(h * 640 / w))), [cv2.IMWRITE_JPEG_QUALITY, 80])[1]
                result["image"] = "data:image/jpeg;base64," + base64.b64encode(encoded).decode()
            result["processing_ms"] = round((time.monotonic() - started) * 1000)
            session.result = result
            return result
        finally:
            session.lock.release()

    def reference(self, session_id):
        session = self.get(session_id)
        with session.lock:
            session.tracker.request_empty_reference()

    def close(self, session_id):
        with self.lock:
            session = self.sessions.pop(session_id, None)
        if session and session.camera:
            session.camera.close()

    def close_all(self):
        self.stopped.set()
        for key in list(self.sessions):
            self.close(key)


class ParkingStart(BaseModel):
    camera_url: str | None = Field(default=None, max_length=2048)


def parking_router(manager: ParkingSessions):
    router = APIRouter(prefix="/api/v1/parking", tags=["parking camera"])

    def checked(function, *args):
        try:
            return function(*args)
        except KeyError as error:
            raise HTTPException(404, "Parking session expired. Start again.") from error
        except (ValueError, OSError, cv2.error) as error:
            raise HTTPException(422, str(error)) from error

    @router.post("/sessions", status_code=201)
    def start(payload: ParkingStart):
        return checked(manager.start, payload.camera_url)

    @router.post("/sessions/{session_id}/frame")
    async def browser_frame(session_id: str, file: Annotated[UploadFile, File()], timestamp_s: Annotated[float | None, Form(ge=0, le=86400)] = None):
        try:
            raw = await file.read(512_001)
            return await run_in_threadpool(checked, manager.frame, session_id, raw, timestamp_s)
        finally:
            await file.close()

    @router.get("/sessions/{session_id}/frame")
    def network_frame(session_id: str):
        return checked(manager.frame, session_id)

    @router.post("/sessions/{session_id}/reference")
    def reference(session_id: str):
        checked(manager.reference, session_id)
        return {"status": "measuring_empty_view"}

    @router.delete("/sessions/{session_id}")
    def close(session_id: str):
        manager.close(session_id)
        return {"id": session_id}

    return router
