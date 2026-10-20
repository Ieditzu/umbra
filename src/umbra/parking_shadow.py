"""Causal indirect-light cues, not hidden-person reconstruction.

The reference contains only previously received frames. A local colour attenuation
test and preserved ground texture distinguish candidate shadows from plain dark
foreground. All thresholds are experimental; the output is evidence, not identity.
"""

from __future__ import annotations

from collections import deque

import cv2
import numpy as np


class GroundShadowMonitor:
    ZONES = {"ground": (0., 0.42, 1., 0.58), "left": (0., 0.42, 0.5, 0.58),
             "right": (0.5, 0.42, 0.5, 0.58)}

    def __init__(self):
        self.zone = "ground"
        self.reset()

    def reset(self):
        self.reference = None
        self.samples: list[np.ndarray] = []
        self.candidates: list[dict] = []
        self.next_id = 1
        self.displacement = np.eye(3)

    def set_zone(self, zone: str):
        if zone not in self.ZONES:
            raise ValueError("Choose ground, left or right")
        self.zone = zone
        self.reset()

    def update(self, image, detections, now, transform, reliable):
        h, w = image.shape[:2]
        x, y, bw, bh = self.ZONES[self.zone]
        region = np.zeros((h, w), bool)
        region[int(y * h):int((y + bh) * h), int(x * w):int((x + bw) * w)] = True
        excluded = np.zeros((h, w), np.uint8)
        moving_foreground = np.zeros((h, w), np.uint8)
        for item in detections:
            dx, dy, dw, dh = item["box"]
            rows = slice(max(0, int(dy * h) - 10), min(h, int((dy + dh) * h) + 10))
            cols = slice(max(0, int(dx * w) - 10), min(w, int((dx + dw) * w) + 10))
            excluded[rows, cols] = 1
            if item.get("label") == "person" or np.linalg.norm(item.get("velocity") or [0, 0]) > 0.015:
                moving_foreground[rows, cols] = 1
        base = {"zone": self.zone, "region": list(self.ZONES[self.zone]), "cues": []}

        def state(name, message, **extra):
            return {**base, "state": name, "message": message, **extra}

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        if gray.mean() < 18 or np.mean(gray > 250) > 0.85:
            self.reset()
            return state("limited", "Not enough usable ground illumination")
        # Full-view texture is needed to distinguish camera movement from cues.
        if transform is not None and not reliable:
            self.reset()
            return state("unstable", "Cannot verify that the camera is stopped")
        if transform is not None:
            step = np.vstack([transform, [0, 0, 1]])
            self.displacement = step @ self.displacement
            if (np.linalg.norm(self.displacement[:2, 2]) > 2.5
                    or abs(self.displacement[0, 0] - 1) > 0.006
                    or abs(self.displacement[1, 0]) > 0.006):
                self.reset()
                return state("camera_moved", "Camera moved · waiting for a stopped view")
        current = cv2.GaussianBlur(image.astype(np.float32), (3, 3), 0)
        if self.reference is None:
            # A reference is not certified empty. Avoid absorbing observed road
            # users; unknown/static shadows may still be in the initial view.
            if np.mean(moving_foreground[region]) > 0.08:
                self.samples.clear()
                self.displacement = np.eye(3)
                return state("calibrating", "Waiting for clear visible ground", progress=0)
            self.samples.append(current)
            if len(self.samples) < 12:
                return state("calibrating", "Learning stopped ground view", progress=len(self.samples) / 12)
            self.reference = np.median(self.samples, axis=0)
            self.samples.clear()
        reference = self.reference
        if reference.shape != current.shape:
            self.reset()
            return state("camera_moved", "Camera framing changed")
        support = (reference.min(axis=2) > 35) & (reference.max(axis=2) < 240) & ~excluded.astype(bool)
        if support.sum() < h * w * 0.12:
            self.reset()
            return state("limited", "Not enough stable background for light compensation")
        ratios = (current + 1) / (reference + 1)
        gains = np.median(ratios[support], axis=0)
        if np.any(gains < 0.65) or np.any(gains > 1.5):
            self.reset()
            return state("light_changed", "Large lighting change · relearning ground")
        normalized = current / gains
        residual = np.mean(np.abs(normalized - reference), axis=2)
        if np.mean(residual[support] > 24) > 0.28:
            self.reset()
            return state("light_changed", "View or illumination changed · relearning ground")
        attenuation = (normalized + 1) / (reference + 1)
        darkness = 1 - attenuation.mean(axis=2)
        # Similar channel attenuation favours light loss rather than a coloured
        # foreground object. The texture check below is also required.
        mask = (region & support & (darkness > 0.12) & (darkness < 0.78)
                & (attenuation.max(axis=2) - attenuation.min(axis=2) < 0.16)).astype(np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        mask[~region | excluded.astype(bool)] = 0
        count, labels, stats, centers = cv2.connectedComponentsWithStats(mask)
        reference_gray = cv2.cvtColor(reference, cv2.COLOR_BGR2GRAY)
        current_gray = cv2.cvtColor(normalized.astype(np.float32), cv2.COLOR_BGR2GRAY)
        detail_ref = reference_gray - cv2.GaussianBlur(reference_gray, (9, 9), 0)
        detail_now = current_gray - cv2.GaussianBlur(current_gray, (9, 9), 0)
        old, fresh, used, cues = self.candidates, [], set(), []
        for index in sorted(range(1, count), key=lambda i: -stats[i, 4])[:8]:
            sx, sy, sw, sh, area = stats[index]
            if not 65 < area < region.sum() * 0.25 or min(sw, sh) < 4:
                continue
            inside = cv2.erode((labels == index).astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
            if inside.sum() < 25:
                continue
            a, b = detail_ref[inside], detail_now[inside]
            energy = float(np.mean(a * a))
            correlation = float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-6))
            if energy < 1.5 or correlation < 0.55:
                continue
            center = centers[index] / [w, h]
            matches = [(float(np.linalg.norm(center - item["center"])), i, item)
                       for i, item in enumerate(old) if i not in used
                       and now - item["time"] < 1.2
                       and 0.35 < area / item["area"] < 2.8]
            matches = [entry for entry in matches if entry[0] < 0.13]
            if matches:
                _, previous_index, previous = min(matches, key=lambda entry: entry[0])
                used.add(previous_index)
                history = deque(previous["history"], maxlen=12)
                cue_id = previous["id"]
            else:
                history, cue_id = deque(maxlen=12), self.next_id
                self.next_id += 1
            history.append((now, center))
            fresh.append({"id": cue_id, "center": center, "time": now, "history": history, "area": area})
            if len(history) < 3 or now - history[0][0] < 0.18:
                continue
            movement = float(np.linalg.norm(center - history[0][1]))
            if movement < 0.008:
                continue
            times = np.array([entry[0] - history[0][0] for entry in history])
            points = np.array([entry[1] for entry in history])
            velocity = np.linalg.lstsq(np.stack([times, np.ones_like(times)], axis=1), points, rcond=None)[0][0]
            direction = "rightward" if velocity[0] > 0.015 else "leftward" if velocity[0] < -0.015 else "vertical"
            contour = max(cv2.findContours((labels == index).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0], key=cv2.contourArea)
            contour = cv2.approxPolyDP(contour, 2, True).reshape(-1, 2) / [w, h]
            cues.append({"id": cue_id, "box": [float(sx / w), float(sy / h), float(sw / w), float(sh / h)],
                         "contour": contour.tolist(), "side": "left" if center[0] < 0.5 else "right",
                         "direction": direction, "velocity_image_s": velocity.tolist(),
                         "texture_correlation": round(correlation, 3), "attenuation": round(float(np.median(darkness[inside])), 3),
                         "observed_since_s": history[0][0], "source": "unconfirmed"})
        # Retain identity briefly across an uncertain observation, but never
        # emit a contour/warning from a missing current-frame measurement.
        self.candidates = fresh + [item for i, item in enumerate(old)
                                   if i not in used and now - item["time"] < 0.8]
        if not cues:
            return state("watching", "Watching ground · no confirmed indirect cue")
        return state("possible_motion", "Moving shadow · source is unconfirmed", cues=cues, box=cues[0]["box"])
