"""Extract non-overlapping Copernicus 2012 raster samples for the bundled city.

Run: uv run --python 3.12 --with rasterio --with pyproj python scripts/extract-copernicus-heights.py /path/to/RO501_DHM.tif
Source: © European Union, Copernicus Land Monitoring Service 2022, EEA.
Pixels are associated only with a single OSM footprint; this is not ground truth.
"""

import base64
import gzip
import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.enums import MergeAlg
from rasterio.features import rasterize

raw = json.loads(
    gzip.decompress(
        base64.b64decode(
            json.loads(Path("mobile/assets/data/constanta-city.json").read_text())[
                "payload"
            ]
        )
    )
)
transformer = Transformer.from_crs(32635, 3035, always_xy=True)
fpath = sys.argv[1]
with rasterio.open(fpath) as ds:
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
    mask = (count == 1) & (labels > 0) & (img >= 3) & (img <= 200) & (img != ds.nodata)
    labels = labels[mask]
    values = img[mask]
    print("valid pixels:", len(values), flush=True)
    groups = defaultdict(list)
    for idx, v in zip(labels.tolist(), values.tolist()):
        groups[idx - 1].append(v)
    heights = {
        raw["buildings"][i]["id"]: float(np.median(v)) for i, v in groups.items()
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
            np.median(abs(err)),
            "mean_abs",
            np.mean(abs(err)),
            "median_bias",
            np.median(err),
            "within 3m",
            np.mean(abs(err) <= 3),
            flush=True,
        )
    if levels:
        x = np.array(levels)
        print(
            "floors comparison: within 2.5-3.5m/floor +3",
            np.mean((x[:, 0] >= x[:, 1] * 2.5) & (x[:, 0] <= x[:, 1] * 3.5 + 3)),
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
        "source": "Copernicus Urban Atlas Building Block Height 2012 RO501 v010",
        "license": "© European Union, Copernicus Land Monitoring Service 2022, European Environment Agency (EEA)",
        "values": selected,
    }
    with open("mobile/assets/data/constanta-heights-2012.json", "w") as file:
        file.write(json.dumps(output, separators=(",", ":")) + "\n")
    print("saved previously missing heights:", len(selected), flush=True)
