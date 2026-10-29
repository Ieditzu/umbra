"""Developer-only offline OSM PBF crop; app users need neither Python nor this source.

Run with: uv run --python 3.12 --with osmium==4.3.0 python scripts/extract-city.py
    /path/romania.osm.pbf /path/city-osm.json
The output keeps original OSM node/way/relation IDs, tags and complete way references.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import osmium

# Margin around the city extract, including the 500 m geometric shadow buffer.
WEST, SOUTH, EAST, NORTH = 28.485, 44.065, 28.765, 44.365


class CityExtract(osmium.SimpleHandler):
    def __init__(self) -> None:
        super().__init__()
        self.nodes: dict[int, dict] = {}
        self.ways: dict[int, dict] = {}
        self.relations: list[dict] = []
        self.node_tags: dict[int, dict[str, str]] = {}

    def node(self, node: osmium.osm.Node) -> None:
        if (
            node.location.valid()
            and WEST <= node.lon <= EAST
            and SOUTH <= node.lat <= NORTH
        ):
            tags = dict(node.tags)
            if any(
                key in tags
                for key in (
                    "barrier",
                    "access",
                    "foot",
                    "access:conditional",
                    "foot:conditional",
                )
            ):
                self.node_tags[node.id] = tags

    def way(self, way: osmium.osm.Way) -> None:
        refs = list(way.nodes)
        if not refs or not all(n.location.valid() for n in refs):
            return
        # A bounds intersection also catches long edges crossing the crop without
        # placing an endpoint inside it. Keep untagged rings for multipolygons.
        west = min(n.lon for n in refs)
        east = max(n.lon for n in refs)
        south = min(n.lat for n in refs)
        north = max(n.lat for n in refs)
        if east < WEST or west > EAST or north < SOUTH or south > NORTH:
            return
        self.ways[way.id] = {
            "type": "way",
            "id": way.id,
            "nodes": [n.ref for n in refs],
            "tags": dict(way.tags),
        }
        for n in refs:
            self.nodes[n.ref] = {
                "type": "node",
                "id": n.ref,
                "lat": n.lat,
                "lon": n.lon,
                "tags": self.node_tags.get(n.ref, {}),
            }

    def relation(self, relation: osmium.osm.Relation) -> None:
        tags = dict(relation.tags)
        if not any(
            tags.get(key, "no") != "no" for key in ("building", "building:part")
        ):
            return
        members = [
            {
                "type": {"w": "way", "n": "node", "r": "relation"}[m.type],
                "ref": m.ref,
                "role": m.role,
            }
            for m in relation.members
        ]
        if any(m["type"] == "way" and m["ref"] in self.ways for m in members):
            self.relations.append(
                {
                    "type": "relation",
                    "id": relation.id,
                    "tags": tags,
                    "members": members,
                }
            )


def main() -> None:
    global WEST, SOUTH, EAST, NORTH
    if len(sys.argv) > 3 and sys.argv[3] not in ("suceava", "constanta"):
        raise ValueError("Unknown city")
    if len(sys.argv) > 3 and sys.argv[3] == "suceava":
        WEST, SOUTH, EAST, NORTH = 26.07, 47.57, 26.43, 47.79
    source, target = map(Path, sys.argv[1:3])
    reader = osmium.io.Reader(str(source))
    timestamp = reader.header().get("osmosis_replication_timestamp")
    reader.close()
    if not timestamp:
        raise ValueError("Source PBF does not identify its snapshot timestamp")
    handler = CityExtract()
    handler.apply_file(str(source), locations=True, idx="flex_mem")
    needed = {
        m["ref"] for r in handler.relations for m in r["members"] if m["type"] == "way"
    }
    ways = [
        w
        for w in handler.ways.values()
        if w["id"] in needed
        or any(key in w["tags"] for key in ("highway", "building", "building:part"))
    ]
    nodes = {n for w in ways for n in w["nodes"]}
    with source.open("rb") as handle:
        digest = hashlib.file_digest(handle, "sha256").hexdigest()
    payload = {
        "osm3s": {"timestamp_osm_base": timestamp},
        "source": {
            "url": "https://download.geofabrik.de/europe/romania.html",
            "file": source.name,
            "sha256": digest,
        },
        "elements": [handler.nodes[n] for n in sorted(nodes)]
        + ways
        + handler.relations,
    }
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(
        json.dumps(
            {
                "snapshot": timestamp,
                "nodes": len(nodes),
                "ways": len(ways),
                "building_relations": len(handler.relations),
                "output": str(target),
            }
        )
    )


if __name__ == "__main__":
    main()
