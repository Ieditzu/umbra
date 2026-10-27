"""Estimate how many Constanța buildings have a shadow tip that can be measured on open ground.

A building is measurable at an instant when some footprint corner's shadow tip
(1) lies on the boundary of the building's own shadow, (2) is reached without the
corner-to-tip line crossing another footprint and (3) is not inside another
building's footprint or shadow. Trees, cars, slopes and fences are not in the
data, so this is an upper bound. The Sun comes from the app's own engine.

Heights: OSM tag, else 3 m per OSM floor, else the GBA estimate (from
compare-gba-heights.py's per-building.csv, kept outside Git), else skipped.

Run with:
    uv run --python 3.12 --with numpy==2.3.4 --with shapely==2.1.2 \
        python scripts/shadow-measurability.py /path/per-building.csv /path/output-dir
"""

from __future__ import annotations

import base64
import csv
import gzip
import json
import math
import subprocess
import sys
from pathlib import Path

import numpy as np
from shapely import STRtree, affinity
from shapely.geometry import LineString, MultiPolygon, Point, Polygon
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent
BUNDLE = ROOT / "mobile/assets/data/constanta-city.json"
CENTRE = (28.63, 44.18)  # longitude, latitude; one Sun per instant for the city
INSTANTS = {
    "27 oct 10:00": "2026-10-27T08:00:00Z",
    "27 oct 12:00": "2026-10-27T10:00:00Z",
    "27 oct 14:00": "2026-10-27T12:00:00Z",
    "21 iun 09:00": "2026-06-21T06:00:00Z",
    "21 iun 13:00": "2026-06-21T10:00:00Z",
    "21 iun 17:00": "2026-06-21T14:00:00Z",
}
MIN_ELEVATION = 10.0
TIP_TOLERANCE_M = 0.25


def suns() -> dict[str, dict]:
    """Ask the TypeScript engine for elevation and the grid direction towards the Sun."""
    solar = (ROOT / "mobile/src/engine/solar.ts").as_uri()
    geometry = (ROOT / "mobile/src/engine/geometry.ts").as_uri()
    script = f"""
import {{ solarPosition, solarDirection }} from "{solar}";
import {{ project }} from "{geometry}";
const c = {{ longitude: {CENTRE[0]}, latitude: {CENTRE[1]} }};
const out = {{}};
for (const [k, iso] of Object.entries({json.dumps(INSTANTS)})) {{
  const s = solarPosition(Date.parse(iso), c);
  out[k] = {{ ...s, towards: solarDirection(project(c), s.azimuth) }};
}}
console.log(JSON.stringify(out));
"""
    result = subprocess.run(
        ["node", "--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", script],
        check=True, capture_output=True, text=True,
    )
    return json.loads(result.stdout)


def load(per_building: Path) -> list[dict]:
    packed = json.loads(BUNDLE.read_text())
    raw = json.loads(gzip.decompress(base64.b64decode(packed["payload"])))
    with per_building.open() as f:
        info = {r["id"]: r for r in csv.DictReader(f)}
    rows = []
    for b in raw["buildings"]:
        r = info[b["id"]]
        if r["source"] == "unsupported_elevated":
            continue
        if r["source"] == "osm_height_tag":
            height, basis = float(r["tag_m"]), "tag"
        elif r["source"] == "estimated_from_levels":
            height, basis = 3.0 * float(r["levels"]), "levels"
        elif r["gba_m"]:
            height, basis = float(r["gba_m"]), "gba"
        else:
            continue
        polys = [
            Polygon([(p["x"], p["y"]) for p in poly[0]], [[(p["x"], p["y"]) for p in hole] for hole in poly[1:]])
            for poly in b["geometry"]
        ]
        shape = MultiPolygon(polys) if len(polys) > 1 else polys[0]
        if height < 2 or not shape.is_valid or shape.area < 10:
            continue
        rows.append({"id": b["id"], "shape": shape, "height": height, "basis": basis})
    return rows


def shadow(shape, offset: tuple[float, float]):
    """Footprint swept along the shadow vector (same construction as castShadow)."""
    moved = affinity.translate(shape, *offset)
    parts = [shape, moved]
    polys = shape.geoms if isinstance(shape, MultiPolygon) else [shape]
    for poly in polys:
        for ring in [poly.exterior, *poly.interiors]:
            c = list(ring.coords)
            for a, b in zip(c, c[1:]):
                quad = Polygon([a, b, (b[0] + offset[0], b[1] + offset[1]), (a[0] + offset[0], a[1] + offset[1])])
                if quad.area > 1e-6:
                    parts.append(quad)
    return unary_union(parts)


def corners(shape):
    polys = shape.geoms if isinstance(shape, MultiPolygon) else [shape]
    for poly in polys:
        yield from poly.exterior.coords[:-1]


def measurable(rows: list[dict], sun: dict) -> np.ndarray:
    away = (-sun["towards"]["x"], -sun["towards"]["y"])
    cot = 1 / math.tan(math.radians(sun["elevation"]))
    shadows, offsets = [], []
    for r in rows:
        length = r["height"] * cot
        offsets.append((away[0] * length, away[1] * length))
        shadows.append(shadow(r["shape"], offsets[-1]))
    feet = STRtree([r["shape"] for r in rows])
    shades = STRtree(shadows)
    ok = np.zeros(len(rows), dtype=bool)
    for i, r in enumerate(rows):
        own = shadows[i].boundary
        for cx, cy in corners(r["shape"]):
            tip = Point(cx + offsets[i][0], cy + offsets[i][1])
            # A tip against the building's own wall is not a measurable point on the ground.
            if own.distance(tip) > TIP_TOLERANCE_M or r["shape"].distance(tip) <= TIP_TOLERANCE_M:
                continue
            line = LineString([(cx, cy), (tip.x, tip.y)])
            if any(j != i for j in feet.query(line, predicate="crosses")):
                continue
            if any(j != i for j in shades.query(tip.buffer(TIP_TOLERANCE_M), predicate="intersects")):
                continue
            ok[i] = True
            break
    return ok


def main(per_building: Path, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    rows = load(per_building)
    heights = np.array([r["height"] for r in rows])
    classes = {"< 10 m": heights < 10, "10–20 m": (heights >= 10) & (heights < 20), "≥ 20 m": heights >= 20}
    summary = {
        "buildings_with_height": len(rows),
        "height_basis": {b: sum(r["basis"] == b for r in rows) for b in ["tag", "levels", "gba"]},
        "classes": {k: int(v.sum()) for k, v in classes.items()},
        "instants": {},
    }
    for label, sun in suns().items():
        entry = {"elevation_deg": round(sun["elevation"], 1), "azimuth_deg": round(sun["azimuth"], 1)}
        if sun["elevation"] >= MIN_ELEVATION:
            ok = measurable(rows, sun)
            entry["measurable_pct"] = round(float(ok.mean() * 100), 1)
            entry["by_height_pct"] = {k: round(float(ok[v].mean() * 100), 1) for k, v in classes.items()}
            entry["shadow_length_m_for_15m"] = round(15 / math.tan(math.radians(sun["elevation"])), 1)
        summary["instants"][label] = entry
        print(label, entry, flush=True)
    (out / "measurability.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(Path(sys.argv[1]), Path(sys.argv[2]))
