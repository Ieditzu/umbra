"""Local API for the measured-light hidden-image experiment."""

from typing import Annotated, Literal

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from .periscope import PeriscopeLab
from .schemas import ManualRegion


class ExperimentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    grid_side: Literal[2, 3, 4] = 4
    region: ManualRegion = Field(default_factory=lambda: ManualRegion(x=0, y=0, width=1, height=1))


class DisplayPattern(BaseModel):
    cells: list[Literal[0, 1]] = Field(min_length=4, max_length=16)


class DisplayAcknowledgement(BaseModel):
    revision: str = Field(min_length=1, max_length=50)


def periscope_router(lab: PeriscopeLab) -> APIRouter:
    router = APIRouter(prefix="/api/v1/periscope", tags=["hidden image lab"])

    def checked(function, *args):
        try:
            return function(*args)
        except KeyError as error:
            raise HTTPException(404, "Experiment or artifact not found") from error
        except ValueError as error:
            raise HTTPException(422, str(error)) from error

    @router.get("")
    def list_experiments():
        return lab.list()

    @router.post("", status_code=201)
    def create_experiment(payload: ExperimentCreate):
        return lab.create(payload.name.strip() or "Untitled experiment", payload.grid_side, payload.region.model_dump())

    @router.get("/{experiment_id}")
    def get_experiment(experiment_id: str):
        return checked(lab.get, experiment_id)

    @router.delete("/{experiment_id}")
    def archive_experiment(experiment_id: str):
        checked(lab.archive, experiment_id)
        return {"id": experiment_id, "status": "archived"}

    @router.get("/{experiment_id}/bundle")
    def download_experiment(experiment_id: str):
        content = checked(lab.bundle, experiment_id)
        return Response(content, media_type="application/zip", headers={
            "Content-Disposition": f'attachment; filename="umbra-optics-{experiment_id}.zip"',
        })

    @router.put("/{experiment_id}/region")
    def update_region(experiment_id: str, payload: ManualRegion):
        return checked(lab.update_region, experiment_id, payload.model_dump())

    @router.post("/{experiment_id}/captures/{label}")
    async def capture(experiment_id: str, label: str, file: Annotated[UploadFile, File()]):
        try:
            raw = await file.read(512_001)
            return await run_in_threadpool(checked, lab.capture, experiment_id, label, raw)
        finally:
            await file.close()

    @router.post("/{experiment_id}/fit")
    def fit(experiment_id: str):
        return checked(lab.fit, experiment_id)

    @router.post("/{experiment_id}/reconstruct", status_code=201)
    async def solve(experiment_id: str, file: Annotated[UploadFile, File()]):
        try:
            raw = await file.read(512_001)
            return await run_in_threadpool(checked, lab.solve, experiment_id, raw)
        finally:
            await file.close()

    @router.get("/{experiment_id}/display")
    def get_display(experiment_id: str):
        data = checked(lab.get, experiment_id)
        return data["display"] or {"cells": [0] * data["grid_side"] ** 2, "grid_side": data["grid_side"], "revision": "initial"}

    @router.put("/{experiment_id}/display")
    def set_display(experiment_id: str, payload: DisplayPattern):
        return checked(lab.set_display, experiment_id, payload.cells)

    @router.post("/{experiment_id}/display/ack")
    def acknowledge_display(experiment_id: str, payload: DisplayAcknowledgement):
        return checked(lab.acknowledge_display, experiment_id, payload.revision)

    @router.get("/{experiment_id}/files/{filename}")
    def artifact(experiment_id: str, filename: str):
        path = checked(lab.artifact, experiment_id, filename)
        return FileResponse(path, filename=path.name)

    return router
