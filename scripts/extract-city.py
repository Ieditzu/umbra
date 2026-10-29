"""Developer-only offline OSM PBF crop; app users need neither Python nor this source.

Single city (legacy):
    uv run --python 3.12 --with osmium==4.3.0 python -I scripts/extract-city.py \
        /path/romania.osm.pbf /path/city-osm.json [constanta|suceava]
Several cities in one pass over the PBF:
    uv run --python 3.12 --with osmium==4.3.0 python -I scripts/extract-city.py \
        /path/romania.osm.pbf --plan plan.json /path/output-dir
`plan.json` is a list of {"id": "...", "bounds": [west, south, east, north]}; each crop is
written to `<output-dir>/<id>-osm.json`. Bounds should already include the shadow margin.
The output keeps original OSM node/way/relation IDs, tags and complete way references.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import osmium

# Margin around the city extract, including the 500 m geometric shadow buffer.
LEGACY = {
    "constanta": (28.485, 44.065, 28.765, 44.365),
    "suceava": (26.07, 47.57, 26.43, 47.79),
}
NODE_KEYS = ("barrier", "access", "foot", "access:conditional", "foot:conditional")
WAY_KEYS = ("highway", "building", "building:part")


def is_building(tags: dict[str, str]) -> bool:
    return any(tags.get(key, "no") != "no" for key in ("building", "building:part"))


class BuildingMembers(osmium.SimpleHandler):
    """Relations come last in a PBF; collect their ways first so untagged rings survive."""

    def __init__(self) -> None:
        super().__init__()
        self.ways: set[int] = set()

    def relation(self, relation: osmium.osm.Relation) -> None:
        if is_building(dict(relation.tags)):
            self.ways.update(m.ref for m in relation.members if m.type == "w")


class CityExtract(osmium.SimpleHandler):
    def __init__(self, boxes: dict[str, tuple[float, float, float, float]], members: set[int]):
        super().__init__()
        self.boxes = boxes
        self.members = members
        self.coords: dict[int, tuple[float, float]] = {}
        self.node_tags: dict[int, dict[str, str]] = {}
        self.ways: dict[str, dict[int, dict]] = {key: {} for key in boxes}
        self.relations: dict[str, list[dict]] = {key: [] for key in boxes}

    def node(self, node: osmium.osm.Node) -> None:
        # Only nodes carrying access/barrier keys reach Python (see KeyFilter below).
        if node.location.valid() and any(
            w <= node.lon <= e and s <= node.lat <= n for w, s, e, n in self.boxes.values()
        ):
            self.node_tags[node.id] = dict(node.tags)

    def way(self, way: osmium.osm.Way) -> None:
        tags = dict(way.tags)
        if way.id not in self.members and not any(key in tags for key in WAY_KEYS):
            return
        refs = list(way.nodes)
        if not refs or not all(n.location.valid() for n in refs):
            return
        lons = [n.lon for n in refs]
        lats = [n.lat for n in refs]
        west, east, south, north = min(lons), max(lons), min(lats), max(lats)
        record = None
        for key, (w, s, e, n) in self.boxes.items():
            # A bounds intersection also catches long edges crossing the crop without
            # placing an endpoint inside it. Keep untagged rings for multipolygons.
            if east < w or west > e or north < s or south > n:
                continue
            if record is None:
                record = {"type": "way", "id": way.id, "nodes": [n.ref for n in refs], "tags": tags}
                for n in refs:
                    self.coords[n.ref] = (n.lat, n.lon)
            self.ways[key][way.id] = record

    def relation(self, relation: osmium.osm.Relation) -> None:
        tags = dict(relation.tags)
        if not is_building(tags):
            return
        members = [
            {
                "type": {"w": "way", "n": "node", "r": "relation"}[m.type],
                "ref": m.ref,
                "role": m.role,
            }
            for m in relation.members
        ]
        record = {"type": "relation", "id": relation.id, "tags": tags, "members": members}
        for key, ways in self.ways.items():
            if any(m["type"] == "way" and m["ref"] in ways for m in members):
                self.relations[key].append(record)


def extract(source: Path, boxes: dict[str, tuple[float, float, float, float]]) -> dict[str, dict]:
    reader = osmium.io.Reader(str(source))
    timestamp = reader.header().get("osmosis_replication_timestamp")
    reader.close()
    if not timestamp:
        raise ValueError("Source PBF does not identify its snapshot timestamp")
    members = BuildingMembers()
    members.apply_file(str(source))
    handler = CityExtract(boxes, members.ways)
    handler.apply_file(
        str(source),
        locations=True,
        idx="flex_mem",
        filters=[osmium.filter.KeyFilter(*NODE_KEYS).enable_for(osmium.osm.NODE)],
    )
    with source.open("rb") as handle:
        digest = hashlib.file_digest(handle, "sha256").hexdigest()
    results = {}
    for key in boxes:
        relations = handler.relations[key]
        needed = {m["ref"] for r in relations for m in r["members"] if m["type"] == "way"}
        ways = [
            w
            for w in handler.ways[key].values()
            if w["id"] in needed or any(k in w["tags"] for k in WAY_KEYS)
        ]
        nodes = sorted({n for w in ways for n in w["nodes"]})
        results[key] = {
            "osm3s": {"timestamp_osm_base": timestamp},
            "source": {
                "url": "https://download.geofabrik.de/europe/romania.html",
                "file": source.name,
                "sha256": digest,
            },
            "elements": [
                {
                    "type": "node",
                    "id": n,
                    "lat": handler.coords[n][0],
                    "lon": handler.coords[n][1],
                    "tags": handler.node_tags.get(n, {}),
                }
                for n in nodes
            ]
            + ways
            + relations,
        }
    return results


def write(target: Path, payload: dict) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    kinds = [e["type"] for e in payload["elements"]]
    print(
        json.dumps(
            {
                "snapshot": payload["osm3s"]["timestamp_osm_base"],
                "nodes": kinds.count("node"),
                "ways": kinds.count("way"),
                "building_relations": kinds.count("relation"),
                "output": str(target),
            }
        ),
        flush=True,
    )


def main() -> None:
    source = Path(sys.argv[1])
    if len(sys.argv) == 5 and sys.argv[2] == "--plan":
        plan = json.loads(Path(sys.argv[3]).read_text())
        boxes = {item["id"]: tuple(item["bounds"]) for item in plan}
        for key, payload in extract(source, boxes).items():
            write(Path(sys.argv[4]) / f"{key}-osm.json", payload)
        return
    city = sys.argv[3] if len(sys.argv) > 3 else "constanta"
    if city not in LEGACY:
        raise ValueError("Unknown city")
    write(Path(sys.argv[2]), extract(source, {city: LEGACY[city]})[city])


if __name__ == "__main__":
    main()
