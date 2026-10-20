"""Causal parking-view tracking and conservative image-space approach warnings."""

from __future__ import annotations

import time
from collections import deque

import cv2
import numpy as np


def compensate_camera(previous: np.ndarray, current: np.ndarray, excluded: list[list[float]]) -> tuple[np.ndarray, bool]:
    height, width = previous.shape
    mask = np.full(previous.shape, 255, dtype=np.uint8)
    for x, y, bw, bh in excluded:
        mask[max(0, int(y * height) - 8):min(height, int((y + bh) * height) + 8),
             max(0, int(x * width) - 8):min(width, int((x + bw) * width) + 8)] = 0
    points = cv2.goodFeaturesToTrack(previous, maxCorners=250, qualityLevel=0.015, minDistance=8, mask=mask)
    identity = np.array([[1., 0., 0.], [0., 1., 0.]])
    if points is None or len(points) < 14:
        return identity, False
    tracked, valid, _ = cv2.calcOpticalFlowPyrLK(previous, current, points, None)
    if tracked is None or valid is None or valid.sum() < 14:
        return identity, False
    good = valid.ravel() == 1
    transform, inliers = cv2.estimateAffinePartial2D(points[good], tracked[good], method=cv2.RANSAC, ransacReprojThreshold=2)
    if transform is None or inliers is None or inliers.sum() < 14 or inliers.mean() < 0.65:
        return identity, False
    scale = np.hypot(transform[0, 0], transform[1, 0])
    if not 0.92 < scale < 1.08 or abs(np.arctan2(transform[1, 0], transform[0, 0])) > 0.1:
        return identity, False
    return transform, True


