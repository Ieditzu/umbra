"""Sun position for a scene's location and local recording time."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from astral import Observer
from astral.sun import azimuth, elevation


def sun_metadata(scene: dict[str, Any], at: datetime | None = None) -> dict[str, float | str | bool | None]:
    latitude, longitude = scene.get("latitude"), scene.get("longitude")
    recorded_at = at or scene.get("recorded_at")
    if latitude is None or longitude is None or not recorded_at:
        return {"status": "not_available", "elevation_deg": None, "azimuth_deg": None, "above_horizon": None}
    try:
        moment = recorded_at if isinstance(recorded_at, datetime) else datetime.fromisoformat(str(recorded_at).replace("Z", "+00:00"))
        if moment.tzinfo is None:
            moment = moment.replace(tzinfo=UTC)
        observer = Observer(latitude=float(latitude), longitude=float(longitude))
        sun_elevation = float(elevation(observer, moment))
        return {
            "status": "estimated",
            "elevation_deg": round(sun_elevation, 2),
            "azimuth_deg": round(float(azimuth(observer, moment)), 2),
            "above_horizon": sun_elevation > 0,
        }
    except (TypeError, ValueError, OverflowError):
        return {"status": "not_available", "elevation_deg": None, "azimuth_deg": None, "above_horizon": None}
