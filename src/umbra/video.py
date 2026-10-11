"""Video IO and conservative synchronization helpers."""

from __future__ import annotations

import math
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path

import cv2
import numpy as np


@dataclass(slots=True)
class VideoInfo:
    fps: float
    frame_count: int
    width: int
    height: int
    duration_s: float


def inspect_video(path: Path) -> dict[str, float | int]:
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise ValueError("Umbra could not decode this video. Convert it to MP4/WebM and retry.")
    fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)
    count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    capture.release()
    if fps <= 0 or width <= 0 or height <= 0:
        raise ValueError("The video is missing usable frame-rate or dimensions metadata.")
    return asdict(VideoInfo(fps=fps, frame_count=count, width=width, height=height, duration_s=count / fps))


def read_frames(
    path: Path,
    *,
    target_fps: float = 10,
    max_frames: int = 600,
    resize_width: int = 480,
) -> tuple[list[np.ndarray], list[float], dict[str, float | int]]:
    """Decode a bounded, uniformly sampled analysis stream."""

    info_dict = inspect_video(path)
    info = VideoInfo(**info_dict)
    # Never sample faster than the target: 60s clips must fit within 600 samples.
    step = max(1, math.ceil(info.fps / target_fps))
    capture = cv2.VideoCapture(str(path))
    frames: list[np.ndarray] = []
    timestamps: list[float] = []
    source_index = 0
    while len(frames) < max_frames:
        ok, frame = capture.read()
        if not ok:
            break
        if source_index % step == 0:
            if frame.shape[1] > resize_width:
                ratio = resize_width / frame.shape[1]
                frame = cv2.resize(frame, (resize_width, round(frame.shape[0] * ratio)))
            frames.append(frame)
            timestamps.append(source_index / info.fps)
        source_index += 1
    capture.release()
    if not frames:
        raise ValueError("No decodable frames were found in this video.")
    return frames, timestamps, info_dict


def write_mp4(path: Path, frames: list[np.ndarray], fps: float = 10) -> None:
    if not frames:
        raise ValueError("Cannot write an empty video")
    height, width = frames[0].shape[:2]
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))
    if not writer.isOpened():
        raise RuntimeError("OpenCV could not create the MP4 output")
    for frame in frames:
        writer.write(frame)
    writer.release()


def extract_audio_envelope(path: Path, sample_rate: int = 8_000) -> np.ndarray | None:
    """Return a robust low-rate envelope, or None when a clip has no readable audio."""

    command = [
        "ffmpeg",
        "-v",
        "error",
        "-i",
        str(path),
        "-ac",
        "1",
        "-ar",
        str(sample_rate),
        "-f",
        "f32le",
        "pipe:1",
    ]
    try:
        completed = subprocess.run(command, capture_output=True, check=False, timeout=30)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None
    if completed.returncode != 0 or not completed.stdout:
        return None
    signal = np.frombuffer(completed.stdout, dtype=np.float32)
    block = max(1, sample_rate // 50)
    signal = signal[: signal.size // block * block]
    if signal.size == 0:
        return None
    envelope = np.sqrt(np.mean(signal.reshape(-1, block) ** 2, axis=1))
    return (envelope - envelope.mean()) / (envelope.std() + 1e-6)


def estimate_audio_offset(main_path: Path, ground_truth_path: Path) -> dict[str, float | str]:
    """Estimate main-minus-ground-truth offset, retaining uncertainty explicitly."""

    main = extract_audio_envelope(main_path)
    ground_truth = extract_audio_envelope(ground_truth_path)
    if main is None or ground_truth is None:
        return {"method": "timestamp_fallback", "offset_s": 0.0, "confidence": 0.2}
    max_lag = min(300, len(main) - 1, len(ground_truth) - 1)
    if max_lag <= 4:
        return {"method": "timestamp_fallback", "offset_s": 0.0, "confidence": 0.2}
    correlation = np.correlate(main, ground_truth, mode="full")
    # Zero lag is len(second) - 1, including unequal-duration recordings.
    middle = len(ground_truth) - 1
    window = correlation[middle - max_lag : middle + max_lag + 1]
    lag = int(np.argmax(window)) - max_lag
    peak = float(window.max() / (len(main) + 1e-6))
    return {
        "method": "audio_envelope",
        "offset_s": lag / 50.0,
        "confidence": float(np.clip((peak + 0.05) / 0.4, 0.0, 1.0)),
    }


def allowed_video_name(filename: str | None) -> str:
    """Validate an uploaded video name without trusting client MIME types."""

    name = Path(filename or "recording.mp4").name
    extension = Path(name).suffix.lower()
    if extension not in {".mp4", ".webm", ".mov", ".avi", ".mkv"}:
        raise ValueError("Use MP4, WebM, MOV, AVI, or MKV video files.")
    return name
