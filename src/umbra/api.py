"""FastAPI entry point for Umbra's local dashboard and experiment API."""

import io
import uuid
import zipfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Any

import uvicorn
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from . import __version__
from .config import Settings, get_settings
from .jobs import JobManager
from .ml import ML_AVAILABLE
from .schemas import (
    AnalysisRequest,
    Health,
    Job,
    MediaAsset,
    MediaRole,
    Scene,
    SceneCreate,
    SyntheticRequest,
    TrainRequest,
    Trial,
    TrialCreate,
)
from .service import UmbraService
from .store import Store
from .video import allowed_video_name, inspect_video


def _root_directory() -> Path:
    return Path(__file__).resolve().parents[2]


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    store = Store(settings.database_path)
    service = UmbraService(settings, store)
    jobs = JobManager(store)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        yield
        jobs.executor.shutdown(wait=False, cancel_futures=False)

    app = FastAPI(
        title="Umbra local experiment kit",
        version=__version__,
        description="Confidence-aware, consent-based hidden-motion corner research.",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.store = store
    app.state.service = service
    app.state.jobs = jobs
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def get_store() -> Store:
        return store

    def get_service() -> UmbraService:
        return service

    def get_jobs() -> JobManager:
        return jobs

    @app.get("/api/v1/health", response_model=Health, tags=["system"])
    def health() -> Health:
        return Health(name="umbra", version=__version__, data_dir=str(settings.data_dir), ml_available=ML_AVAILABLE)

    @app.get("/api/v1/scenes", response_model=list[Scene], tags=["scenes"])
    def list_scenes(database: Annotated[Store, Depends(get_store)]) -> list[dict[str, Any]]:
        return database.list_scenes()

    @app.post("/api/v1/scenes", response_model=Scene, status_code=status.HTTP_201_CREATED, tags=["scenes"])
    def create_scene(payload: SceneCreate, database: Annotated[Store, Depends(get_store)]) -> dict[str, Any]:
        return database.create_scene(payload.model_dump(mode="json"))

    @app.delete("/api/v1/scenes/{scene_id}", tags=["scenes"])
    def delete_scene(
        scene_id: str,
        current_service: Annotated[UmbraService, Depends(get_service)],
    ) -> dict[str, str]:
        if not current_service.delete_scene(scene_id):
            raise HTTPException(status_code=404, detail="Scene not found")
        return {"scene_id": scene_id}

    @app.get("/api/v1/scenes/{scene_id}", tags=["scenes"])
    def get_scene(scene_id: str, database: Annotated[Store, Depends(get_store)]) -> dict[str, Any]:
        scene = database.get_scene(scene_id)
        if scene is None:
            raise HTTPException(status_code=404, detail="Scene not found")
        return {"scene": scene, "media": database.list_media(scene_id), "trials": database.list_trials(scene_id), "analyses": database.list_analyses(scene_id)}

    @app.post(
        "/api/v1/scenes/{scene_id}/media/{role}",
        response_model=MediaAsset,
        status_code=status.HTTP_201_CREATED,
        tags=["media"],
    )
    async def upload_media(
        scene_id: str,
        role: MediaRole,
        file: Annotated[UploadFile, File(description="Calibration, main, or ground-truth video")],
        database: Annotated[Store, Depends(get_store)],
    ) -> dict[str, Any]:
        if database.get_scene(scene_id) is None:
            raise HTTPException(status_code=404, detail="Scene not found")
        try:
            original_name = allowed_video_name(file.filename)
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        destination = settings.media_dir / f"{uuid.uuid4()}{Path(original_name).suffix.lower()}"
        received = 0
        try:
            with destination.open("wb") as handle:
                while chunk := await file.read(1024 * 1024):
                    received += len(chunk)
                    if received > settings.max_upload_bytes:
                        raise ValueError(f"Video exceeds the {settings.max_upload_bytes // 1024 // 1024} MB local limit")
                    handle.write(chunk)
            metadata = inspect_video(destination)
        except (OSError, ValueError) as error:
            destination.unlink(missing_ok=True)
            raise HTTPException(status_code=422, detail=str(error)) from error
        finally:
            await file.close()
        return database.create_media(
            {
                "scene_id": scene_id,
                "role": role,
                "original_name": original_name,
                "content_type": file.content_type,
                "path": str(destination),
                "metadata": metadata,
            }
        )

    @app.post(
        "/api/v1/scenes/{scene_id}/trials",
        response_model=Trial,
        status_code=status.HTTP_201_CREATED,
        tags=["trials"],
    )
    def create_trial(
        scene_id: str,
        payload: TrialCreate,
        database: Annotated[Store, Depends(get_store)],
    ) -> dict[str, Any]:
        if database.get_scene(scene_id) is None:
            raise HTTPException(status_code=404, detail="Scene not found")
        expected = {
            payload.calibration_media_id: "calibration",
            payload.main_media_id: "main",
        }
        if payload.ground_truth_media_id:
            expected[payload.ground_truth_media_id] = "ground_truth"
        for media_id, role in expected.items():
            media = database.get_media(media_id)
            if media is None or media["scene_id"] != scene_id or media["role"] != role:
                raise HTTPException(status_code=422, detail=f"Invalid {role} media for this scene")
        return database.create_trial(scene_id, payload.model_dump())

    @app.post("/api/v1/trials/{trial_id}/analysis", response_model=Job, tags=["analysis"])
    def start_analysis(
        trial_id: str,
        _payload: AnalysisRequest,
        database: Annotated[Store, Depends(get_store)],
        worker: Annotated[JobManager, Depends(get_jobs)],
        current_service: Annotated[UmbraService, Depends(get_service)],
    ) -> dict[str, Any]:
        if database.get_trial(trial_id) is None:
            raise HTTPException(status_code=404, detail="Trial not found")
        return worker.submit("analysis", lambda update: current_service.analyse_trial(trial_id, update))

    @app.post("/api/v1/demo", response_model=Job, tags=["synthetic"])
    def create_demo(
        payload: SyntheticRequest,
        worker: Annotated[JobManager, Depends(get_jobs)],
        current_service: Annotated[UmbraService, Depends(get_service)],
    ) -> dict[str, Any]:
        return worker.submit("synthetic_demo", lambda update: current_service.create_synthetic_demo(payload.model_dump(), update))

    @app.post("/api/v1/models/train", response_model=Job, tags=["models"])
    def train_model(
        payload: TrainRequest,
        worker: Annotated[JobManager, Depends(get_jobs)],
        current_service: Annotated[UmbraService, Depends(get_service)],
    ) -> dict[str, Any]:
        if not ML_AVAILABLE:
            raise HTTPException(status_code=409, detail="Install the ML extra with `uv sync --extra ml` first")
        return worker.submit("synthetic_training", lambda update: current_service.train_model(payload.model_dump(), update))

    @app.get("/api/v1/jobs/{job_id}", response_model=Job, tags=["jobs"])
    def get_job(job_id: str, database: Annotated[Store, Depends(get_store)]) -> dict[str, Any]:
        job = database.get_job(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        return job

    @app.get("/api/v1/analyses/{analysis_id}", tags=["analysis"])
    def get_analysis(
        analysis_id: str, current_service: Annotated[UmbraService, Depends(get_service)]
    ) -> dict[str, Any]:
        result = current_service.get_analysis_result(analysis_id)
        if result is None:
            raise HTTPException(status_code=404, detail="Analysis not found")
        record, payload = result
        return {"analysis": record, "result": payload}

    @app.get("/api/v1/analyses/{analysis_id}/report", tags=["analysis"])
    def get_report(analysis_id: str, database: Annotated[Store, Depends(get_store)]) -> FileResponse:
        if database.get_analysis(analysis_id) is None:
            raise HTTPException(status_code=404, detail="Analysis not found")
        report_path = settings.report_dir / f"{analysis_id}.html"
        if not report_path.exists():
            raise HTTPException(status_code=404, detail="Report was not generated")
        return FileResponse(report_path, media_type="text/html")

    @app.get("/api/v1/analyses/{analysis_id}/bundle", tags=["analysis"])
    def get_bundle(analysis_id: str, database: Annotated[Store, Depends(get_store)]) -> Response:
        record = database.get_analysis(analysis_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Analysis not found")
        run = Path(record["path"]).parent
        paths = [run / "result.json", run / "predictions.csv", settings.report_dir / f"{analysis_id}.html"]
        if not all(path.exists() for path in paths):
            raise HTTPException(status_code=404, detail="Evidence bundle is incomplete")
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            for path, name in zip(paths, ("result.json", "predictions.csv", "report.html"), strict=True):
                archive.write(path, name)
        return Response(buffer.getvalue(), media_type="application/zip", headers={
            "Content-Disposition": f'attachment; filename="umbra-{analysis_id}.zip"'
        })

    @app.get("/api/v1/analyses/{analysis_id}/predictions", tags=["analysis"])
    def get_predictions(analysis_id: str, database: Annotated[Store, Depends(get_store)]) -> FileResponse:
        record = database.get_analysis(analysis_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Analysis not found")
        predictions_path = Path(record["path"]).with_name("predictions.csv")
        if not predictions_path.exists():
            raise HTTPException(status_code=404, detail="Predictions were not generated")
        return FileResponse(predictions_path, media_type="text/csv", filename=f"umbra-{analysis_id}-predictions.csv")

    # Reports reference only diagnostic artifacts, not original consented recordings.
    app.mount("/artifacts/runs", StaticFiles(directory=settings.run_dir), name="run-artifacts")
    app.mount("/artifacts/reports", StaticFiles(directory=settings.report_dir), name="report-artifacts")

    frontend = _root_directory() / "frontend" / "dist"
    if frontend.exists():
        app.mount("/", StaticFiles(directory=frontend, html=True), name="dashboard")
    return app


app = create_app()


def main() -> None:
    uvicorn.run("umbra.api:app", host="127.0.0.1", port=8000, reload=False)


if __name__ == "__main__":
    main()
