"""Build routable city snapshots for Romanian county seats from OSM and Copernicus data.

Run from the repository root (developer-only; app users need none of this):
    uv run --python 3.12 --with osmium==4.3.0 --with rasterio --with pyproj \
        --with 'pyjwt[crypto]' python -I scripts/build-cities.py /path/romania-YYMMDD.osm.pbf \
        [--only cluj-napoca,iasi] [--skip-heights] [--force]

Steps: discover county seats and municipal bounds in OSM, crop OSM, build the walking graph
and building index with the Go importer, package the snapshot, add Copernicus Urban Atlas
building-height estimates where the product covers the city, and write
`mobile/assets/data/cities/index.json`. Intermediate files live in ~/.cache/umbra-server/cities
and rasters in .umbra-data/copernicus; neither is committed. The CLMS service key is read from
.umbra-data/copernicus/service-key.json and never printed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
DATA = ROOT / "mobile/assets/data"
OUT = DATA / "cities"
CACHE = Path.home() / ".cache/umbra-server/cities"
RASTERS = ROOT / ".umbra-data/copernicus"
# Already bundled with hand-checked bounds, canopy and field-study data; kept unchanged.
LEGACY = {
    "constanta": {"file": "../constanta-city.json", "heights": "../constanta-heights-2012.json",
                  "manifest": "../manifest.json", "canopy": "../constanta-canopy.json"},
    "suceava": {"file": "../suceava-city.json", "heights": "../suceava-heights-2012.json",
                "manifest": "../suceava-manifest.json"},
}
# Routing bounds margin: ~1 km, as for the Constanța and Suceava extracts.
MARGIN = (0.015, 0.01)
# București is split into a grid of overlapping zones loaded on demand.
ZONE_GRID = (3, 3)
ZONE_OVERLAP = 0.012
UA2012 = "9b64a56b49f74f458aa401ad7809af16"
UA2021 = "14574a219d1b47799c5234c8f100541d"
UA2021_INFO = "e15c300f-435b-43c4-a710-42c65d7da3fd"
USER_AGENT = "UmbraShadeRouting/0.1 (personal research; https://github.com/Ieditzu/umbra)"
LICENSE = "© European Union, Copernicus Land Monitoring Service 2022, European Environment Agency (EEA)"


def run(cmd: list[str], cwd: Path = ROOT) -> str:
    print("+", " ".join(str(c) for c in cmd), flush=True)
    result = subprocess.run(cmd, cwd=cwd, check=True, text=True, capture_output=True)
    return result.stdout


def python(script: str, *args: str, deps: tuple[str, ...]) -> str:
    cmd = ["uv", "run", "-q", "--python", "3.12"]
    for dep in deps:
        cmd += ["--with", dep]
    return run(cmd + ["python", "-I", str(ROOT / "scripts" / script), *args])


def expand(b: list[float], dx: float, dy: float) -> list[float]:
    return [round(b[0] - dx, 5), round(b[1] - dy, 5), round(b[2] + dx, 5), round(b[3] + dy, 5)]


def plan(discovered: dict) -> list[dict]:
    """One entry per routable area: a city, or a zone of București."""
    areas = []
    for rank, city in enumerate(discovered["cities"], 1):
        base = {
            "city": city["id"],
            "name": city["name"],
            "counties": city["counties"],
            "rank": rank,
            "population": city["population"],
            "population_date": city["population_date"],
            "centre": city["centre"],
            "osm_boundary_relation": city["osm_boundary_relation"],
        }
        b = city["boundary_bounds"]
        if city["id"] != "bucuresti":
            areas.append({**base, "id": city["id"], "bounds": b})
            continue
        cols, rows = ZONE_GRID
        w, h = (b[2] - b[0]) / cols, (b[3] - b[1]) / rows
        for r in range(rows):
            for c in range(cols):
                cell = [b[0] + c * w, b[1] + r * h, b[0] + (c + 1) * w, b[1] + (r + 1) * h]
                areas.append(
                    {
                        **base,
                        "id": f"{city['id']}-{r * cols + c + 1}",
                        "zone": [r, c],
                        "bounds": expand(cell, ZONE_OVERLAP, ZONE_OVERLAP * 0.75),
                    }
                )
    return areas


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def unpack_tif(archive: Path, target: Path) -> Path:
    """CLMS returns a zip that can hold another zip; keep the first GeoTIFF."""
    import io
    import zipfile

    def walk(data: bytes) -> bytes | None:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            for name in z.namelist():
                if name.lower().endswith((".tif", ".tiff")):
                    return z.read(name)
            for name in z.namelist():
                if name.lower().endswith(".zip"):
                    found = walk(z.read(name))
                    if found:
                        return found
        return None

    data = walk(archive.read_bytes())
    if not data:
        raise RuntimeError(f"No GeoTIFF in {archive.name}")
    target.write_bytes(data)
    return target


def download(url: str, target: Path) -> None:
    # CLMS result links are temporary public files; curl handles their redirects.
    subprocess.run(
        ["curl", "-sSfL", "--max-time", "900", "-A", USER_AGENT, "-o", str(target), url],
        check=True,
    )


def ua2012_files(client) -> dict[str, dict]:
    import urllib.parse

    query = urllib.parse.urlencode(
        [("portal_type", "DataSet"), ("UID", UA2012), ("metadata_fields", "downloadable_files")]
    )
    item = client.call(f"@search?{query}", auth=False)["items"][0]
    files = {}
    for f in item["downloadable_files"]["items"]:
        if f.get("area") == "Romania":
            files[f["file"]] = f
    return files


def norm(text: str) -> str:
    import unicodedata

    text = unicodedata.normalize("NFKD", text.replace("Ǎ", "Ă").replace("ǎ", "ă"))
    return "".join(c for c in text if c.isalnum()).upper()


TASKS = RASTERS / "tasks.json"


def fetch_rasters(areas: list[dict], client, files2012: dict, use2021: bool, wait_s: float) -> None:
    """Submit every missing CLMS request first, then poll them together (2021 is slow)."""
    import time

    RASTERS.mkdir(parents=True, exist_ok=True)
    tasks = json.loads(TASKS.read_text()) if TASKS.exists() else {}
    wanted: dict[str, tuple[Path, callable]] = {}
    for a in areas:
        match = next(
            (f for f in files2012.values() if norm(f["urban area"]) == norm(a["name"])), None
        )
        if match and not (RASTERS / f"{a['city']}-2012.tif").exists():
            key = f"{a['city']}-2012"
            wanted[key] = (RASTERS / f"{key}.tif", lambda m=match: client.request_file(UA2012, m["@id"]))
        if use2021 and not (RASTERS / f"{a['id']}-2021.tif").exists():
            b = expand(a["bounds"], 0.01, 0.007)
            body = {"Datasets": [{
                "DatasetID": UA2021, "DatasetDownloadInformationID": UA2021_INFO,
                "OutputFormat": "Geotiff", "OutputGCS": "EPSG:3035",
                "BoundingBox": [b[3], b[2], b[1], b[0]],
            }]}
            key = f"{a['id']}-2021"
            wanted[key] = (
                RASTERS / f"{key}.tif",
                lambda body=body: client.call("@datarequest_post", body)["TaskIds"][0]["TaskID"],
            )
    for key, (_, submit) in wanted.items():
        if key not in tasks:
            tasks[key] = submit()
            TASKS.write_text(json.dumps(tasks, indent=1))
            print(f"requested {key}: task {tasks[key]}", flush=True)
    deadline = time.time() + wait_s
    pending = {k for k in wanted}
    while pending and time.time() < deadline:
        for key in sorted(pending):
            status = client.call(f"@datarequest_status_get?TaskID={tasks[key]}")
            state = status.get("Status")
            if state == "Finished_ok" and status.get("DownloadURL"):
                archive = RASTERS / f"{key}.zip"
                download(status["DownloadURL"], archive)
                unpack_tif(archive, wanted[key][0])
                pending.discard(key)
                print(f"downloaded {key}", flush=True)
            elif state not in ("In_progress", "Queued", "Created", None):
                print(f"CLMS {key} ended as {state}: {status.get('Message')}", flush=True)
                tasks.pop(key, None)
                pending.discard(key)
        TASKS.write_text(json.dumps(tasks, indent=1))
        if pending:
            time.sleep(30)
    if pending:
        print("still processing at CLMS (rerun later):", ", ".join(sorted(pending)), flush=True)


def heights(area: dict, files2012: dict) -> dict | None:
    """Prefer 2021 (newer) when it has values over the area; otherwise the 2012 city file."""
    import numpy as np
    import rasterio

    tif2021 = RASTERS / f"{area['id']}-2021.tif"
    if tif2021.exists():
        with rasterio.open(tif2021) as ds:
            img = ds.read(1)
            valid = (img >= 3) & (img <= 200)
            if ds.nodata is not None:
                valid &= img != ds.nodata
            if img.size and float(np.mean(valid)) > 0.002:
                return {"raster": tif2021, "year": 2021,
                        "source": "Copernicus Urban Atlas Building Block Height 2021 (raster 10 m) v1"}
    match = next(
        (f for f in files2012.values() if norm(f["urban area"]) == norm(area["name"])), None
    )
    tif2012 = RASTERS / f"{area['city']}-2012.tif"
    if not match or not tif2012.exists():
        return None
    code = match["file"].split("_")[0]
    return {"raster": tif2012, "year": 2012,
            "source": f"Copernicus Urban Atlas Building Block Height 2012 {code} {match['version']}"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pbf", type=Path)
    parser.add_argument("--only", default="")
    parser.add_argument("--skip-heights", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--with-2021", action="store_true",
                        help="also request 2021 heights (slow custom-area CLMS jobs)")
    parser.add_argument("--wait-minutes", type=float, default=30)
    args = parser.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    stem = args.pbf.name.removesuffix(".osm.pbf")
    discovered_path = CACHE / f"{stem}-discovered.json"
    if not discovered_path.exists():
        python("discover-cities.py", str(args.pbf), str(discovered_path), deps=("osmium==4.3.0",))
    discovered = json.loads(discovered_path.read_text())
    areas = [a for a in plan(discovered) if a["city"] not in LEGACY]
    only = {x for x in args.only.split(",") if x}
    todo = [a for a in areas if not only or a["city"] in only or a["id"] in only]

    # 1. Crop OSM (several areas per pass over the national PBF).
    pending = [
        a for a in todo
        if args.force or not (CACHE / stem / f"{a['id']}-osm.json").exists()
        and not (OUT / f"{a['id']}-city.json").exists()
    ]
    for i in range(0, len(pending), args.batch):
        batch = pending[i : i + args.batch]
        plan_path = CACHE / "extract-plan.json"
        plan_path.write_text(json.dumps(
            [{"id": a["id"], "bounds": expand(a["bounds"], *MARGIN)} for a in batch]
        ))
        python("extract-city.py", str(args.pbf), "--plan", str(plan_path), str(CACHE / stem),
               deps=("osmium==4.3.0",))

    # 2. Go importer and packaging.
    for a in todo:
        packed = OUT / f"{a['id']}-city.json"
        if packed.exists() and not args.force:
            continue
        dataset = CACHE / stem / a["id"] / "dataset.json"
        run(["go", "run", "./cmd/umbra", "prepare", "--extract", str(CACHE / stem / f"{a['id']}-osm.json"),
             "--area", ",".join(map(str, a["bounds"])), "--id", f"{a['id']}-city-v1",
             "--data", str(dataset)], cwd=ROOT / "server")
        run(["node", "scripts/prepare-city.mjs", str(dataset), "--id", a["id"], "--out", str(OUT),
             "--bounds", ",".join(map(str, a["bounds"]))], cwd=ROOT / "mobile")

    # 3. Copernicus building heights.
    if not args.skip_heights:
        from copernicus_clms import Client

        client = Client()
        files2012 = ua2012_files(client)
        fetch_rasters(todo, client, files2012, args.with_2021, args.wait_minutes * 60)
        for a in todo:
            target = OUT / f"{a['id']}-heights.json"
            meta = OUT / f"{a['id']}-heights-source.json"
            found = heights(a, files2012)
            if meta.exists() and not args.force:
                old = json.loads(meta.read_text())
                if not found or (old.get("available") and old.get("year") == found["year"]):
                    continue
            if not found:
                meta.write_text(json.dumps({"available": False}) + "\n")
                print(f"no Copernicus building height for {a['id']}", flush=True)
                continue
            output = python(
                "extract-copernicus-heights.py", str(found["raster"]), a["id"],
                "--city-file", str(OUT / f"{a['id']}-city.json"), "--out", str(target),
                "--source", found["source"], "--year", str(found["year"]),
                deps=("rasterio", "pyproj", "numpy"),
            )
            print(output, flush=True)
            meta.write_text(json.dumps({
                "available": True, "year": found["year"], "source": found["source"],
                "raster_sha256": sha256(found["raster"]), "log": output.strip().splitlines(),
            }, ensure_ascii=False) + "\n")

    write_index(discovered, plan(discovered))


def write_index(discovered: dict, areas: list[dict]) -> None:
    entries = []
    for a in areas:
        legacy = LEGACY.get(a["city"])
        if legacy:
            manifest = json.loads((OUT / legacy["manifest"]).read_text())
            heights_raw = json.loads((OUT / legacy["heights"]).read_text())
            entry = {
                "file": legacy["file"],
                "heights": legacy["heights"],
                "heights_source": heights_raw["source"],
                "heights_year": 2012,
                "heights_count": len(heights_raw["values"]),
                **({"canopy": legacy["canopy"]} if "canopy" in legacy else {}),
                "bounds": manifest["geographic_extract_bounds"],
            }
        else:
            path = OUT / f"{a['id']}-manifest.json"
            if not path.exists():
                continue
            manifest = json.loads(path.read_text())
            entry = {"file": f"{a['id']}-city.json", "bounds": a["bounds"]}
            meta_path = OUT / f"{a['id']}-heights-source.json"
            meta = json.loads(meta_path.read_text()) if meta_path.exists() else {"available": False}
            if meta.get("available"):
                values = json.loads((OUT / f"{a['id']}-heights.json").read_text())["values"]
                entry.update(
                    heights=f"{a['id']}-heights.json",
                    heights_source=meta["source"],
                    heights_year=meta["year"],
                    heights_count=len(values),
                )
        entries.append({
            "id": a["id"],
            "city": a["city"],
            "name": a["name"] + (f" · zona {a['id'].rsplit('-', 1)[1]}" if "zone" in a else ""),
            "counties": a["counties"],
            "rank": a["rank"],
            "population": a["population"],
            "population_date": a["population_date"],
            **({"zone": a["zone"]} if "zone" in a else {}),
            **entry,
            "osm_base_timestamp": manifest["osm_base_timestamp"],
            "nodes": manifest["nodes"],
            "directed_edges": manifest["directed_edges"],
            "buildings": manifest["buildings"],
            "bytes": manifest["bytes"],
            "raw_bytes": manifest["raw_bytes"],
            "sha256": manifest["sha256"],
        })
    index = {
        "schema_version": 1,
        "generated_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "osm_source": "https://download.geofabrik.de/europe/romania.html",
        "osm_base_timestamp": discovered["osm_base_timestamp"],
        "selection": "Romanian county seats (OSM admin_centre of ISO3166-2 RO-* counties), "
        "ordered by OSM population tags; shared seats counted once",
        "license": "ODbL-1.0 (OSM); Copernicus heights: " + LICENSE,
        "areas": entries,
    }
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n")
    write_coverage(index)
    print(f"index: {len(entries)} areas", flush=True)


def thousands(n: int) -> str:
    return f"{n:,}".replace(",", ".")


def write_coverage(index: dict) -> None:
    """Regenerate the coverage table in docs/cities.md between its markers."""
    doc = ROOT / "docs/cities.md"
    cities: dict[str, list[dict]] = {}
    for a in index["areas"]:
        cities.setdefault(a["city"], []).append(a)
    header = (
        "| # | City | County | Zones | OSM buildings | Walking nodes | "
        "Satellite estimates (untagged buildings) | OSM date | Packed size |"
    )
    rows = [header, "|---|---|---|---|---|---|---|---|---|"]
    total = {"areas": 0, "buildings": 0, "nodes": 0, "bytes": 0, "estimates": 0}
    for areas in sorted(cities.values(), key=lambda x: x[0]["rank"]):
        first = areas[0]
        years = sorted({a.get("heights_year") for a in areas if a.get("heights")})
        estimates = sum(a.get("heights_count", 0) for a in areas)
        source = (
            f"Copernicus {'/'.join(map(str, years))}: {thousands(estimates)}"
            if years
            else "none (OSM only)"
        )
        values = {
            "areas": len(areas),
            "buildings": sum(a["buildings"] for a in areas),
            "nodes": sum(a["nodes"] for a in areas),
            "bytes": sum(a["bytes"] for a in areas),
            "estimates": estimates,
        }
        for key, value in values.items():
            total[key] += value
        osm = ", ".join(sorted({a["osm_base_timestamp"][:10] for a in areas}))
        rows.append(
            f"| {first['rank']} | {first['name'].split(' · ')[0]} | "
            f"{', '.join(c.removeprefix('RO-') for c in first['counties'])} | {values['areas']} | "
            f"{thousands(values['buildings'])} | {thousands(values['nodes'])} | {source} | "
            f"{osm} | {values['bytes'] / 1e6:.1f} MB |"
        )
    rows.append(
        f"| | **Total: {len(cities)} cities** | | {total['areas']} | {thousands(total['buildings'])} | "
        f"{thousands(total['nodes'])} | {thousands(total['estimates'])} | | "
        f"{total['bytes'] / 1e6:.0f} MB |"
    )
    start, end = "<!-- coverage:start -->", "<!-- coverage:end -->"
    text = doc.read_text() if doc.exists() else f"{start}\n{end}\n"
    before, rest = text.split(start, 1)
    after = rest.split(end, 1)[1]
    doc.write_text(f"{before}{start}\n" + "\n".join(rows) + f"\n{end}{after}")
