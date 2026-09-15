"""Optional compact temporal PyTorch model and synthetic pretraining routine.

The rest of Umbra remains usable without Torch. Training is deliberately
opt-in because field evidence should never depend on a silently downloaded or
opaque model.
"""

from __future__ import annotations

import csv
from collections.abc import Callable
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from .synthetic import generate_synthetic_bundle
from .video import read_frames
from .vision import build_calibration_model, normalised_residual

try:  # Keep capture, import, and rule baselines available without the ML extra.
    import torch
    from torch import nn
    from torch.utils.data import DataLoader, TensorDataset

    ML_AVAILABLE = True
except ImportError:  # pragma: no cover - exercised in minimal installations
    torch = None  # type: ignore[assignment]
    nn = object  # type: ignore[assignment,misc]
    DataLoader = TensorDataset = None  # type: ignore[assignment]
    ML_AVAILABLE = False


if ML_AVAILABLE:

    class TemporalUmbraNet(nn.Module):
        """Small 3D CNN: residual/luma clips -> presence, track bin, direction."""

        def __init__(self, bins: int = 16) -> None:
            super().__init__()
            self.bins = bins
            self.encoder = nn.Sequential(
                nn.Conv3d(2, 12, kernel_size=(3, 5, 5), padding=(1, 2, 2)),
                nn.GELU(),
                nn.MaxPool3d((1, 2, 2)),
                nn.Conv3d(12, 20, kernel_size=3, padding=1),
                nn.GELU(),
                nn.MaxPool3d((2, 2, 2)),
                nn.Conv3d(20, 28, kernel_size=3, padding=1),
                nn.GELU(),
                nn.AdaptiveAvgPool3d((1, 1, 1)),
            )
            self.head = nn.Sequential(nn.Flatten(), nn.Linear(28, 32), nn.GELU(), nn.Dropout(0.12))
            self.presence = nn.Linear(32, 1)
            self.position = nn.Linear(32, bins)
            self.direction = nn.Linear(32, 3)  # toward, still/unknown, away

        def forward(self, clip: Any) -> dict[str, Any]:
            encoded = self.head(self.encoder(clip))
            return {
                "presence": self.presence(encoded).squeeze(1),
                "position": self.position(encoded),
                "direction": self.direction(encoded),
            }


def _require_torch() -> None:
    if not ML_AVAILABLE:
        raise RuntimeError("Install the ML extra first: uv sync --extra ml")


def clip_tensor(calibration_path: Path, main_path: Path, frames_per_clip: int = 16) -> np.ndarray:
    """Create a fixed 2×T×48×64 residual/luminance clip from a pair of videos."""

    calibration_frames, _, _ = read_frames(calibration_path, target_fps=10, max_frames=90, resize_width=360)
    main_frames, _, _ = read_frames(main_path, target_fps=10, max_frames=240, resize_width=360)
    calibration = build_calibration_model(calibration_frames)
    height, width = calibration.background.shape
    selected = np.linspace(0, len(main_frames) - 1, frames_per_clip).astype(int)
    residuals: list[np.ndarray] = []
    luminance: list[np.ndarray] = []
    for index in selected:
        frame = main_frames[int(index)]
        if frame.shape[:2] != (height, width):
            frame = cv2.resize(frame, (width, height), interpolation=cv2.INTER_AREA)
        residual = normalised_residual(frame, calibration)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).astype(np.float32)
        residuals.append(cv2.resize(residual, (64, 48)) / 32.0)
        luminance.append(cv2.resize(gray, (64, 48)) / 255.0)
    return np.stack([np.stack(residuals), np.stack(luminance)]).astype(np.float32)


def _labels(labels_path: Path) -> tuple[float, int, int]:
    with labels_path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    present = any(row["present"].lower() == "true" for row in rows)
    positions = [float(row["position_norm"]) for row in rows if row["present"].lower() == "true"]
    position = float(np.mean(positions)) if positions else 0.5
    if len(positions) < 2:
        direction = 1
    elif positions[-1] > positions[0]:
        direction = 2
    else:
        direction = 0
    return float(present), min(15, int(position * 16)), direction


