"""Measured light transport and bounded, low-resolution image reconstruction.

This is an empirical grayscale baseline, not an implementation of the Nature
2019 algorithm. A model contains only calibration measurements. Reconstruction
receives one receiving-surface photograph, never the hidden test image.
"""

from __future__ import annotations

import io
import json
import os
import threading
import uuid
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from .live import decode_live_jpeg

FEATURE_SIDE = 24
ALGORITHM = "measured-transport-bounded-ridge-v1"


def surface_features(frame: np.ndarray, region: dict[str, float]) -> np.ndarray:
    """Approximate linear sensor brightness from a JPEG receiving-surface crop."""
    height, width = frame.shape[:2]
    x0, y0 = round(region["x"] * width), round(region["y"] * height)
    x1 = round((region["x"] + region["width"]) * width)
    y1 = round((region["y"] + region["height"]) * height)
    crop = frame[y0:y1, x0:x1]
    if crop.shape[0] < FEATURE_SIDE or crop.shape[1] < FEATURE_SIDE:
        raise ValueError("Select a receiving surface at least 24 pixels wide and high")
    pixels = crop.astype(np.float64) / 255.0
    linear = np.where(pixels <= 0.04045, pixels / 12.92, ((pixels + 0.055) / 1.055) ** 2.4)
    gray = linear @ np.array([0.0722, 0.7152, 0.2126])  # OpenCV BGR
    return cv2.resize(gray, (FEATURE_SIDE, FEATURE_SIDE), interpolation=cv2.INTER_AREA).ravel()


def fit_transport(
    dark: np.ndarray, dark_check: np.ndarray, white: np.ndarray, basis: np.ndarray,
) -> tuple[dict[str, np.ndarray], dict[str, Any]]:
    """Reject uninformative/nonlinear captures before constructing an inverse."""
    dark = np.asarray(dark, dtype=np.float64)
    dark_check = np.asarray(dark_check, dtype=np.float64)
    white = np.asarray(white, dtype=np.float64)
    basis = np.asarray(basis, dtype=np.float64)
    if (dark.ndim != 1 or dark.shape != dark_check.shape or dark.shape != white.shape
            or basis.ndim != 2 or basis.shape[0] != dark.size or not 4 <= basis.shape[1] <= 16
            or not all(np.isfinite(a).all() for a in (dark, dark_check, white, basis))):
        raise ValueError("Invalid calibration measurements")
    background = (dark + dark_check) / 2
    matrix = basis - background[:, None]
    signal = np.sqrt(np.mean(matrix ** 2, axis=0))
    drift = float(np.sqrt(np.mean((dark_check - dark) ** 2)))
    if float(signal.min()) < max(0.0008, 3 * drift):
        raise ValueError("The cell signal is too weak or the background changed. Lock exposure, darken the room and recapture.")
    white_signal = white - background
    additivity = float(np.linalg.norm(matrix.sum(axis=1) - white_signal) / max(np.linalg.norm(white_signal), 1e-9))
    if additivity > 0.35:
        raise ValueError("The white reference does not match the summed cell measurements. Check exposure, clipping, brightness and capture labels.")
    # Joint least-squares fit to the n single-cell observations AND the all-white
    # observation. This reduces accumulated JPEG quantization/background bias.
    matrix = matrix + (white_signal - matrix.sum(axis=1))[:, None] / (matrix.shape[1] + 1)
    # Suppress unstable receiving-surface pixels; never amplify beyond the floor.
    weights = 1 / np.maximum(np.abs(dark_check - dark), 0.001)
    weights /= np.max(weights)
    weighted = matrix * weights[:, None]
    singular = np.linalg.svd(weighted, compute_uv=False)
    effective_rank = int(np.count_nonzero(singular > singular[0] * 0.005))
    if effective_rank != matrix.shape[1]:
        raise ValueError(f"Only {effective_rank} of {matrix.shape[1]} independent image cells are distinguishable. Try a smaller grid or reposition the occluding edge.")
    regularization = float((singular[0] * 0.01) ** 2)
    diagnostics = {
        "algorithm": ALGORITHM,
        "effective_rank": effective_rank,
        "cell_count": matrix.shape[1],
        "condition_number": round(float(singular[0] / singular[-1]), 2),
        "singular_values": singular.tolist(),
        "background_drift_rms": drift,
        "weakest_cell_signal_rms": float(signal.min()),
        "white_additivity_error": round(additivity, 4),
        "regularization": regularization,
        "interpretation": "Internal calibration checks, not independent reconstruction accuracy.",
    }
    return {"background": background, "matrix": matrix, "weights": weights,
            "regularization": np.array(regularization)}, diagnostics


