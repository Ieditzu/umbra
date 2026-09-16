"""Small SQLite persistence layer; local-only and dependency-light."""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


class Store:
    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path
        self._initialise()

    def _connection(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialise(self) -> None:
        with self._connection() as connection:
            connection.executescript(
                """
                PRAGMA foreign_keys = ON;
                CREATE TABLE IF NOT EXISTS scenes (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    latitude REAL,
                    longitude REAL,
                    recorded_at TEXT,
                    notes TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS media (
                    id TEXT PRIMARY KEY,
                    scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
                    role TEXT NOT NULL,
                    original_name TEXT NOT NULL,
                    content_type TEXT,
                    path TEXT NOT NULL,
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS trials (
                    id TEXT PRIMARY KEY,
                    scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
                    name TEXT NOT NULL,
                    calibration_media_id TEXT NOT NULL REFERENCES media(id),
                    main_media_id TEXT NOT NULL REFERENCES media(id),
                    ground_truth_media_id TEXT REFERENCES media(id),
                    track_length_m REAL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY,
                    kind TEXT NOT NULL,
                    status TEXT NOT NULL,
                    progress REAL NOT NULL,
                    message TEXT NOT NULL,
                    result_json TEXT,
                    error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS analyses (
                    id TEXT PRIMARY KEY,
                    trial_id TEXT NOT NULL REFERENCES trials(id) ON DELETE CASCADE,
                    path TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                """
            )

    @staticmethod
    def _row(row: sqlite3.Row | None) -> dict[str, Any] | None:
        if row is None:
            return None
        result = dict(row)
        for key in ("metadata_json", "result_json"):
            if key in result:
                value = result.pop(key)
                result[key.removesuffix("_json")] = json.loads(value) if value else None
        return result

    def _insert(self, table: str, payload: dict[str, Any]) -> dict[str, Any]:
        columns = ", ".join(payload)
        placeholders = ", ".join(f":{key}" for key in payload)
        with self._connection() as connection:
            connection.execute(f"INSERT INTO {table} ({columns}) VALUES ({placeholders})", payload)
        return payload

    def create_scene(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utc_now()
        return self._insert(
            "scenes",
            {
                "id": str(uuid.uuid4()),
                "name": payload["name"],
                "latitude": payload.get("latitude"),
                "longitude": payload.get("longitude"),
                "recorded_at": payload.get("recorded_at"),
                "notes": payload.get("notes", ""),
                "created_at": now,
            },
        )

    def list_scenes(self) -> list[dict[str, Any]]:
        with self._connection() as connection:
            rows = connection.execute("SELECT * FROM scenes ORDER BY created_at DESC").fetchall()
        return [self._row(row) for row in rows if row is not None]

    def get_scene(self, scene_id: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute("SELECT * FROM scenes WHERE id = ?", (scene_id,)).fetchone()
        return self._row(row)

    def create_media(self, payload: dict[str, Any]) -> dict[str, Any]:
        record = {
            "id": str(uuid.uuid4()),
            "scene_id": payload["scene_id"],
            "role": payload["role"],
            "original_name": payload["original_name"],
            "content_type": payload.get("content_type"),
            "path": payload["path"],
            "metadata_json": json.dumps(payload.get("metadata", {})),
            "created_at": utc_now(),
        }
        self._insert(
            "media",
            record,
        )
        response = dict(record)
        response["metadata"] = json.loads(response.pop("metadata_json"))
        return response

    def get_media(self, media_id: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute("SELECT * FROM media WHERE id = ?", (media_id,)).fetchone()
        return self._row(row)

    def list_media(self, scene_id: str) -> list[dict[str, Any]]:
        with self._connection() as connection:
            rows = connection.execute(
                "SELECT * FROM media WHERE scene_id = ? ORDER BY created_at", (scene_id,)
            ).fetchall()
        return [self._row(row) for row in rows if row is not None]

    def create_trial(self, scene_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self._insert(
            "trials",
            {
                "id": str(uuid.uuid4()),
                "scene_id": scene_id,
                "name": payload["name"],
                "calibration_media_id": payload["calibration_media_id"],
                "main_media_id": payload["main_media_id"],
                "ground_truth_media_id": payload.get("ground_truth_media_id"),
                "track_length_m": payload.get("track_length_m"),
                "created_at": utc_now(),
            },
        )

    def get_trial(self, trial_id: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute("SELECT * FROM trials WHERE id = ?", (trial_id,)).fetchone()
        return self._row(row)

    def list_trials(self, scene_id: str) -> list[dict[str, Any]]:
        with self._connection() as connection:
            rows = connection.execute(
                "SELECT * FROM trials WHERE scene_id = ? ORDER BY created_at DESC", (scene_id,)
            ).fetchall()
        return [self._row(row) for row in rows if row is not None]

    def create_job(self, kind: str, message: str = "Queued") -> dict[str, Any]:
        now = utc_now()
        record = {
            "id": str(uuid.uuid4()),
            "kind": kind,
            "status": "queued",
            "progress": 0.0,
            "message": message,
            "result_json": None,
            "error": None,
            "created_at": now,
            "updated_at": now,
        }
        self._insert(
            "jobs",
            record,
        )
        response = dict(record)
        response["result"] = response.pop("result_json")
        return response

    def update_job(self, job_id: str, **changes: Any) -> None:
        changes["updated_at"] = utc_now()
        if "result" in changes:
            changes["result_json"] = json.dumps(changes.pop("result"))
        assignments = ", ".join(f"{key} = :{key}" for key in changes)
        changes["id"] = job_id
        with self._connection() as connection:
            connection.execute(f"UPDATE jobs SET {assignments} WHERE id = :id", changes)

    def get_job(self, job_id: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return self._row(row)

    def create_analysis(self, trial_id: str, path: str, analysis_id: str | None = None) -> dict[str, Any]:
        return self._insert(
            "analyses",
            {
                "id": analysis_id or str(uuid.uuid4()),
                "trial_id": trial_id,
                "path": path,
                "created_at": utc_now(),
            },
        )

    def get_analysis(self, analysis_id: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute("SELECT * FROM analyses WHERE id = ?", (analysis_id,)).fetchone()
        return self._row(row)

    def list_analyses(self, scene_id: str) -> list[dict[str, Any]]:
        with self._connection() as connection:
            rows = connection.execute(
                "SELECT analyses.id, analyses.trial_id, analyses.created_at, trials.name AS trial_name "
                "FROM analyses JOIN trials ON trials.id = analyses.trial_id "
                "WHERE trials.scene_id = ? ORDER BY analyses.created_at DESC", (scene_id,),
            ).fetchall()
        return [dict(row) for row in rows]
