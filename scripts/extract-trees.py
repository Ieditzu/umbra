"""Extract mapped OSM trees for Umbra from a dated Geofabrik Romania PBF.

uv run --python 3.12 --with osmium==4.3.0 python scripts/extract-trees.py source.osm.pbf mobile/assets/data/romania-trees.json
The compact derived snapshot contains no raw OSM extract; IDs and source date are retained.
"""
from __future__ import annotations

import gzip
import base64
import hashlib
import json
import sys
from pathlib import Path

import osmium


class Trees(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.trees = []
        self.rows = []

    @staticmethod
    def attributes(tags):
        return [tags.get("height", ""), tags.get("diameter_crown", ""),
                tags.get("leaf_cycle", ""), tags.get("leaf_type", "")]

    def node(self, node):
        if node.tags.get("natural") == "tree" and node.location.valid():
            self.trees.append([node.id, round(node.lon, 7), round(node.lat, 7),
                               *self.attributes(node.tags)])

    def way(self, way):
        if way.tags.get("natural") != "tree_row":
            return
        points = [[round(n.lon, 7), round(n.lat, 7)] for n in way.nodes if n.location.valid()]
        if len(points) >= 2 and len(points) <= 10000:
            self.rows.append([way.id, points, *self.attributes(way.tags)])


def main():
    source, target = map(Path, sys.argv[1:3])
    reader = osmium.io.Reader(str(source))
    timestamp = reader.header().get("osmosis_replication_timestamp")
    reader.close()
    if not timestamp:
        raise ValueError("The source must have an OSM snapshot timestamp")
    handler = Trees()
    handler.apply_file(str(source), locations=True, idx="flex_mem")
    with source.open("rb") as handle:
        digest = hashlib.file_digest(handle, "sha256").hexdigest()
    raw = json.dumps({"schema_version": 1, "timestamp": timestamp, "source_sha256": digest,
                      "trees": handler.trees, "rows": handler.rows},
                     separators=(",", ":"), ensure_ascii=True).encode()
    packed = {"format": "umbra-gzip-json-v1", "raw_bytes": len(raw),
              "payload": base64.b64encode(gzip.compress(raw, compresslevel=9, mtime=0)).decode()}
    target.write_text(json.dumps(packed, separators=(",", ":")), encoding="utf8")
    print(f"{len(handler.trees)} trees, {len(handler.rows)} rows, {len(raw)} raw bytes, {target.stat().st_size} packed bytes; OSM {timestamp}")


if __name__ == "__main__":
    main()
