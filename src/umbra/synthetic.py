"""Deterministic synthetic trials used before field recordings are available.

The synthetic renderer is a test fixture and pretraining aid, not a claim that
its simplified optics validate real-world non-line-of-sight performance.
"""

from __future__ import annotations

import csv
import json
from dataclasses import asdict, dataclass
from pathlib import Path

import cv2
import numpy as np

from .video import write_mp4


@dataclass(slots=True)
class SyntheticBundle:
    calibration_path: Path
    main_path: Path
    ground_truth_path: Path
    labels_path: Path
    metadata_path: Path
    seed: int
    frames: int
    target_present: bool
    lighting: str


def _draw_marker(canvas: np.ndarray, marker_id: int, origin: tuple[int, int], size: int = 36) -> None:
    aruco = cv2.aruco  # type: ignore[attr-defined]
    dictionary = aruco.getPredefinedDictionary(aruco.DICT_4X4_50)
    if hasattr(aruco, "generateImageMarker"):
        marker = aruco.generateImageMarker(dictionary, marker_id, size)
    else:  # OpenCV 4.6 compatibility
        marker = aruco.drawMarker(dictionary, marker_id, size)
    x, y = origin
    canvas[y : y + size, x : x + size] = cv2.cvtColor(marker, cv2.COLOR_GRAY2BGR)


def _base_corner(height: int, width: int, rng: np.random.Generator) -> tuple[np.ndarray, int]:
    y, x = np.mgrid[0:height, 0:width]
    pavement = 130 + 24 * (y / height) + 5 * np.sin(x / 18) + 3 * np.sin(y / 11)
    pavement += rng.normal(0, 2.0, size=(height, width))
    image = np.dstack((pavement * 0.86, pavement * 0.94, pavement)).clip(0, 255).astype(np.uint8)
    edge_x = int(width * 0.42)
    image[:, :edge_x] = (image[:, :edge_x] * np.array([0.52, 0.56, 0.60])).astype(np.uint8)
    cv2.line(image, (edge_x, 0), (edge_x, height - 1), (28, 34, 40), 5)
    cv2.line(image, (edge_x + 5, 0), (edge_x + 5, height - 1), (198, 202, 205), 1)
    return image, edge_x


def _add_penumbra(
    image: np.ndarray,
    edge_x: int,
    position: float,
    strength: float,
    frame_index: int,
) -> np.ndarray:
    result = image.astype(np.float32)
    height, width = image.shape[:2]
    center_y = int(height * (0.80 - 0.47 * position))
    center_x = int(edge_x + width * 0.19)
    yy, xx = np.mgrid[0:height, 0:width]
    spread_x, spread_y = width * 0.16, height * 0.11
    gaussian = np.exp(-(((xx - center_x) / spread_x) ** 2 + ((yy - center_y) / spread_y) ** 2) * 2.2)
    # A soft, shifting shade is the only target-dependent main-camera cue.
    shade = strength * gaussian * (0.82 + 0.18 * np.sin(frame_index * 0.7))
    result[:, :, 0] -= shade * 0.9
    result[:, :, 1] -= shade
    result[:, :, 2] -= shade * 1.1
    return result.clip(0, 255).astype(np.uint8)


def _ground_truth_frame(height: int, width: int, position: float | None) -> np.ndarray:
    image = np.full((height, width, 3), (70, 74, 78), dtype=np.uint8)
    y = height // 2
    cv2.rectangle(image, (42, y - 35), (width - 42, y + 35), (102, 108, 110), -1)
    cv2.line(image, (60, y), (width - 60, y), (224, 224, 224), 2)
    _draw_marker(image, 10, (20, y - 18))
    _draw_marker(image, 11, (width - 56, y - 18))
    if position is not None:
        x = int(60 + position * (width - 120))
        cv2.circle(image, (x, y - 14), 9, (46, 203, 239), -1)
        cv2.rectangle(image, (x - 12, y - 4), (x + 12, y + 25), (46, 203, 239), -1)
    return image


def generate_synthetic_bundle(
    destination: Path,
    *,
    seed: int = 7,
    frames: int = 120,
    target_present: bool = True,
    lighting: str = "directional",
    fps: float = 10,
) -> SyntheticBundle:
    """Create calibration, main, ground-truth, and labels in one reproducible folder."""

    destination.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(seed)
    height, width = 240, 360
    base, edge_x = _base_corner(height, width, rng)
    calibration: list[np.ndarray] = []
    main: list[np.ndarray] = []
    ground_truth: list[np.ndarray] = []
    labels: list[dict[str, float | int | bool]] = []

    for index in range(42):
        exposure = 0.98 + 0.015 * np.sin(index / 6)
        frame = (base.astype(np.float32) * exposure + rng.normal(0, 0.8, base.shape)).clip(0, 255)
        calibration.append(frame.astype(np.uint8))

    for index in range(frames):
        phase = index / max(1, frames - 1)
        position = 0.08 + 0.84 * phase
        if seed % 2:
            position = 0.92 - 0.84 * phase
        exposure = 0.95 + 0.06 * np.sin(index / 15)
        frame = (base.astype(np.float32) * exposure + rng.normal(0, 1.2, base.shape)).clip(0, 255).astype(np.uint8)
        strength = {"directional": 21.0, "flat": 3.0, "reflective": 11.0}.get(lighting, 21.0)
        if target_present:
            frame = _add_penumbra(frame, edge_x, position, strength, index)
        if lighting == "reflective":
            glare = int(18 + 15 * np.sin(index / 4))
            cv2.ellipse(frame, (width - 65, 65), (55, 25), 0, 0, 360, (glare, glare, glare), -1)
        main.append(frame)
        ground_truth.append(_ground_truth_frame(height, width, position if target_present else None))
        labels.append(
            {
                "frame": index,
                "timestamp_s": round(index / fps, 4),
                "position_norm": round(position, 5),
                "present": target_present,
            }
        )

    calibration_path = destination / "calibration.mp4"
    main_path = destination / "main.mp4"
    ground_truth_path = destination / "ground_truth.mp4"
    labels_path = destination / "ground_truth.csv"
    metadata_path = destination / "metadata.json"
    write_mp4(calibration_path, calibration, fps)
    write_mp4(main_path, main, fps)
    write_mp4(ground_truth_path, ground_truth, fps)
    with labels_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(labels[0]))
        writer.writeheader()
        writer.writerows(labels)
    metadata = {
        "generator": "umbra.synthetic.v1",
        "seed": seed,
        "frames": frames,
        "fps": fps,
        "target_present": target_present,
        "lighting": lighting,
        "track_length_m": 4.0,
        "corner_edge_x": edge_x,
        "warning": "Synthetic optical cues are for pipeline tests and pretraining only.",
    }
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return SyntheticBundle(
        calibration_path=calibration_path,
        main_path=main_path,
        ground_truth_path=ground_truth_path,
        labels_path=labels_path,
        metadata_path=metadata_path,
        seed=seed,
        frames=frames,
        target_present=target_present,
        lighting=lighting,
    )


def bundle_metadata(bundle: SyntheticBundle) -> dict[str, object]:
    payload = asdict(bundle)
    return {key: str(value) if isinstance(value, Path) else value for key, value in payload.items()}
