"""Background shadow map for the poster: Tomis Nord at 1:1000 (1 m = 1 mm on an 800 x 1200 mm sheet).

Shadows use the app's own Sun position (27 Oct 2026, 10:00 Romania) and only buildings whose
height the app knows (OSM height tag or floor count). Buildings without a height are drawn as
outlines, the 87.8 % gap the paper is about.

Run with:
    uv run --python 3.12 --with numpy==2.3.4 --with shapely==2.1.2 --with pyproj==3.7.2 \
        python scripts/poster-map.py docs/poster/map.svg
"""

from __future__ import annotations

import base64
import gzip
import importlib.util
import json
import math
import sys
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import MultiPolygon, Polygon, box

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("measure", ROOT / "scripts/shadow-measurability.py")
measure = importlib.util.module_from_spec(spec)
spec.loader.exec_module(measure)

CENTRE = (28.6255, 44.2075)  # Tomis Nord
WIDTH, HEIGHT = 800.0, 1200.0  # metres = millimetres at 1:1000
INSTANT = "27 oct 10:00"
GROUND, ROAD, BUILDING, OUTLINE, SHADOW = "#E9E2D4", "#FBF8F2", "#0F3D40", "#0F3D40", "#1A2B2E"


def positive(value: str | None) -> float:
    """Same parsing as buildingHeight() in mobile/src/engine/data.ts."""
    try:
        parsed = float((value or "").strip().removesuffix("m").strip())
    except ValueError:
        return 0.0
    return parsed if math.isfinite(parsed) and parsed > 0 else 0.0


def height(tags: dict[str, str]) -> float | None:
    """Same rule as the app: tag, else 3 m per floor (display value); elevated parts are skipped."""
    if positive(tags.get("min_height")) or positive(tags.get("building:min_level")):
        return None
    if tags.get("building") == "roof":
        return None
    tag = positive(tags.get("height"))
    if 0 < tag <= 1000:
        return tag
    levels = positive(tags.get("building:levels"))
    return 3.0 * levels if 0 < levels <= 150 else None


def path(geom, x0: float, y1: float) -> str:
    """SVG path in poster millimetres (y flipped: north up)."""
    polys = geom.geoms if hasattr(geom, "geoms") else [geom]
    parts = []
    for poly in polys:
        if poly.is_empty or not isinstance(poly, Polygon):
            continue
        for ring in [poly.exterior, *poly.interiors]:
            pts = [f"{x - x0:.2f},{y1 - y:.2f}" for x, y in ring.coords]
            parts.append("M" + "L".join(pts) + "Z")
    return "".join(parts)


def main(out: Path) -> None:
    cx, cy = Transformer.from_crs("EPSG:4326", "EPSG:32635", always_xy=True).transform(*CENTRE)
    x0, y0, x1, y1 = cx - WIDTH / 2, cy - HEIGHT / 2, cx + WIDTH / 2, cy + HEIGHT / 2
    frame = box(x0, y0, x1, y1)
    margin = box(x0 - 300, y0 - 300, x1 + 300, y1 + 300)

    packed = json.loads((ROOT / "mobile/assets/data/constanta-city.json").read_text())
    raw = json.loads(gzip.decompress(base64.b64decode(packed["payload"])))
    sun = measure.suns()[INSTANT]
    away = (-sun["towards"]["x"], -sun["towards"]["y"])
    cot = 1 / math.tan(math.radians(sun["elevation"]))

    known, unknown, shadows = [], [], []
    for b in raw["buildings"]:
        polys = [
            Polygon([(p["x"], p["y"]) for p in poly[0]], [[(p["x"], p["y"]) for p in hole] for hole in poly[1:]])
            for poly in b["geometry"]
        ]
        shape = MultiPolygon(polys) if len(polys) > 1 else polys[0]
        if not shape.is_valid or not shape.intersects(margin):
            continue
        h = height(b["tags"])
        if h is None:
            unknown.append(shape)
            continue
        known.append(shape)
        shadows.append(measure.shadow(shape, (away[0] * h * cot, away[1] * h * cot)))

    roads = []
    for e in raw["edges"]:
        pts = [(p["x"], p["y"]) for p in e["geometry"]]
        if any(x0 - 50 <= x <= x1 + 50 and y0 - 50 <= y <= y1 + 50 for x, y in pts):
            roads.append("M" + "L".join(f"{x - x0:.2f},{y1 - y:.2f}" for x, y in pts))

    clip = lambda shapes: [g.intersection(frame) for g in shapes if g.intersects(frame)]
    svg = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH:g} {HEIGHT:g}" width="{WIDTH:g}mm" height="{HEIGHT:g}mm">',
        f'<rect width="{WIDTH:g}" height="{HEIGHT:g}" fill="{GROUND}"/>',
        f'<path d="{"".join(roads)}" fill="none" stroke="{ROAD}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>',
        f'<path d="{"".join(path(s, x0, y1) for s in clip(shadows))}" fill="{SHADOW}" fill-opacity="0.30" fill-rule="nonzero"/>',
        f'<path d="{"".join(path(s, x0, y1) for s in clip(unknown))}" fill="{GROUND}" stroke="{OUTLINE}" stroke-width="0.9"/>',
        f'<path d="{"".join(path(s, x0, y1) for s in clip(known))}" fill="{BUILDING}"/>',
        "</svg>",
    ]
    out.write_text("\n".join(svg))
    print(json.dumps({"sun": {k: round(sun[k], 1) for k in ("elevation", "azimuth")},
                      "known_height_buildings": len(clip(known)), "unknown_height_buildings": len(clip(unknown)),
                      "road_segments": len(roads), "bytes": out.stat().st_size}))


if __name__ == "__main__":
    main(Path(sys.argv[1]))
