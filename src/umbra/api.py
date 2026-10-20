"""FastAPI entry point for Umbra's local dashboard and experiment API."""

import io
import uuid
import zipfile
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Annotated, Any

import uvicorn
from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from . import __version__
from .config import Settings, get_settings
from .jobs import JobManager
from .live import LiveSessions
from .ml import ML_AVAILABLE
from .parking_api import ParkingSessions, parking_router
from .schemas import (
    AnalysisRequest,
    Health,
    Job,
    LiveSessionRequest,
    ManualGroundTruth,
    ManualRegion,
    MediaAsset,
    MediaRole,
    PositionCalibrationRequest,
    Scene,
    SceneCreate,
    SyntheticRequest,
    TrainRequest,
    Trial,
    TrialCreate,
)
from .service import UmbraService
from .store import Store
from .sun import sun_metadata
from .video import allowed_video_name, inspect_video


def _root_directory() -> Path:
    return Path(__file__).resolve().parents[2]


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    store = Store(settings.database_path)
    service = UmbraService(settings, store)
    jobs = JobManager(store)
    live = LiveSessions(service)
    parking = ParkingSessions(settings.model_dir / "parking")

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        yield
        live.close_all()
        parking.close_all()
        jobs.executor.shutdown(wait=False, cancel_futures=False)

    app = FastAPI(
        title="Umbra local experiment kit",
        version=__version__,
        description="Local kit: pavement-shadow early warning at a blind corner, with measured lead time.",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.store = store
    app.state.service = service
    app.state.jobs = jobs
    app.include_router(parking_router(parking))
    app.state.parking = parking
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:5174", "http://localhost:5174"],
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
        position = database.get_position_calibration(scene_id)
        if position:
            position = {key: value for key, value in position.items() if key != "reference_path"}
        return {"scene": scene, "media": database.list_media(scene_id), "trials": database.list_trials(scene_id), "analyses": database.list_analyses(scene_id), "position_calibration": position}

    @app.post("/api/v1/scenes/{scene_id}/position-calibration", tags=["camera"])
    def save_position_calibration(scene_id: str, payload: PositionCalibrationRequest) -> dict[str, Any]:
        try:
            record = service.calibrate_camera_position(scene_id, payload.trial_id)
            return {key: value for key, value in record.items() if key != "reference_path"}
        except (ValueError, OSError) as error:
            raise HTTPException(422, str(error)) from error

    @app.delete("/api/v1/scenes/{scene_id}/position-calibration", tags=["camera"])
    def remove_position_calibration(scene_id: str) -> dict[str, str]:
        record = store.delete_position_calibration(scene_id)
        if record:
            service._remove_position_reference(record)
        return {"scene_id": scene_id}

    @app.post("/api/v1/scenes/{scene_id}/live-sessions", tags=["camera"])
    def start_live_session(scene_id: str, payload: LiveSessionRequest) -> dict[str, Any]:
        if store.get_scene(scene_id) is None:
            raise HTTPException(404, "Scene not found")
        try:
            return live.start(scene_id, payload.camera_url)
        except (ValueError, OSError) as error:
            raise HTTPException(422, str(error)) from error

    @app.post("/api/v1/live/{session_id}/frame", tags=["camera"])
    async def live_browser_frame(session_id: str, file: Annotated[UploadFile, File()]) -> dict[str, Any]:
        try:
            data = await file.read(512_001)
            return await run_in_threadpool(live.browser_frame, session_id, data)
        except KeyError as error:
            raise HTTPException(404, "Live session expired. Start detection again.") from error
        except (ValueError, OSError) as error:
            raise HTTPException(422, str(error)) from error
        finally:
            await file.close()

    @app.get("/api/v1/live/{session_id}/frame", tags=["camera"])
    def live_network_frame(session_id: str) -> dict[str, Any]:
        try:
            return live.network_frame(session_id)
        except KeyError as error:
            raise HTTPException(404, "Live session expired. Start detection again.") from error
        except (ValueError, OSError) as error:
            raise HTTPException(422, str(error)) from error

    @app.delete("/api/v1/live/{session_id}", tags=["camera"])
    def stop_live_session(session_id: str) -> dict[str, str]:
        live.close(session_id)
        return {"id": session_id}

    @app.get("/api/v1/scenes/{scene_id}/sun", tags=["scenes"])
    def get_scene_sun(
        scene_id: str,
        database: Annotated[Store, Depends(get_store)],
        at_time: Annotated[datetime | None, Query(alias="at")] = None,
    ) -> dict[str, float | str | bool | None]:
        scene = database.get_scene(scene_id)
        if scene is None:
            raise HTTPException(status_code=404, detail="Scene not found")
        if at_time is not None and at_time.tzinfo is None:
            raise HTTPException(status_code=422, detail="Sun time must include a time zone")
        return sun_metadata(scene, at=at_time)

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

    @app.get("/api/v1/trials/{trial_id}/manual-ground-truth", response_model=ManualGroundTruth, tags=["trials"])
    def get_manual_ground_truth(
        trial_id: str,
        database: Annotated[Store, Depends(get_store)],
    ) -> dict[str, Any]:
        if database.get_trial(trial_id) is None:
            raise HTTPException(status_code=404, detail="Trial not found")
        review = database.get_manual_ground_truth(trial_id)
        if review is None:
            raise HTTPException(status_code=404, detail="No manual labels saved for this trial")
        return review

    @app.put("/api/v1/trials/{trial_id}/manual-ground-truth", response_model=ManualGroundTruth, tags=["trials"])
    def save_manual_ground_truth(
        trial_id: str,
        payload: ManualGroundTruth,
        database: Annotated[Store, Depends(get_store)],
    ) -> dict[str, Any]:
        trial = database.get_trial(trial_id)
        if trial is None:
            raise HTTPException(status_code=404, detail="Trial not found")
        if trial.get("ground_truth_media_id") != payload.ground_truth_media_id:
            raise HTTPException(status_code=422, detail="Manual labels must use this trial's attached ground-truth video")
        return database.save_manual_ground_truth(trial_id, payload.model_dump(mode="json", exclude={"updated_at"}))

    @app.get("/api/v1/trials/{trial_id}/shadow-region", response_model=ManualRegion, tags=["trials"])
    def get_shadow_region(
        trial_id: str,
        database: Annotated[Store, Depends(get_store)],
    ) -> dict[str, Any]:
        if database.get_trial(trial_id) is None:
            raise HTTPException(status_code=404, detail="Trial not found")
        region = database.get_shadow_region(trial_id)
        if region is None:
            raise HTTPException(status_code=404, detail="No shadow area saved for this trial")
        return region

    @app.put("/api/v1/trials/{trial_id}/shadow-region", response_model=ManualRegion, tags=["trials"])
    def save_shadow_region(
        trial_id: str,
        payload: ManualRegion,
        database: Annotated[Store, Depends(get_store)],
    ) -> dict[str, Any]:
        if database.get_trial(trial_id) is None:
            raise HTTPException(status_code=404, detail="Trial not found")
        return database.save_shadow_region(trial_id, payload.model_dump())

    @app.delete("/api/v1/trials/{trial_id}/shadow-region", tags=["trials"])
    def delete_shadow_region(
        trial_id: str,
        database: Annotated[Store, Depends(get_store)],
    ) -> dict[str, str]:
        if not database.delete_shadow_region(trial_id):
            raise HTTPException(status_code=404, detail="Trial not found")
        return {"trial_id": trial_id}

    @app.delete("/api/v1/trials/{trial_id}", tags=["trials"])
    def delete_trial(
        trial_id: str,
        current_service: Annotated[UmbraService, Depends(get_service)],
    ) -> dict[str, str]:
        if not current_service.delete_trial(trial_id):
            raise HTTPException(status_code=404, detail="Trial not found")
        return {"trial_id": trial_id}

    @app.get("/api/v1/media/{media_id}/stream", tags=["media"])
    def stream_media(media_id: str, database: Annotated[Store, Depends(get_store)]) -> FileResponse:
        media = database.get_media(media_id)
        if media is None:
            raise HTTPException(status_code=404, detail="Media not found")
        path = Path(media["path"])
        if not path.is_file():
            raise HTTPException(status_code=404, detail="The local media file is missing")
        # No Content-Disposition attachment: this endpoint is used by the local
        # review player's <video> element and must be streamable in place.
        return FileResponse(path, media_type=media.get("content_type") or "video/mp4")

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

    @app.delete("/api/v1/analyses/{analysis_id}", tags=["analysis"])
    def delete_analysis(
        analysis_id: str,
        current_service: Annotated[UmbraService, Depends(get_service)],
    ) -> dict[str, str]:
        if not current_service.delete_analysis(analysis_id):
            raise HTTPException(status_code=404, detail="Analysis not found")
        return {"analysis_id": analysis_id}

    @app.get("/api/v1/analyses/{analysis_id}/report", tags=["analysis"])
    def get_report(analysis_id: str, database: Annotated[Store, Depends(get_store)]) -> FileResponse:
        if database.get_analysis(analysis_id) is None:
            raise HTTPException(status_code=404, detail="Analysis not found")
        report_path = settings.report_dir / f"{analysis_id}.html"
        if not report_path.exists():
            raise HTTPException(status_code=404, detail="Report was not generated")
        return FileResponse(report_path, media_type="text/html")

    @app.get("/api/v1/analyses/{analysis_id}/visualization", tags=["analysis"])
    def get_visualization(analysis_id: str, database: Annotated[Store, Depends(get_store)]) -> FileResponse:
        record = database.get_analysis(analysis_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Analysis not found")
        visualization_path = Path(record["path"]).with_name("analysis-visualization.mp4")
        if not visualization_path.exists():
            raise HTTPException(status_code=404, detail="This analysis has no visualization video")
        return FileResponse(visualization_path, media_type="video/mp4")

    @app.get("/api/v1/analyses/{analysis_id}/hidden-path-visualization", tags=["analysis"])
    def get_hidden_path_visualization(
        analysis_id: str, database: Annotated[Store, Depends(get_store)]
    ) -> FileResponse:
        record = database.get_analysis(analysis_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Analysis not found")
        visualization_path = Path(record["path"]).with_name("hidden-path-visualization.mp4")
        if not visualization_path.exists():
            raise HTTPException(status_code=404, detail="This analysis has no hidden-path visualization video")
        return FileResponse(visualization_path, media_type="video/mp4")

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
        visualizations = [
            (run / "analysis-visualization.mp4", "corner-trial-visualization.mp4"),
            (run / "hidden-path-visualization.mp4", "hidden-path-visualization.mp4"),
        ]
        paths_and_names = list(zip(paths, ("result.json", "predictions.csv", "report.html"), strict=True))
        paths_and_names.extend((path, name) for path, name in visualizations if path.exists())
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            for path, name in paths_and_names:
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
        @app.get("/", include_in_schema=False)
        def research_home() -> RedirectResponse:
            return RedirectResponse("/parking.html")

        app.mount("/", StaticFiles(directory=frontend, html=True), name="dashboard")
    return app


app = create_app()


def main() -> None:
    uvicorn.run("umbra.api:app", host="127.0.0.1", port=8000, reload=False)


if __name__ == "__main__":
    main()
