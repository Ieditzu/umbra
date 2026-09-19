"""Public request and response shapes for the local API."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

MediaRole = Literal["calibration", "main", "ground_truth"]
JobStatus = Literal["queued", "running", "succeeded", "failed"]


class SceneCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    recorded_at: datetime | None = None
    notes: str = Field(default="", max_length=2_000)

    @field_validator("name")
    @classmethod
    def trim_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("A scene name is required")
        return value


class Scene(SceneCreate):
    id: str
    created_at: datetime


class MediaAsset(BaseModel):
    id: str
    scene_id: str
    role: MediaRole
    original_name: str
    content_type: str | None = None
    path: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class TrialCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    calibration_media_id: str
    main_media_id: str
    ground_truth_media_id: str | None = None
    track_length_m: float | None = Field(default=None, gt=0, le=1_000)


class Trial(TrialCreate):
    id: str
    scene_id: str
    created_at: datetime


class ManualPoint(BaseModel):
    """A click position normalized to the displayed video frame."""

    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)


class ManualTrackSample(ManualPoint):
    timestamp_s: float = Field(ge=0, le=86_400)


class ManualGroundTruth(BaseModel):
    """Reviewed labels for one markerless ground-truth recording."""

    ground_truth_media_id: str
    corner: ManualPoint | None = None
    far_point: ManualPoint | None = None
    samples: list[ManualTrackSample] = Field(default_factory=list, max_length=1_000)
    main_entry_timestamp_s: float | None = Field(default=None, ge=0, le=86_400)
    updated_at: datetime | None = None


class Job(BaseModel):
    id: str
    kind: str
    status: JobStatus
    progress: float = Field(ge=0, le=1)
    message: str
    result: dict[str, Any] | None = None
    error: str | None = None
    created_at: datetime
    updated_at: datetime


class AnalysisRequest(BaseModel):
    include_baselines: bool = True


class SyntheticRequest(BaseModel):
    seed: int = Field(default=7, ge=0, le=2_147_483_647)
    frames: int = Field(default=120, ge=60, le=360)
    target_present: bool = True
    lighting: Literal["directional", "flat", "reflective"] = "directional"


class TrainRequest(BaseModel):
    examples: int = Field(default=24, ge=8, le=128)
    epochs: int = Field(default=4, ge=1, le=40)


class Health(BaseModel):
    name: str
    version: str
    data_dir: str
    ml_available: bool
