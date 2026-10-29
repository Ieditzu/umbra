"""Minimal Copernicus Land Monitoring Service (CLMS) download client.

The service key stays local (default `.umbra-data/copernicus/service-key.json`, ignored by
Git, or `UMBRA_CLMS_KEY`). It is never printed. Docs: https://eea.github.io/clms-api-docs/
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import jwt

API = "https://land.copernicus.eu/api"
ROOT = Path(__file__).resolve().parents[1]
DEFAULT_KEY = ROOT / ".umbra-data/copernicus/service-key.json"
BUILDING_HEIGHT_2012 = "Urban Atlas Building Height 2012"


class Client:
    def __init__(self, key_path: Path | None = None) -> None:
        path = Path(os.environ.get("UMBRA_CLMS_KEY", key_path or DEFAULT_KEY))
        if not path.exists():
            raise SystemExit(
                f"Missing CLMS service key: save it as {DEFAULT_KEY} (ignored by Git)"
            )
        self.key = json.loads(path.read_text())
        self.token = ""
        self.expires = 0.0

    def _token(self) -> str:
        if self.token and time.time() < self.expires - 60:
            return self.token
        now = int(time.time())
        grant = jwt.encode(
            {
                "iss": self.key["client_id"],
                "sub": self.key["user_id"],
                "aud": self.key["token_uri"],
                "iat": now,
                "exp": now + 3600,
            },
            self.key["private_key"].encode(),
            algorithm="RS256",
        )
        body = urllib.parse.urlencode(
            {
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": grant,
            }
        ).encode()
        request = urllib.request.Request(
            self.key["token_uri"],
            data=body,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            data = json.load(response)
        self.token = data["access_token"]
        self.expires = time.time() + float(data.get("expires_in", 3600))
        return self.token

    def call(self, path: str, body: dict | None = None, auth: bool = True) -> object:
        headers = {"Accept": "application/json"}
        if auth:
            headers["Authorization"] = f"Bearer {self._token()}"
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(
            path if path.startswith("http") else f"{API}/{path}",
            data=data,
            headers=headers,
        )
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            detail = error.read()[:300].decode("utf-8", "replace")
            raise RuntimeError(f"CLMS {error.code} for {path.split('?')[0]}: {detail}") from None

    def dataset(self, title: str = BUILDING_HEIGHT_2012) -> dict:
        query = urllib.parse.urlencode(
            [
                ("portal_type", "DataSet"),
                ("SearchableText", title),
                ("metadata_fields", "UID"),
                ("metadata_fields", "downloadable_files"),
                ("b_size", "50"),
            ]
        )
        result = self.call(f"@search?{query}", auth=False)
        for item in result["items"]:
            if item.get("title", "").strip().lower() == title.lower():
                return item
        raise SystemExit(f"CLMS dataset not found: {title}")

    def request_file(self, dataset_uid: str, file_id: str) -> str:
        result = self.call(
            "@datarequest_post",
            {"Datasets": [{"DatasetID": dataset_uid, "FileID": file_id}]},
        )
        return result["TaskIds"][0]["TaskID"]

    def wait(self, task_id: str, timeout_s: float = 3600) -> str:
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            status = self.call(f"@datarequest_status_get?TaskID={task_id}")
            state = status.get("Status")
            if state == "Finished_ok" and status.get("DownloadURL"):
                return status["DownloadURL"]
            if state and state not in ("In_progress", "Queued", "Created"):
                raise RuntimeError(f"CLMS task {task_id} ended as {state}")
            time.sleep(20)
        raise TimeoutError(f"CLMS task {task_id} did not finish")
