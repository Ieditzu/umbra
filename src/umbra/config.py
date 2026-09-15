"""Runtime configuration for the local Umbra service."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv


@dataclass(frozen=True, slots=True)
class Settings:
    """Paths and conservative resource limits for a single local researcher."""

    data_dir: Path
    max_upload_bytes: int

    @property
    def database_path(self) -> Path:
        return self.data_dir / "umbra.sqlite3"

    @property
    def media_dir(self) -> Path:
        return self.data_dir / "media"

    @property
    def run_dir(self) -> Path:
        return self.data_dir / "runs"

    @property
    def report_dir(self) -> Path:
        return self.data_dir / "reports"

    @property
    def model_dir(self) -> Path:
        return self.data_dir / "models"

    @property
    def synthetic_dir(self) -> Path:
        return self.data_dir / "synthetic"

    def ensure_directories(self) -> None:
        for directory in (
            self.data_dir,
            self.media_dir,
            self.run_dir,
            self.report_dir,
            self.model_dir,
            self.synthetic_dir,
        ):
            directory.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return settings without requiring an external service or account.

    The default is intentionally a sibling of the checkout, so large and
    potentially sensitive recordings are not placed in Git by accident.
    """

    load_dotenv()
    configured = os.environ.get("UMBRA_DATA_DIR")
    data_dir = (
        Path(configured).expanduser().resolve()
        if configured
        else (Path.cwd().parent / "umbra-data").resolve()
    )
    max_upload_mb = int(os.environ.get("UMBRA_MAX_UPLOAD_MB", "2048"))
    settings = Settings(data_dir=data_dir, max_upload_bytes=max_upload_mb * 1024 * 1024)
    settings.ensure_directories()
    return settings
