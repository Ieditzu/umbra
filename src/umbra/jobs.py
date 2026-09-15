"""Bounded local background jobs used by the dashboard."""

from __future__ import annotations

import traceback
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from .store import Store

JobWork = Callable[[Callable[[float, str], None]], dict[str, Any]]


class JobManager:
    def __init__(self, store: Store) -> None:
        self.store = store
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="umbra-worker")

    def submit(self, kind: str, work: JobWork) -> dict[str, Any]:
        job = self.store.create_job(kind)

        def update(progress: float, message: str) -> None:
            self.store.update_job(job["id"], status="running", progress=progress, message=message)

        def run() -> None:
            try:
                update(0.02, "Preparing local analysis")
                result = work(update)
                self.store.update_job(
                    job["id"], status="succeeded", progress=1.0, message="Complete", result=result
                )
            except Exception as error:  # pragma: no cover - surfaced to the UI
                self.store.update_job(
                    job["id"],
                    status="failed",
                    message="The job stopped before producing a result",
                    error=f"{error}\n{traceback.format_exc(limit=6)}",
                )

        self.executor.submit(run)
        return job