class ParkingTracker:
    def __init__(self):
        self.previous: np.ndarray | None = None
        self.tracks: list[dict] = []
        self.next_id = 1
        self.last_time: float | None = None
        self.background: np.ndarray | None = None
        self.reference_frames: list[np.ndarray] | None = None
        self.shadow_history: deque = deque(maxlen=8)

    def request_empty_reference(self):
        self.background = None
        self.reference_frames = []
        self.shadow_history.clear()

    def update(self, frame: np.ndarray, detections: list[dict], timestamp: float | None = None) -> dict:
        now = time.monotonic() if timestamp is None else timestamp
        height, width = frame.shape[:2]
        gray = cv2.cvtColor(cv2.resize(frame, (480, round(height * 480 / width))), cv2.COLOR_BGR2GRAY)
        if self.last_time is not None and (now <= self.last_time or now - self.last_time > 2.5):
            self.tracks, self.previous = [], None
            self.background, self.reference_frames = None, None
            self.shadow_history.clear()
        dt = now - self.last_time if self.last_time is not None else 0
        transform, reliable = (compensate_camera(self.previous, gray, [t["box"] for t in self.tracks])
                               if self.previous is not None and self.previous.shape == gray.shape else (None, False))
        old = self.tracks
        matched: set[int] = set()
        updated, alerts = [], []
        for detection in detections:
            x, y, bw, bh = detection["box"]
            point = np.array([x + bw / 2, y + bh])
            candidates = []
            for index, track in enumerate(old):
                if index in matched or track["label"] != detection["label"]:
                    continue
                center = np.array(track["point"])
                if reliable:
                    gh, gw = gray.shape
                    center = (transform[:, :2] @ (center * [gw, gh]) + transform[:, 2]) / [gw, gh]
                distance = float(np.linalg.norm(point - center))
                if distance < max(0.12, bw * 0.6):
                    candidates.append((distance, index, center))
            track = {**detection, "point": point.tolist(), "id": self.next_id, "age": 1, "velocity": None}
            if candidates:
                _, index, previous_point = min(candidates, key=lambda item: item[0])
                matched.add(index)
                track["id"], track["age"] = old[index]["id"], old[index]["age"] + 1
                if reliable and dt > 0.04:
                    velocity = (point - previous_point) / dt
                    prior = old[index].get("velocity")
                    if prior is not None:
                        velocity = 0.65 * velocity + 0.35 * np.asarray(prior)
                    track["velocity"] = velocity.tolist()
            else:
                self.next_id += 1
            # Normalized image-space corridor, NOT a measured stopping distance.
            in_path = 0.34 <= point[0] <= 0.66 and point[1] > 0.42
            approaching = False
            side = "left" if point[0] < 0.5 else "right"
            if track["velocity"] is not None and track["age"] >= 3:
                vx, _vy = track["velocity"]
                approaching = (point[1] > 0.25 and abs(vx) > 0.025
                               and ((point[0] < 0.34 and vx > 0) or (point[0] > 0.66 and vx < 0))
                               and 0.22 < point[0] + vx * 1.5 < 0.78)
            track["risk"] = "in_path" if in_path and track["age"] >= 2 else "approaching" if approaching else "observed"
            if track["risk"] != "observed":
                alerts.append({"id": track["id"], "label": track["label"], "side": side, "kind": track["risk"]})
            updated.append(track)
        self.tracks = updated
        shadow = self._shadow(gray, detections, now, transform, reliable)
        self.previous, self.last_time = gray, now
        status = "obstacle" if any(a["kind"] == "in_path" for a in alerts) else "cross_traffic" if alerts else "observing"
        if status == "obstacle":
            message = "Object in the exit path"
        elif status == "cross_traffic":
            message = "Approaching from " + " and ".join(sorted({a["side"] for a in alerts}))
        elif shadow.get("box"):
            status, message = "shadow_cue", "Changing shadow · check the blind spot"
        else:
            message = "Observing · check surroundings"
        if float(np.mean(gray)) < 18 or float(np.mean(gray > 250)) > 0.85:
            status, message, alerts = "limited", "Limited visibility · check surroundings", []
            for track in updated:
                track["risk"] = "observed"
        return {"state": status, "message": message, "detections": updated, "alerts": alerts,
                "motion_reliable": reliable, "shadow": shadow, "frame_aspect": width / height,
                "timestamp_s": now, "warning_basis": "image-space experimental heuristic"}

    def _shadow(self, gray, detections, now, transform, reliable):
        if self.reference_frames is not None:
            if any(d["label"] == "person" for d in detections):
                self.reference_frames.clear()
                return {"state": "calibrating", "message": "Keep people out of the reference view", "progress": 0}
            if transform is not None and reliable and np.linalg.norm(transform[:, 2]) > 1.2:
                self.reference_frames.clear()
                return {"state": "calibrating", "message": "Hold the camera still", "progress": 0}
            if self.reference_frames and self.reference_frames[0].shape != gray.shape:
                self.reference_frames.clear()
            self.reference_frames.append(cv2.GaussianBlur(gray.astype(np.float32), (3, 3), 0))
            if len(self.reference_frames) < 8:
                return {"state": "calibrating", "message": "Measuring empty view", "progress": len(self.reference_frames) / 8}
            self.background = np.median(self.reference_frames, axis=0)
            self.reference_frames = None
        if self.background is None:
            return {"state": "needs_reference", "message": "Set an empty view to watch shadow changes"}
        if gray.shape != self.background.shape:
            self.background = None
            return {"state": "needs_reference", "message": "Camera framing changed"}
        if transform is not None and (not reliable or np.linalg.norm(transform[:, 2]) > 1.5
                                      or abs(transform[0, 0] - 1) > 0.004):
            self.background = None
            self.shadow_history.clear()
            return {"state": "camera_moved", "message": "Set a new empty view when the camera is stopped"}
        reference = self.background
        current = cv2.GaussianBlur(gray.astype(np.float32), (3, 3), 0)
        difference = current - reference
        difference -= np.median(difference)
        if float(np.mean(np.abs(difference) > 22)) > 0.3:
            self.background = None
            self.shadow_history.clear()
            return {"state": "camera_moved", "message": "View or light changed; set a new empty view"}
        mask = ((difference < -16) & (reference > 45)).astype(np.uint8)
        h, w = gray.shape
        mask[:int(h * 0.48)] = 0
        for detection in detections:
            x, y, bw, bh = detection["box"]
            mask[max(0, int(y * h) - 5):min(h, int((y + bh) * h) + 5),
                 max(0, int(x * w) - 5):min(w, int((x + bw) * w) + 5)] = 0
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        count, _, stats, centers = cv2.connectedComponentsWithStats(mask)
        candidates = []
        for i in range(1, count):
            x, y, bw, bh, area = stats[i]
            if 80 < area < mask.size * 0.12 and bw > 1.8 * bh:
                candidates.append((area, i))
        if not candidates:
            self.shadow_history.clear()
            return {"state": "watching", "message": "Watching the visible ground"}
        _, chosen = max(candidates)
        center = centers[chosen] / [w, h]
        if self.shadow_history and np.linalg.norm(center - self.shadow_history[-1][1]) > 0.12:
            self.shadow_history.clear()
        self.shadow_history.append((now, center))
        if len(self.shadow_history) < 3:
            return {"state": "watching", "message": "Checking shadow change"}
        movement = np.linalg.norm(center - self.shadow_history[0][1])
        if movement < 0.008:
            return {"state": "watching", "message": "Watching the visible ground"}
        x, y, bw, bh, _area = stats[chosen]
        return {"state": "possible_motion", "message": "Changing shadow; source is unconfirmed",
                "box": [float(x / w), float(y / h), float(bw / w), float(bh / h)]}
