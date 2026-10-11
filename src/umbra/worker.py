"""Private, bounded worker for the Go public service; no customer database access."""

from __future__ import annotations

import hashlib
import hmac
import multiprocessing as mp
import os
import re
import threading
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from . import __version__
from .schemas import ManualRegion
from .video import inspect_video

ROOT = Path(os.environ.get("UMBRA_DATA_DIR", "../umbra-data/public")).resolve()
TOKEN = os.environ.get("UMBRA_WORKER_TOKEN", "")
LOCK = threading.Semaphore(1)
INSPECT_LOCK = threading.Semaphore(2)
PROGRESS: dict[str, dict[str, Any]] = {}
PROGRESS_LOCK = threading.Lock()


def authenticate(authorization: Annotated[str, Header()] = "") -> None:
    if len(TOKEN) < 32 or not hmac.compare_digest(authorization, f"Bearer {TOKEN}"):
        raise HTTPException(401, "Invalid service credentials")


app = FastAPI(title="Umbra private worker", docs_url=None, redoc_url=None,
              openapi_url=None, dependencies=[Depends(authenticate)])


class InspectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    path: str
    role: Literal["calibration", "main", "ground_truth"]


class WorkRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^[a-f0-9]{32}$")
    attempt: str = Field(pattern=r"^[a-f0-9]{32}$")
    paths: dict[str, str]
    scene: dict[str, Any]
    shadow_region: ManualRegion | None = None


def media_path(relative: str) -> Path:
    if not re.fullmatch(r"media/[a-f0-9]{32}", relative):
        raise ValueError("Invalid media reference")
    path = (ROOT / relative).resolve()
    if not path.is_relative_to(ROOT) or not path.is_file():
        raise ValueError("Media unavailable")
    return path


def inspect_bounded(relative: str, role: str) -> dict[str, Any]:
    metadata = inspect_video(media_path(relative))
    limit = 18 if role == "calibration" else 60
    if not 0 < metadata["duration_s"] <= limit or metadata["frame_count"] <= 0:
        raise ValueError("Invalid duration")
    if metadata["width"] > 3840 or metadata["height"] > 2160:
        raise ValueError("Resolution exceeds limit")
    return metadata


def perform(payload: dict[str, Any], pipe: Any) -> None:
    """Separate process allows hard timeout of native video decoders and rendering."""
    try:
        from .pipeline import analyse_trial
        from .reports import write_artifacts

        request = WorkRequest.model_validate(payload)
        paths = {role: media_path(path) for role, path in request.paths.items()}
        metadata = {role: inspect_bounded(relative, role) for role, relative in request.paths.items()}
        review = {"main_shadow_region": request.shadow_region.model_dump()} if request.shadow_region else None
        result = analyse_trial(calibration_path=paths["calibration"], main_path=paths["main"],
                               ground_truth_path=paths.get("ground_truth"), scene=request.scene,
                               track_length_m=None, manual_ground_truth=review,
                               progress=lambda progress, message: pipe.send({"progress": progress, "message": message}))
        result["analysis_id"] = request.id
        result["provenance"] = {
            "software_version": __version__, "created_at": datetime.now(UTC).isoformat(),
            "analysis_id": request.id, "scene": request.scene,
            "shadow_region": request.shadow_region.model_dump() if request.shadow_region else None,
            "analysis": {"target_fps": 10, "max_calibration_samples": 180, "max_trial_samples": 600},
            "sources": [{"role": role, "sha256": file_digest(path), "metadata": metadata[role]}
                        for role, path in paths.items()],
        }
        result["evidence"] = {"kind": "imported_video", "field_validated": False,
                              "limitation": "Experimental shadow analysis. Confidence is not a calibrated probability; field performance has not been established."}
        destination = ROOT / "runs" / request.id
        pipe.send({"progress": 0.90, "message": "Preparing evidence files"})
        artifacts = write_artifacts(run_directory=destination, report_directory=destination / request.attempt,
                                    analysis_id=request.attempt, result=result,
                                    calibration_path=paths["calibration"], main_path=paths["main"],
                                    ground_truth_path=paths.get("ground_truth"), manual_ground_truth=review)
        # Public reports retain scientific limitations but do not claim local-only storage.
        report = Path(artifacts["report"])
        report.write_text(report.read_text().replace("LOCAL-ONLY • CONSENT-BASED RESEARCH ARTIFACT", "UMBRA • EXPERIMENTAL SHADOW ANALYSIS"))
        pipe.send({"result": result, "artifacts": {key: str(Path(value).relative_to(ROOT)) if value else ""
                                                    for key, value in artifacts.items()}})
    except Exception:
        pipe.send({"error": "Analysis failed"})
    finally:
        pipe.close()


def file_digest(path: Path) -> str:
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def inspect_process(payload: dict[str, Any], pipe: Any) -> None:
    try:
        pipe.send({"metadata": inspect_bounded(payload["path"], payload["role"])})
    except Exception:
        pipe.send({"error": "Invalid video"})
    finally:
        pipe.close()


def run_process(target: Any, payload: dict[str, Any], timeout: float, attempt: str | None = None) -> dict[str, Any]:
    context = mp.get_context("spawn")
    receive, send = context.Pipe(duplex=False)
    process = context.Process(target=target, args=(payload, send), daemon=True)
    process.start()
    send.close()
    deadline = time.monotonic() + timeout
    try:
        while time.monotonic() < deadline:
            if receive.poll(0.25):
                message = receive.recv()
                if "error" in message:
                    raise HTTPException(422, message["error"])
                if "result" in message or "metadata" in message:
                    return message
                if attempt:
                    with PROGRESS_LOCK:
                        PROGRESS[attempt] = message
            if not process.is_alive():
                raise HTTPException(422, "Worker stopped before completing")
        raise HTTPException(504, "Processing time limit exceeded")
    except EOFError as error:
        raise HTTPException(422, "Worker stopped before completing") from error
    finally:
        if process.is_alive():
            process.terminate()
        process.join(3)
        if process.is_alive():
            process.kill()
            process.join()
        receive.close()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/inspect")
def inspect(request: InspectRequest) -> dict[str, Any]:
    if not INSPECT_LOCK.acquire(timeout=2):
        raise HTTPException(503, "Worker busy. Retry shortly")
    try:
        return run_process(inspect_process, request.model_dump(), 35)["metadata"]
    finally:
        INSPECT_LOCK.release()


@app.get("/progress/{attempt}")
def progress(attempt: str) -> dict[str, Any]:
    with PROGRESS_LOCK:
        return PROGRESS.get(attempt, {"progress": 0.02, "message": "Preparing analysis"})


@app.post("/analyse")
def analyse(request: WorkRequest) -> dict[str, Any]:
    if set(request.paths) not in ({"calibration", "main"}, {"calibration", "main", "ground_truth"}):
        raise HTTPException(422, "Invalid input roles")
    if not LOCK.acquire(timeout=10):
        raise HTTPException(503, "Worker busy")
    try:
        return run_process(perform, request.model_dump(mode="json"), 580, request.attempt)
    finally:
        with PROGRESS_LOCK:
            PROGRESS.pop(request.attempt, None)
        LOCK.release()
