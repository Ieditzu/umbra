"""Application service that joins persistence, jobs, synthetic data, and analysis."""

from __future__ import annotations

import json
import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from shutil import rmtree
from typing import Any

import cv2
import numpy as np

from . import __version__
from .config import Settings
from .ml import ML_AVAILABLE, predict_checkpoint, train_synthetic_model
from .pipeline import analyse_trial
from .position import calibrate_position
from .reports import write_artifacts
from .store import Store
from .synthetic import SyntheticBundle, generate_synthetic_bundle
from .video import inspect_video, read_frames
from .vision import build_calibration_model, detect_corner_and_roi

Progress = Callable[[float, str], None]


class UmbraService:
    def __init__(self, settings: Settings, store: Store) -> None:
        self.settings = settings
        self.store = store

    def calibrate_camera_position(self, scene_id: str, trial_id: str) -> dict[str, Any]:
        trial = self.store.get_trial(trial_id)
        if trial is None or trial["scene_id"] != scene_id:
            raise ValueError("Choose a calibration walk belonging to this scene")
        empty = self._media(trial["calibration_media_id"], "calibration")
        main = self._media(trial["main_media_id"], "main")
        empty_frames, _, _ = read_frames(Path(empty["path"]), max_frames=180)
        calibration = build_calibration_model(empty_frames)
        assessment = detect_corner_and_roi(calibration.background, calibration.stability)
        if assessment.edge is None or assessment.roi is None:
            raise ValueError("A visible wall edge and pavement are required for camera setup")
        frames, times, _ = read_frames(Path(main["path"]))
        h, w = calibration.background.shape
        frames = [cv2.resize(frame, (w, h)) for frame in frames]
        model, reference, noise = calibrate_position(frames, times, calibration, assessment.edge, assessment.roi)
        model["source_trial_id"] = trial_id
        model["source_media_id"] = main["id"]
        model["calibration_uses_complete_recording"] = True
        model["deployment_uses_future_frames"] = False
        previous = self.store.get_position_calibration(scene_id)
        calibration_id = str(uuid.uuid4())
        directory = self.settings.model_dir / "cameras"
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"{calibration_id}.npz"
        np.savez_compressed(path, reference=reference, noise=noise)
        try:
            record = self.store.save_position_calibration(scene_id, calibration_id, empty["id"], main["id"], model, str(path))
        except Exception:
            path.unlink(missing_ok=True)
            raise
        if previous:
            self._remove_position_reference(previous)
        return record

    def _remove_position_reference(self, record: dict[str, Any]) -> None:
        path = Path(record["reference_path"])
        if self._within(path, self.settings.model_dir / "cameras"):
            path.unlink(missing_ok=True)

    def load_camera_position(self, scene_id: str) -> tuple[dict[str, Any], np.ndarray, np.ndarray]:
        record = self.store.get_position_calibration(scene_id)
        if record is None:
            raise ValueError("Save a camera position calibration before starting live detection")
        latest_empty = [m for m in self.store.list_media(scene_id) if m["role"] == "calibration"]
        if not latest_empty or latest_empty[-1]["id"] != record["calibration_media_id"]:
            raise ValueError("The empty camera view was replaced. Calibrate this camera again.")
        path = Path(record["reference_path"])
        if not self._within(path, self.settings.model_dir / "cameras") or not path.is_file():
            raise ValueError("The saved camera reference is missing. Calibrate this camera again.")
        with np.load(path, allow_pickle=False) as data:
            return record, data["reference"].copy(), data["noise"].copy()

    def _media(self, media_id: str, expected_role: str | None = None) -> dict[str, Any]:
        media = self.store.get_media(media_id)
        if media is None:
            raise ValueError("Referenced media was not found")
        if expected_role and media["role"] != expected_role:
            raise ValueError(f"Expected {expected_role} footage, received {media['role']}")
        return media

    def _create_synthetic_records(self, bundle: SyntheticBundle, request: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
        scene = self.store.create_scene(
            {
                "name": f"Synthetic corner {bundle.seed}",
                "latitude": 44.4268,
                "longitude": 26.1025,
                "recorded_at": "2026-06-21T12:00:00+00:00",
                "notes": "Generated pipeline fixture; not real-world evidence.",
            }
        )
        media_ids: dict[str, str] = {}
        for role, path in (
            ("calibration", bundle.calibration_path),
            ("main", bundle.main_path),
            ("ground_truth", bundle.ground_truth_path),
        ):
            record = self.store.create_media(
                {
                    "scene_id": scene["id"],
                    "role": role,
                    "original_name": path.name,
                    "content_type": "video/mp4",
                    "path": str(path),
                    "metadata": {**inspect_video(path), "synthetic": True, "seed": bundle.seed},
                }
            )
            media_ids[role] = record["id"]
        trial = self.store.create_trial(
            scene["id"],
            {
                "name": f"Synthetic {request['lighting']} trial",
                "calibration_media_id": media_ids["calibration"],
                "main_media_id": media_ids["main"],
                "ground_truth_media_id": media_ids["ground_truth"],
                "track_length_m": 4.0,
            },
        )
        return scene, trial

    def create_synthetic_demo(self, request: dict[str, Any], progress: Progress) -> dict[str, Any]:
        progress(0.08, "Rendering deterministic synthetic calibration and trial video")
        destination = self.settings.synthetic_dir / f"demo-{uuid.uuid4()}"
        bundle = generate_synthetic_bundle(destination, **request)
        progress(0.42, "Registering the local synthetic experiment")
        scene, trial = self._create_synthetic_records(bundle, request)
        progress(0.50, "Running the complete confidence-aware demo")
        analysis = self.analyse_trial(trial["id"], progress)
        return {
            "scene_id": scene["id"],
            "trial_id": trial["id"],
            "analysis_id": analysis["analysis_id"],
            "state": analysis["state"],
            "confidence": analysis["confidence"],
        }

    def analyse_trial(self, trial_id: str, progress: Progress) -> dict[str, Any]:
        trial = self.store.get_trial(trial_id)
        if trial is None:
            raise ValueError("Trial was not found")
        scene = self.store.get_scene(trial["scene_id"])
        if scene is None:
            raise ValueError("Trial scene was not found")
        calibration = self._media(trial["calibration_media_id"], "calibration")
        main = self._media(trial["main_media_id"], "main")
        ground_truth = (
            self._media(trial["ground_truth_media_id"], "ground_truth")
            if trial.get("ground_truth_media_id")
            else None
        )
        manual_ground_truth = self.store.get_manual_ground_truth(trial_id)
        shadow_region = self.store.get_shadow_region(trial_id)
        if shadow_region and not (manual_ground_truth or {}).get("main_shadow_region"):
            manual_ground_truth = {**(manual_ground_truth or {}), "main_shadow_region": shadow_region}
        saved_position = None
        try:
            mapping_record, reference, noise = self.load_camera_position(scene["id"])
            if mapping_record["calibration_media_id"] == calibration["id"]:
                mapping = {**mapping_record["model"], "calibration_id": mapping_record["id"], "calibration_media_id": mapping_record["calibration_media_id"]}
                saved_position = mapping, reference, noise
        except ValueError:
            pass
        result = analyse_trial(
            calibration_path=Path(calibration["path"]),
            main_path=Path(main["path"]),
            ground_truth_path=Path(ground_truth["path"]) if ground_truth else None,
            scene=scene,
            track_length_m=trial.get("track_length_m"),
            manual_ground_truth=manual_ground_truth,
            progress=progress,
            position_calibration=saved_position,
        )
        if saved_position is not None:
            result["hidden_source_estimate"]["evaluated_on_calibration_source"] = saved_position[0].get("source_media_id") == main["id"]
        checkpoint = self.settings.model_dir / "synthetic_temporal_v1.pt"
        model_hint = predict_checkpoint(checkpoint, Path(calibration["path"]), Path(main["path"]))
        if model_hint:
            result["advisory_model"] = {
                "name": "temporal_umbra_net",
                "version": "synthetic-v1",
                "trained": True,
                "role": "advisory until validated on held-out field data",
                **model_hint,
            }
        result["evidence"] = {
            "kind": "synthetic" if main["metadata"].get("synthetic") else "imported_video",
            "field_validated": False,
            "limitation": "Synthetic data checks the software only. Imported footage requires controlled field validation.",
        }
        result["provenance"] = {
            "software_version": __version__,
            "created_at": datetime.now(UTC).isoformat(),
            "scene_id": scene["id"], "trial_id": trial_id,
            "track_length_m": trial.get("track_length_m"),
            "sources": [
                {"id": media["id"], "role": media["role"], "name": media["original_name"], "metadata": media["metadata"]}
                for media in (calibration, main, ground_truth) if media is not None
            ],
            "analysis": {"target_fps": 10, "max_trial_samples": 600, "presence_threshold": 0.5, "label_tolerance_s": 0.075},
        }
        analysis_id = str(uuid.uuid4())
        result["analysis_id"] = analysis_id
        progress(0.93, "Rendering annotated videos")
        artifact_paths = write_artifacts(
            run_directory=self.settings.run_dir,
            report_directory=self.settings.report_dir,
            analysis_id=analysis_id,
            result=result,
            calibration_path=Path(calibration["path"]),
            main_path=Path(main["path"]),
            ground_truth_path=Path(ground_truth["path"]) if ground_truth else None,
            manual_ground_truth=manual_ground_truth,
        )
        self.store.create_analysis(trial_id, artifact_paths["result"], analysis_id=analysis_id)
        return {"analysis_id": analysis_id, "artifacts": artifact_paths, **result}

    def get_analysis_result(self, analysis_id: str) -> tuple[dict[str, Any], dict[str, Any]] | None:
        record = self.store.get_analysis(analysis_id)
        if record is None:
            return None
        path = Path(record["path"])
        if not path.exists():
            return None
        return record, json.loads(path.read_text(encoding="utf-8"))

    @staticmethod
    def _within(path: Path, directory: Path) -> bool:
        try:
            path.resolve().relative_to(directory.resolve())
        except ValueError:
            return False
        return True

    def delete_scene(self, scene_id: str) -> bool:
        """Remove a scene's database rows and only files owned by Umbra's data directory."""

        deleted = self.store.delete_scene(scene_id)
        if deleted is None:
            return False

        if deleted.get("position_reference_path"):
            self._remove_position_reference({"reference_path": deleted["position_reference_path"]})

        media_root = self.settings.media_dir.resolve()
        synthetic_root = self.settings.synthetic_dir.resolve()
        synthetic_bundles: set[Path] = set()
        for value in deleted["media_paths"]:
            path = Path(value).resolve()
            if self._within(path, media_root):
                path.unlink(missing_ok=True)
            elif self._within(path, synthetic_root):
                bundle = path.parent
                if bundle.parent == synthetic_root:
                    synthetic_bundles.add(bundle)
                else:
                    path.unlink(missing_ok=True)
        for bundle in synthetic_bundles:
            rmtree(bundle, ignore_errors=True)

        self._remove_analysis_artifacts(deleted["analyses"])
        return True

    def _remove_analysis_artifacts(self, analyses: list[dict[str, Any]]) -> None:
        """Only remove artifact paths contained in Umbra's owned data roots."""

        runs_root = self.settings.run_dir.resolve()
        reports_root = self.settings.report_dir.resolve()
        for analysis in analyses:
            result_path = Path(analysis["path"]).resolve()
            run = result_path.parent
            if run.parent == runs_root:
                rmtree(run, ignore_errors=True)
            report = (reports_root / f"{analysis['id']}.html").resolve()
            if self._within(report, reports_root):
                report.unlink(missing_ok=True)

    def delete_trial(self, trial_id: str) -> bool:
        deleted = self.store.delete_trial(trial_id)
        if deleted is None:
            return False
        self._remove_analysis_artifacts(deleted["analyses"])
        return True

    def delete_analysis(self, analysis_id: str) -> bool:
        deleted = self.store.delete_analysis(analysis_id)
        if deleted is None:
            return False
        self._remove_analysis_artifacts([deleted])
        return True

    def train_model(self, request: dict[str, Any], progress: Progress) -> dict[str, Any]:
        if not ML_AVAILABLE:
            raise RuntimeError("ML support is not installed. Run `uv sync --extra ml` and try again.")
        return train_synthetic_model(destination=self.settings.model_dir, progress=progress, **request)