def reconstruct(model: dict[str, np.ndarray], measured: np.ndarray) -> dict[str, Any]:
    matrix, background, weights = model["matrix"], model["background"], model["weights"]
    measured = np.asarray(measured, dtype=np.float64)
    if measured.shape != background.shape or not np.isfinite(measured).all():
        raise ValueError("Invalid receiving-surface measurement")
    weighted = matrix * weights[:, None]
    target = (measured - background) * weights
    regularization = float(model["regularization"])
    gram = weighted.T @ weighted + regularization * np.eye(matrix.shape[1])
    rhs = weighted.T @ target
    values = np.clip(np.linalg.solve(gram, rhs), 0, 1)
    step = 1 / float(np.linalg.eigvalsh(gram)[-1])
    for _ in range(1200):
        updated = np.clip(values - step * (gram @ values - rhs), 0, 1)
        if np.max(np.abs(updated - values)) < 1e-7:
            values = updated
            break
        values = updated
    residual = float(np.linalg.norm(weighted @ values - target) / max(np.linalg.norm(target), 1e-6))
    signal = float(np.sqrt(np.mean(target ** 2)))
    baseline_floor = max(0.0008, float(np.sqrt(np.mean((matrix * weights[:, None]) ** 2))) * 0.05)
    status = "estimated"
    reason = "Experimental reconstruction. Check an independently selected hidden target."
    if signal < baseline_floor:
        status, reason = "no_signal", "No useful change above the calibrated background. A black target and an absent signal cannot be distinguished."
    elif residual > 0.35:
        status, reason = "measurement_mismatch", "The photograph does not fit the saved light response. Check camera position, light and exposure."
    return {"status": status, "reason": reason, "values": values.tolist() if status == "estimated" else None,
            "fit_residual": round(residual, 5), "signal_rms": signal,
            "interpretation": "Fit residual is a consistency check, not a probability of correctness."}


