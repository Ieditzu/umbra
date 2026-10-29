"""Extract non-overlapping Copernicus building-height raster samples for a bundled city.

Legacy: uv run --python 3.12 --with rasterio --with pyproj python scripts/extract-copernicus-heights.py \
    /path/RO501_DHM.tif [constanta|suceava]
Generic: ... extract-copernicus-heights.py RASTER ID --city-file CITY.json --out HEIGHTS.json \
    --source "Copernicus Urban Atlas Building Block Height 2021 ..." --year 2021
Source: © European Union, Copernicus Land Monitoring Service 2022, EEA.
Pixels are associated only with a single OSM footprint; this is not ground truth.
"""

import argparse
import base64
import gzip
import json
from collections import defaultdict
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.enums import MergeAlg
from rasterio.features import rasterize

LEGACY = {
    "constanta": "Copernicus Urban Atlas Building Block Height 2012 RO501 v010",
    "suceava": "Copernicus Urban Atlas Building Block Height 2012 RO512 v010",
}
parser = argparse.ArgumentParser()
parser.add_argument("raster")
parser.add_argument("city", nargs="?", default="constanta")
parser.add_argument("--city-file")
parser.add_argument("--out")
parser.add_argument("--source")
parser.add_argument("--year", type=int, default=2012)
args = parser.parse_args()
city = args.city
if not args.city_file and city not in LEGACY:
    raise ValueError("Unsupported city")
city_file = Path(args.city_file or f"mobile/assets/data/{city}-city.json")
out_file = Path(args.out or f"mobile/assets/data/{city}-heights-2012.json")
source = args.source or LEGACY[city]
raw = json.loads(
    gzip.decompress(base64.b64decode(json.loads(city_file.read_text())["payload"]))
)
fpath = args.raster
with rasterio.open(fpath) as ds:
    transformer = Transformer.from_crs(32635, ds.crs, always_xy=True)
    img = ds.read(1)
    shape = img.shape
    transform = ds.transform
    shapes = []
    for i, b in enumerate(raw["buildings"]):
        coords = []
        for poly in b["geometry"]:
            rings = []
            for ring in poly:
                xx, yy = transformer.transform(
                    [p["x"] for p in ring], [p["y"] for p in ring]
                )
                rings.append(list(zip(xx, yy)))
            coords.append(rings)
        shapes.append(({"type": "MultiPolygon", "coordinates": coords}, i + 1))
    labels = rasterize(shapes, out_shape=shape, transform=transform, dtype="int32")
    count = rasterize(
        ((g, 1) for g, _ in shapes),
        out_shape=shape,
        transform=transform,
        dtype="uint16",
        merge_alg=MergeAlg.add,
    )
    valid = (img >= 3) & (img <= 200)
    if ds.nodata is not None:
        valid &= img != ds.nodata
    mask = (count == 1) & (labels > 0) & valid
    labels = labels[mask]
    values = img[mask]
    print("valid pixels:", len(values), flush=True)
    groups = defaultdict(list)
    for idx, v in zip(labels.tolist(), values.tolist()):
        groups[idx - 1].append(v)
    heights = {
        raw["buildings"][i]["id"]: round(float(np.median(v)), 1)
        for i, v in groups.items()
    }
    print("matched buildings:", len(heights), flush=True)
    samples = []
    missing = 0
    levels = []
    for b in raw["buildings"]:
        h = heights.get(b["id"])
        tags = b["tags"]
        if not h:
            continue
        try:
            osm = float(tags.get("height", "").replace("m", "").strip())
        except (TypeError, ValueError):
            osm = 0
        try:
            lv = float(tags.get("building:levels", ""))
        except (TypeError, ValueError):
            lv = 0
        if osm > 0 and osm <= 1000:
            samples.append((h, osm))
        elif lv > 0:
            levels.append((h, lv))
        else:
            missing += 1
    print(
        "missing:", missing, "tagged:", len(samples), "levels:", len(levels), flush=True
    )
    if samples:
        x = np.array(samples)
        err = x[:, 0] - x[:, 1]
        print(
            "tag comparison: median_abs",
            round(float(np.median(abs(err))), 2),
            "mean_abs",
            round(float(np.mean(abs(err))), 2),
            "median_bias",
            round(float(np.median(err)), 2),
            "within 3m",
            round(float(np.mean(abs(err) <= 3)), 3),
            flush=True,
        )
    if levels:
        x = np.array(levels)
        print(
            "floors comparison: within 2.5-3.5m/floor +3",
            round(
                float(
                    np.mean((x[:, 0] >= x[:, 1] * 2.5) & (x[:, 0] <= x[:, 1] * 3.5 + 3))
                ),
                3,
            ),
            flush=True,
        )
    selected = {
        b["id"]: heights[b["id"]]
        for b in raw["buildings"]
        if b["id"] in heights
        and not any(
            k in b["tags"]
            for k in ("height", "building:levels", "min_height", "building:min_level")
        )
        and b["tags"].get("building") != "roof"
    }
    output = {
        "schema_version": 1,
        "source": source,
        "year": args.year,
        "license": "© European Union, Copernicus Land Monitoring Service 2022, European Environment Agency (EEA)",
        "values": selected,
    }
    with open(out_file, "w") as file:
        file.write(json.dumps(output, separators=(",", ":")) + "\n")
    print("saved previously missing heights:", len(selected), flush=True)
