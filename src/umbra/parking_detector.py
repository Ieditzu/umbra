"""COCO road-user detection with OpenCV Zoo's Apache-2.0 YOLOX model.

Preprocessing/anchor conventions follow the published OpenCV Zoo demo:
https://github.com/opencv/opencv_zoo/tree/main/models/object_detection_yolox
This adapter is independently integrated with Umbra's local camera pipeline.
"""

from __future__ import annotations

import hashlib
import threading
import urllib.error
import urllib.request
from pathlib import Path

import cv2
import numpy as np

REVISION = "47534e27c9851bb1128ccc0102f1145e27f23f98"
MODEL_SHA256 = "c5c2d13e59ae883e6af3b45daea64af4833a4951c92d116ec270d9ddbe998063"
MODEL_URL = f"https://media.githubusercontent.com/media/opencv/opencv_zoo/{REVISION}/models/object_detection_yolox/object_detection_yolox_2022nov.onnx"
CLASSES = {0: "person", 1: "bicycle", 2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}


def install_model(directory: Path) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    destination = directory / "yolox.onnx"
    if destination.is_file() and hashlib.sha256(destination.read_bytes()).hexdigest() == MODEL_SHA256:
        return destination
    temporary = directory / "yolox.onnx.download"
    try:
        request = urllib.request.Request(MODEL_URL, headers={"User-Agent": "Umbra parking research"})
        digest = hashlib.sha256()
        received = 0
        with urllib.request.urlopen(request, timeout=30) as response, temporary.open("wb") as output:
            while block := response.read(1024 * 1024):
                received += len(block)
                if received > 40_000_000:
                    raise ValueError("Parking detector download exceeded its expected size")
                digest.update(block)
                output.write(block)
        if digest.hexdigest() != MODEL_SHA256:
            raise ValueError("Parking detector checksum failed")
        temporary.replace(destination)
        # Keep the model's license alongside its externally stored weights.
        license_url = f"https://raw.githubusercontent.com/opencv/opencv_zoo/{REVISION}/models/object_detection_yolox/LICENSE"
        with urllib.request.urlopen(license_url, timeout=15) as response:
            (directory / "LICENSE").write_bytes(response.read(50_000))
    except (OSError, urllib.error.URLError, ValueError) as error:
        temporary.unlink(missing_ok=True)
        raise ValueError("Could not prepare the parking detector. Check internet access and try again.") from error
    return destination


class RoadUserDetector:
    def __init__(self, path: Path):
        self.net = cv2.dnn.readNetFromONNX(str(path))
        self.net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
        self.net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
        self.lock = threading.Lock()
        grids, strides = [], []
        for stride in (8, 16, 32):
            yy, xx = np.mgrid[:640 // stride, :640 // stride]
            grids.append(np.stack((xx, yy), axis=-1).reshape(-1, 2))
            strides.append(np.full((len(grids[-1]), 1), stride))
        self.grid, self.strides = np.concatenate(grids), np.concatenate(strides)

    def detect(self, frame: np.ndarray) -> list[dict]:
        height, width = frame.shape[:2]
        scale = min(640 / width, 640 / height)
        image = np.full((640, 640, 3), 114, dtype=np.float32)
        resized = cv2.resize(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB), (int(width * scale), int(height * scale)))
        image[:resized.shape[0], :resized.shape[1]] = resized
        blob = image.transpose(2, 0, 1)[None]
        with self.lock:
            self.net.setInput(blob)
            output = self.net.forward()[0].copy()
        scores = output[:, 4:5] * output[:, 5:]
        labels = scores.argmax(axis=1)
        confidence = scores.max(axis=1)
        keep = (confidence >= 0.4) & np.isin(labels, list(CLASSES))
        if not np.any(keep):
            return []
        selected = output[keep, :4]
        centers = (selected[:, :2] + self.grid[keep]) * self.strides[keep]
        sizes = np.exp(np.clip(selected[:, 2:4], -10, 10)) * self.strides[keep]
        boxes = np.column_stack((centers - sizes / 2, sizes)) / scale
        confidence, labels = confidence[keep], labels[keep]
        indices = cv2.dnn.NMSBoxesBatched(boxes.tolist(), confidence.tolist(), labels.tolist(), 0.4, 0.45)
        detections = []
        for index in np.asarray(indices).reshape(-1):
            x, y, bw, bh = boxes[index]
            x0, y0 = np.clip([x / width, y / height], 0, 1)
            x1, y1 = np.clip([(x + bw) / width, (y + bh) / height], 0, 1)
            if x1 > x0 and y1 > y0:
                detections.append({"label": CLASSES[int(labels[index])], "score": round(float(confidence[index]), 3),
                                   "box": [float(x0), float(y0), float(x1 - x0), float(y1 - y0)]})
        return detections
