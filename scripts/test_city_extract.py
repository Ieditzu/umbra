"""Run: uv run --python 3.12 --with osmium==4.3.0 python scripts/test_city_extract.py."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import osmium


class ExtractTests(unittest.TestCase):
    def test_original_references_multipolygon_holes_and_access_tags_survive(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "fixture.osm.pbf"
            output = Path(directory) / "fixture.json"
            header = osmium.io.Header()
            header.set("osmosis_replication_timestamp", "2026-10-25T00:00:00Z")
            with osmium.SimpleWriter(str(source), header=header) as writer:
                points = [
                    (28.60, 44.20),
                    (28.601, 44.20),
                    (28.601, 44.201),
                    (28.60, 44.201),
                    (28.6002, 44.2002),
                    (28.6008, 44.2002),
                    (28.6008, 44.2008),
                    (28.6002, 44.2008),
                ]
                for i, point in enumerate(points, 1):
                    writer.add_node(
                        osmium.osm.mutable.Node(
                            id=i,
                            location=point,
                            tags={"barrier": "gate", "foot": "no"} if i == 1 else {},
                        )
                    )
                writer.add_way(
                    osmium.osm.mutable.Way(
                        id=10,
                        nodes=[1, 2],
                        tags={"highway": "footway", "access": "private"},
                    )
                )
                writer.add_way(osmium.osm.mutable.Way(id=20, nodes=[1, 2, 3, 4, 1]))
                writer.add_way(osmium.osm.mutable.Way(id=21, nodes=[5, 6, 7, 8, 5]))
                writer.add_relation(
                    osmium.osm.mutable.Relation(
                        id=30,
                        members=[("w", 20, "outer"), ("w", 21, "inner")],
                        tags={
                            "type": "multipolygon",
                            "building": "yes",
                            "height": "12",
                        },
                    )
                )
            subprocess.run(
                [
                    sys.executable,
                    str(Path(__file__).with_name("extract-city.py")),
                    str(source),
                    str(output),
                ],
                check=True,
                capture_output=True,
            )
            data = json.loads(output.read_text())
            elements = {(e["type"], e["id"]): e for e in data["elements"]}
            self.assertEqual(
                data["osm3s"]["timestamp_osm_base"], "2026-10-25T00:00:00Z"
            )
            self.assertEqual(elements[("node", 1)]["tags"]["foot"], "no")
            self.assertEqual(elements[("way", 10)]["tags"]["access"], "private")
            self.assertEqual(elements[("way", 21)]["nodes"], [5, 6, 7, 8, 5])
            self.assertEqual(elements[("relation", 30)]["members"][1]["role"], "inner")
            self.assertEqual(len(data["source"]["sha256"]), 64)


if __name__ == "__main__":
    unittest.main()
