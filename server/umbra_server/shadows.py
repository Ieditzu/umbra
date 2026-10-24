"""Flat-ground prism shadows with explicit missing-height uncertainty."""

from __future__ import annotations

import math
from collections import OrderedDict
from datetime import datetime

import pandas as pd
import pvlib
from shapely import Point, Polygon, box, union_all
from shapely.affinity import translate

from .data import TO_GPS, TO_METERS, Dataset


def extrude(polygon: Polygon, dx: float, dy: float):
    # Sweep each exterior edge instead of a convex hull (which would fill
    # concavities with fictitious shadows). Holes are conservatively filled.
    shell = Polygon(polygon.exterior)
    pieces = [shell, translate(shell, xoff=dx, yoff=dy)]
    coords = list(shell.exterior.coords)
    for a, b in zip(coords, coords[1:]):
        pieces.append(Polygon([a, b, (b[0] + dx, b[1] + dy), (a[0] + dx, a[1] + dy)]))
    return union_all(pieces)


class ShadowModel:
    def __init__(self, data: Dataset):
        self.data = data
        self.cache: OrderedDict = OrderedDict()

    def at(self, instant: datetime):
        key = int(instant.timestamp()) // 60
        if key in self.cache:
            self.cache.move_to_end(key)
            return self.cache[key]
        west, south, east, north = self.data.coverage
        position = pvlib.solarposition.get_solarposition(pd.DatetimeIndex([pd.Timestamp(key * 60, unit="s", tz="UTC")]), (south + north) / 2, (west + east) / 2).iloc[0]
        elevation, azimuth = float(position.apparent_elevation), float(position.azimuth)
        known, uncertain, drawings = [], [], []
        low_sun = elevation < 8
        if not low_sun:
            angle = math.radians(azimuth)
            for building in self.data.buildings:
                # Unknown height can cast a shadow at any distance along its
                # ray in the extract; do not substitute a made-up exact height.
                length = building.height / math.tan(math.radians(elevation)) if building.height else 6000
                shadow = extrude(building.polygon, -math.sin(angle) * length, -math.cos(angle) * length)
                if building.height is None:
                    uncertain.append(shadow)
                else:
                    known.append(shadow)
                    drawings.append((building, shadow))
        result = {"elevation": elevation, "azimuth": azimuth, "low_sun": low_sun,
                  "known": union_all(known), "uncertain": union_all(uncertain), "drawings": drawings}
        self.cache[key] = result
        while len(self.cache) > 45:
            self.cache.popitem(last=False)
        return result

    def exposure(self, point: Point, instant: datetime, surface: str):
        model = self.at(instant)
        if model["low_sun"] or surface != "explicit":
            return "unknown"
        if model["known"].covers(point):
            return "shade"
        # Incomplete building relations can conceal additional obstructions.
        if self.data.relation_warning or model["uncertain"].covers(point):
            return "unknown"
        return "sun"

    def overlay(self, instant: datetime, bounds):
        model = self.at(instant)
        minx, miny = TO_METERS.transform(bounds[0], bounds[1])
        maxx, maxy = TO_METERS.transform(bounds[2], bounds[3])
        viewport = box(minx, miny, maxx, maxy)
        features = []
        for building, shape in model["drawings"]:
            clipped = shape.intersection(viewport).simplify(0.6, preserve_topology=True)
            for part in clipped.geoms if hasattr(clipped, "geoms") else [clipped]:
                if isinstance(part, Polygon) and not part.is_empty:
                    coords = [list(TO_GPS.transform(x, y)) for x, y in part.exterior.coords]
                    features.append({"type": "Feature", "properties": {"height_source": "levels_estimate" if building.estimated else "osm_height", "building_id": building.osm_id}, "geometry": {"type": "Polygon", "coordinates": [coords]}})
        # Missing-height footprints are visibly distinct, not giant invented shadows.
        for building in self.data.buildings:
            if building.height is None and building.polygon.intersects(viewport):
                part = building.polygon.intersection(viewport)
                if isinstance(part, Polygon) and not part.is_empty:
                    features.append({"type": "Feature", "properties": {"height_source": "unknown", "building_id": building.osm_id}, "geometry": {"type": "Polygon", "coordinates": [[list(TO_GPS.transform(x, y)) for x, y in part.exterior.coords]]}})
        return {"at": instant.isoformat(), "solar_elevation": round(model["elevation"], 3), "solar_azimuth": round(model["azimuth"], 3),
                "state": "night" if model["elevation"] <= 0 else "low_sun" if model["low_sun"] else "available",
                "type": "FeatureCollection", "features": features[:2000], "truncated": len(features) > 2000,
                "estimated": True, "attribution": ["© OpenStreetMap contributors · ODbL 1.0"],
                "warnings": ["Model geometric pe teren plat; înălțimile din etaje sunt estimate la 3 m/etaj. Nu include arbori, nori sau măsurători de temperatură."]}