class PeriscopeLab:
    """Small local artifact store. UUID-owned paths, immutable captures and models."""

    def __init__(self, root: Path):
        self.root = root
        root.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()

    def directory(self, experiment_id: str) -> Path:
        try:
            valid = str(uuid.UUID(experiment_id))
        except (ValueError, AttributeError) as error:
            raise KeyError("Experiment not found") from error
        if valid != experiment_id:
            raise KeyError("Experiment not found")
        directory = self.root / valid
        if not (directory / "experiment.json").is_file():
            raise KeyError("Experiment not found")
        return directory

    def get(self, experiment_id: str) -> dict[str, Any]:
        with self.lock:
            return json.loads((self.directory(experiment_id) / "experiment.json").read_text())

    def _save(self, data: dict[str, Any]) -> dict[str, Any]:
        data["updated_at"] = datetime.now(UTC).isoformat()
        directory = self.root / data["id"]
        temporary = directory / "experiment.json.tmp"
        temporary.write_text(json.dumps(data, indent=2, allow_nan=False))
        os.replace(temporary, directory / "experiment.json")
        return data

    def list(self) -> list[dict[str, Any]]:
        with self.lock:
            return sorted((self.get(p.parent.name) for p in self.root.glob("*/experiment.json")),
                          key=lambda item: item["created_at"], reverse=True)

    def create(self, name: str, grid_side: int, region: dict[str, float]) -> dict[str, Any]:
        with self.lock:
            experiment_id = str(uuid.uuid4())
            (self.root / experiment_id).mkdir()
            return self._save({"id": experiment_id, "name": name, "grid_side": grid_side,
                               "region": region, "created_at": datetime.now(UTC).isoformat(),
                               "captures": {}, "calibration": None, "results": [], "display": None})

    def update_region(self, experiment_id: str, region: dict[str, float]) -> dict[str, Any]:
        with self.lock:
            data = self.get(experiment_id)
            data["region"], data["calibration"] = region, None
            return self._save(data)

    def capture(self, experiment_id: str, label: str, raw: bytes) -> dict[str, Any]:
        with self.lock:
            data = self.get(experiment_id)
            expected = {"dark", "dark_check", "white"} | {f"cell-{i}" for i in range(data["grid_side"] ** 2)}
            if label not in expected:
                raise ValueError("Unknown calibration capture label")
            frame = decode_live_jpeg(raw)
            surface_features(frame, data["region"])
            shape = list(frame.shape[:2])
            if data.get("frame_shape") not in (None, shape):
                raise ValueError("All photographs must have the same dimensions. Keep the same camera and orientation.")
            data["frame_shape"] = shape
            filename = f"{uuid.uuid4()}.jpg"
            (self.directory(experiment_id) / filename).write_bytes(raw)
            data["captures"][label] = {"file": filename, "captured_at": datetime.now(UTC).isoformat()}
            data["calibration"] = None
            return self._save(data)

    def fit(self, experiment_id: str) -> dict[str, Any]:
        with self.lock:
            data = self.get(experiment_id)
            labels = ["dark", "dark_check", "white"] + [f"cell-{i}" for i in range(data["grid_side"] ** 2)]
            missing = [label for label in labels if label not in data["captures"]]
            if missing:
                raise ValueError(f"Capture all calibration frames first. Missing: {', '.join(missing)}")
            measurements = []
            for label in labels:
                raw = (self.directory(experiment_id) / data["captures"][label]["file"]).read_bytes()
                frame = decode_live_jpeg(raw)
                region = data["region"]
                h, w = frame.shape[:2]
                crop = frame[round(region["y"] * h):round((region["y"] + region["height"]) * h),
                             round(region["x"] * w):round((region["x"] + region["width"]) * w)]
                if np.mean(np.max(crop, axis=2) >= 253) > 0.02:
                    raise ValueError(f"Capture {label} clips highlights. Lower exposure or screen brightness and recapture.")
                measurements.append(surface_features(frame, region))
            model, diagnostics = fit_transport(*measurements[:3], np.column_stack(measurements[3:]))
            model_id = str(uuid.uuid4())
            np.savez_compressed(self.directory(experiment_id) / f"{model_id}.npz", **model)
            data["calibration"] = {"id": model_id, "diagnostics": diagnostics, "region": data["region"],
                                   "captures": data["captures"].copy(), "frame_shape": data["frame_shape"],
                                   "created_at": datetime.now(UTC).isoformat()}
            return self._save(data)

    def solve(self, experiment_id: str, raw: bytes) -> dict[str, Any]:
        with self.lock:
            data = self.get(experiment_id)
            calibration = data["calibration"]
            if calibration is None:
                raise ValueError("Fit a valid calibration before reconstructing a hidden image")
            if len(data["results"]) >= 100:
                raise ValueError("This experiment already has 100 results. Create a new experiment.")
            frame = decode_live_jpeg(raw)
            if list(frame.shape[:2]) != calibration["frame_shape"]:
                raise ValueError("Use the same camera dimensions and orientation as calibration")
            with np.load(self.directory(experiment_id) / f"{calibration['id']}.npz", allow_pickle=False) as archive:
                model = {key: archive[key] for key in archive.files}
            result = reconstruct(model, surface_features(frame, calibration["region"]))
            result_id = str(uuid.uuid4())
            (self.directory(experiment_id) / f"{result_id}.jpg").write_bytes(raw)
            result.update({"id": result_id, "created_at": datetime.now(UTC).isoformat(),
                           "grid_side": data["grid_side"], "model_id": calibration["id"],
                           "algorithm": ALGORITHM, "calibration": calibration,
                           "measurement_file": f"{result_id}.jpg"})
            if result["values"] is not None:
                pixels = np.array(result["values"]).reshape(data["grid_side"], data["grid_side"])
                # Fixed [0,1] scale: never auto-contrast noise into an apparent image.
                image = cv2.resize(np.rint(pixels * 255).astype(np.uint8), (384, 384), interpolation=cv2.INTER_NEAREST)
                cv2.imwrite(str(self.directory(experiment_id) / f"{result_id}.png"), image)
            (self.directory(experiment_id) / f"{result_id}.json").write_text(json.dumps(result, indent=2, allow_nan=False))
            data["results"].insert(0, result)
            self._save(data)
            return result

    def set_display(self, experiment_id: str, cells: list[int]) -> dict[str, Any]:
        with self.lock:
            data = self.get(experiment_id)
            if len(cells) != data["grid_side"] ** 2:
                raise ValueError("Pattern does not match this experiment's grid")
            data["display"] = {"cells": cells, "revision": str(uuid.uuid4()), "grid_side": data["grid_side"]}
            self._save(data)
            return data["display"]

    def acknowledge_display(self, experiment_id: str, revision: str) -> dict[str, Any]:
        with self.lock:
            data = self.get(experiment_id)
            if not data["display"] or data["display"]["revision"] != revision:
                raise ValueError("The display pattern has changed")
            data["display"]["acknowledged_revision"] = revision
            return self._save(data)["display"]

    def archive(self, experiment_id: str) -> None:
        with self.lock:
            directory = self.directory(experiment_id)
            archive = self.root / ".archive"
            archive.mkdir(exist_ok=True)
            directory.rename(archive / experiment_id)

    def bundle(self, experiment_id: str) -> bytes:
        with self.lock:
            data = self.get(experiment_id)
            directory = self.directory(experiment_id)
            files = {capture["file"] for capture in data["captures"].values()}
            calibrations = [data["calibration"]] if data["calibration"] else []
            for result in data["results"]:
                files.update({f"{result['id']}.json", result["measurement_file"]})
                if result["values"] is not None:
                    files.add(f"{result['id']}.png")
                calibrations.append(result["calibration"])
            for calibration in calibrations:
                files.add(f"{calibration['id']}.npz")
                files.update(capture["file"] for capture in calibration["captures"].values())
            evidence = {key: value for key, value in data.items() if key != "display"}
            output = io.BytesIO()
            with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("experiment.json", json.dumps(evidence, indent=2, allow_nan=False))
                for filename in sorted(files):
                    archive.write(directory / filename, filename)
            return output.getvalue()

    def artifact(self, experiment_id: str, filename: str) -> Path:
        directory = self.directory(experiment_id)
        if Path(filename).suffix not in {".jpg", ".png", ".json", ".npz"} or Path(filename).name != filename:
            raise KeyError("Artifact not found")
        try:
            uuid.UUID(Path(filename).stem)
        except ValueError as error:
            raise KeyError("Artifact not found") from error
        path = directory / filename
        if not path.is_file():
            raise KeyError("Artifact not found")
        return path
