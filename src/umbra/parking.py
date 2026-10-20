"""Causal parking-view tracking and conservative image-space approach warnings."""

from __future__ import annotations

import time

import cv2
import numpy as np

from .parking_evidence import ParkingEvidence
from .parking_shadow import GroundShadowMonitor


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
        self.shadow_monitor = GroundShadowMonitor()
        self.evidence = ParkingEvidence()

    def request_empty_reference(self):
        self.shadow_monitor.reset()
        self.evidence.open.clear()

    def set_shadow_zone(self, zone: str):
        self.shadow_monitor.set_zone(zone)
        self.evidence.open.clear()

    def update(self, frame: np.ndarray, detections: list[dict], timestamp: float | None = None) -> dict:
        now = time.monotonic() if timestamp is None else timestamp
        height, width = frame.shape[:2]
        small = cv2.resize(frame, (480, round(height * 480 / width)))
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        if self.last_time is not None and (now <= self.last_time or now - self.last_time > 2.5):
            self.tracks, self.previous = [], None
            self.shadow_monitor.reset()
            self.evidence = ParkingEvidence()
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
        shadow = self.shadow_monitor.update(small, updated, now, transform, reliable)
        self.evidence.update(shadow, now, updated)
        self.previous, self.last_time = gray, now
        status = "obstacle" if any(a["kind"] == "in_path" for a in alerts) else "cross_traffic" if alerts else "observing"
        if status == "obstacle":
            message = "Object in the exit path"
        elif status == "cross_traffic":
            message = "Approaching from " + " and ".join(sorted({a["side"] for a in alerts}))
        elif shadow.get("box"):
            status, message = "shadow_cue", "Moving shadow · check the blind spot"
        else:
            message = "Observing · check surroundings"
        if float(np.mean(gray)) < 18 or float(np.mean(gray > 250)) > 0.85:
            status, message, alerts = "limited", "Limited visibility · check surroundings", []
            for track in updated:
                track["risk"] = "observed"
        return {"state": status, "message": message, "detections": updated, "alerts": alerts,
                "motion_reliable": reliable, "shadow": shadow, "frame_aspect": width / height,
                "timestamp_s": now, "warning_basis": "image-space experimental heuristic",
                "evidence": self.evidence.snapshot()}