def train_synthetic_model(
    *,
    destination: Path,
    examples: int,
    epochs: int,
    progress: Callable[[float, str], None],
) -> dict[str, Any]:
    """Train a reproducible starter checkpoint from varied synthetic corners."""

    _require_torch()
    assert torch is not None and DataLoader is not None and TensorDataset is not None
    torch.manual_seed(73)
    dataset_root = destination / "training"
    clips: list[np.ndarray] = []
    presence: list[float] = []
    positions: list[int] = []
    directions: list[int] = []
    for index in range(examples):
        lighting = ("directional", "flat", "reflective")[index % 3]
        bundle = generate_synthetic_bundle(
            dataset_root / f"clip-{index:03d}",
            seed=100 + index,
            frames=72,
            target_present=index % 5 != 0,
            lighting=lighting,
        )
        clips.append(clip_tensor(bundle.calibration_path, bundle.main_path))
        item_presence, item_position, item_direction = _labels(bundle.labels_path)
        presence.append(item_presence)
        positions.append(item_position)
        directions.append(item_direction)
        progress(0.05 + 0.45 * (index + 1) / examples, f"Preparing synthetic clip {index + 1}/{examples}")
    tensor_dataset = TensorDataset(
        torch.from_numpy(np.stack(clips)),
        torch.tensor(presence, dtype=torch.float32),
        torch.tensor(positions, dtype=torch.long),
        torch.tensor(directions, dtype=torch.long),
    )
    loader = DataLoader(tensor_dataset, batch_size=min(8, examples), shuffle=True)
    model = TemporalUmbraNet()
    optimizer = torch.optim.AdamW(model.parameters(), lr=2e-3, weight_decay=1e-4)
    for epoch in range(epochs):
        model.train()
        loss_total = 0.0
        for clip, target_presence, target_position, target_direction in loader:
            result = model(clip)
            loss = (
                nn.functional.binary_cross_entropy_with_logits(result["presence"], target_presence)
                + nn.functional.cross_entropy(result["position"], target_position)
                + 0.45 * nn.functional.cross_entropy(result["direction"], target_direction)
            )
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            loss_total += float(loss.detach())
        progress(0.50 + 0.42 * (epoch + 1) / epochs, f"Training temporal model, epoch {epoch + 1}/{epochs}")
    destination.mkdir(parents=True, exist_ok=True)
    checkpoint = destination / "synthetic_temporal_v1.pt"
    torch.save(
        {"state_dict": model.state_dict(), "bins": 16, "examples": examples, "epochs": epochs, "seed": 73},
        checkpoint,
    )
    return {
        "checkpoint": str(checkpoint),
        "examples": examples,
        "epochs": epochs,
        "final_loss": round(loss_total / max(1, len(loader)), 5),
        "warning": "Synthetic pretraining is not validation of real outdoor performance.",
    }


def predict_checkpoint(checkpoint: Path, calibration_path: Path, main_path: Path) -> dict[str, Any] | None:
    """Return a clip-level prediction when an optional trained checkpoint exists."""

    if not ML_AVAILABLE or not checkpoint.exists():
        return None
    assert torch is not None
    payload = torch.load(checkpoint, map_location="cpu", weights_only=True)
    model = TemporalUmbraNet(bins=int(payload.get("bins", 16)))
    model.load_state_dict(payload["state_dict"])
    model.eval()
    with torch.no_grad():
        result = model(torch.from_numpy(clip_tensor(calibration_path, main_path)).unsqueeze(0))
    position = torch.softmax(result["position"], dim=1)[0].numpy()
    direction_index = int(torch.argmax(result["direction"], dim=1)[0])
    return {
        "presence_probability": float(torch.sigmoid(result["presence"])[0]),
        "position_bins": [float(value) for value in position],
        "direction": ("toward_corner", "unknown", "away_from_corner")[direction_index],
        "checkpoint": str(checkpoint),
    }
