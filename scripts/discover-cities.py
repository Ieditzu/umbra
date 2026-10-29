"""Discover Romanian county seats and their municipal boundaries from an OSM PBF.

Run: uv run --python 3.12 --with osmium==4.3.0 python -I scripts/discover-cities.py \
    /path/romania.osm.pbf /path/cities-osm.json

Counties are boundary relations tagged ISO3166-2=RO-*. Each county's admin_centre node is the
seat; seats shared by two counties (Ilfov lists București) are kept once. The municipal
boundary is the administrative relation that names the seat as admin_centre or label. Output
bounds are that boundary's bounding box, not a built-up-area polygon.
"""

from __future__ import annotations

import json
import sys
import unicodedata

import osmium


def slug(name: str) -> str:
    text = unicodedata.normalize("NFKD", name)
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    return "-".join("".join(c if c.isalnum() else " " for c in text).split())


class Relations(osmium.SimpleHandler):
    def __init__(self) -> None:
        super().__init__()
        self.counties: list[dict] = []
        self.boundaries: list[dict] = []

    def relation(self, r: osmium.osm.Relation) -> None:
        tags = dict(r.tags)
        if tags.get("boundary") != "administrative" or tags.get("type") != "boundary":
            return
        members = [(m.type, m.ref, m.role) for m in r.members]
        item = {
            "id": r.id,
            "tags": tags,
            "centres": [ref for t, ref, role in members if t == "n" and role in ("admin_centre", "label")],
            "ways": [ref for t, ref, role in members if t == "w" and role in ("outer", "")],
        }
        if tags.get("ISO3166-2", "").startswith("RO-") and tags.get("admin_level") == "4":
            self.counties.append(item)
        if tags.get("admin_level") in ("4", "6", "7", "8"):
            self.boundaries.append(item)


class Nodes(osmium.SimpleHandler):
    def __init__(self, ids: set[int]) -> None:
        super().__init__()
        self.ids = ids
        self.found: dict[int, dict] = {}

    def node(self, n: osmium.osm.Node) -> None:
        if n.id in self.ids:
            self.found[n.id] = {"tags": dict(n.tags), "lon": n.location.lon, "lat": n.location.lat}


class WayBounds(osmium.SimpleHandler):
    def __init__(self, ids: set[int]) -> None:
        super().__init__()
        self.ids = ids
        self.bounds: dict[int, tuple[float, float, float, float]] = {}

    def way(self, w: osmium.osm.Way) -> None:
        if w.id not in self.ids:
            return
        pts = [(n.lon, n.lat) for n in w.nodes if n.location.valid()]
        if pts:
            xs, ys = zip(*pts)
            self.bounds[w.id] = (min(xs), min(ys), max(xs), max(ys))


def population(tags: dict) -> int:
    try:
        return int(str(tags.get("population", "0")).replace(" ", "").replace(".", ""))
    except ValueError:
        return 0


def main() -> None:
    source, target = sys.argv[1:3]
    rels = Relations()
    rels.apply_file(source)
    seats: dict[int, list[str]] = {}
    for county in rels.counties:
        for ref in county["centres"][:1]:
            seats.setdefault(ref, []).append(county["tags"]["ISO3166-2"])
    nodes = Nodes(set(seats))
    nodes.apply_file(
        source, filters=[osmium.filter.IdFilter(list(seats)).enable_for(osmium.osm.NODE)]
    )
    picks = []
    for ref, codes in seats.items():
        node = nodes.found[ref]
        name = node["tags"].get("name", "")
        # The seat's own boundary, or same-named municipal boundaries checked by location
        # below (Covasna's seat node differs from the one its municipality lists).
        candidates = [
            b for b in rels.boundaries
            if (b["tags"].get("name") == name and ref in b["centres"])
            or (
                b["tags"].get("admin_level") == "8"
                and name in (b["tags"].get("name", "") + " " + b["tags"].get("name:ro", ""))
            )
        ]
        picks.append((ref, codes, node, name, candidates))
    ways = WayBounds({w for *_, cands in picks for b in cands for w in b["ways"]})
    ways.apply_file(
        source,
        locations=True,
        idx="flex_mem",
        filters=[osmium.filter.IdFilter(list(ways.ids)).enable_for(osmium.osm.WAY)],
    )

    def box(b: dict) -> list[float] | None:
        boxes = [ways.bounds[w] for w in b["ways"] if w in ways.bounds]
        if not boxes:
            return None
        return [
            round(min(x[0] for x in boxes), 5),
            round(min(x[1] for x in boxes), 5),
            round(max(x[2] for x in boxes), 5),
            round(max(x[3] for x in boxes), 5),
        ]

    cities = []
    for ref, codes, node, name, candidates in picks:
        found = []
        for b in candidates:
            bb = box(b)
            if bb and bb[0] <= node["lon"] <= bb[2] and bb[1] <= node["lat"] <= bb[3]:
                # Prefer an explicit centre link, then the municipal (most local) level.
                found.append((ref not in b["centres"], -int(b["tags"]["admin_level"]), b, bb))
        if not found:
            raise SystemExit(f"No municipal boundary for {name}")
        found.sort(key=lambda f: f[:2])
        boundary, bounds = found[0][2], found[0][3]
        cities.append(
            {
                "id": slug(name),
                "name": name,
                "counties": sorted(codes),
                "place": node["tags"].get("place"),
                "population": population(node["tags"]) or population(boundary["tags"]),
                "population_date": node["tags"].get("population:date")
                or boundary["tags"].get("population:date"),
                "centre": [round(node["lon"], 6), round(node["lat"], 6)],
                "osm_centre_node": ref,
                "osm_boundary_relation": boundary["id"],
                "boundary_admin_level": boundary["tags"]["admin_level"],
                "boundary_bounds": bounds,
            }
        )
    cities.sort(key=lambda c: (-c["population"], c["name"]))
    reader = osmium.io.Reader(source)
    timestamp = reader.header().get("osmosis_replication_timestamp")
    reader.close()
    with open(target, "w", encoding="utf-8") as file:
        json.dump({"osm_base_timestamp": timestamp, "cities": cities}, file, ensure_ascii=False, indent=1)
    for c in cities:
        print(c["population"], c["population_date"], c["id"], c["counties"], c["boundary_admin_level"], c["boundary_bounds"])


if __name__ == "__main__":
    main()
