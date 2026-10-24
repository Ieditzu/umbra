"""Offline OSM extract parsing. No OSM service is called by route requests."""

from __future__ import annotations

import math
import os
from dataclasses import dataclass
from pathlib import Path

import networkx as nx
from defusedxml import ElementTree
from pyproj import Transformer
from shapely import LineString, Polygon, box, make_valid

PILOT = (28.630, 44.170, 28.640, 44.180)  # west, south, east, north
ATTRIBUTION = "© OpenStreetMap contributors · ODbL 1.0"
TO_METERS = Transformer.from_crs(4326, 32635, always_xy=True)
TO_GPS = Transformer.from_crs(32635, 4326, always_xy=True)
WALKABLE = {"footway", "pedestrian", "path", "steps", "living_street", "residential", "service", "unclassified", "tertiary", "secondary", "primary", "track"}


def data_path() -> Path:
    return Path(os.environ.get("UMBRA_ROUTE_DATA", str(Path(__file__).resolve().parents[3] / "umbra-route-data"))).resolve()


def height_m(tags: dict) -> tuple[float | None, bool]:
    try:
        if "height" in tags:
            raw = tags["height"].strip().lower()
            height = float(raw.removesuffix("m").strip())
            if 1 <= height <= 300:
                return height, False
        if "building:levels" in tags:
            levels = float(tags["building:levels"])
            if 0 < levels <= 70:
                return levels * 3.0, True
    except (ValueError, TypeError):
        pass
    return None, False


@dataclass
class Building:
    polygon: Polygon
    height: float | None
    estimated: bool
    osm_id: str


class Dataset:
    def __init__(self, path: Path, coverage=PILOT):
        self.path = path
        self.coverage = coverage
        self.coverage_polygon = box(*coverage)
        root = ElementTree.parse(path).getroot()
        bounds = root.find("bounds")
        self.bounds = tuple(float(bounds.attrib[key]) for key in ("minlon", "minlat", "maxlon", "maxlat")) if bounds is not None else coverage
        nodes = {int(node.attrib["id"]): (float(node.attrib["lon"]), float(node.attrib["lat"])) for node in root.findall("node")}
        blocked = set()
        for node in root.findall("node"):
            tags = {tag.attrib["k"]: tag.attrib["v"] for tag in node.findall("tag")}
            if tags.get("access") in {"no", "private"} or tags.get("foot") in {"no", "private"} or (tags.get("barrier") in {"wall", "fence", "locked_gate"} and tags.get("foot") not in {"yes", "designated", "permissive"}):
                blocked.add(int(node.attrib["id"]))
        self.graph = nx.Graph()
        self.buildings: list[Building] = []
        self.relation_warning = bool(root.findall("relation"))
        for way in root.findall("way"):
            tags = {tag.attrib["k"]: tag.attrib["v"] for tag in way.findall("tag")}
            refs = [int(nd.attrib["ref"]) for nd in way.findall("nd")]
            if not refs or any(ref not in nodes for ref in refs):
                continue
            coordinates = [TO_METERS.transform(*nodes[ref]) for ref in refs]
            if "building" in tags or "building:part" in tags:
                if len(refs) >= 4 and refs[0] == refs[-1]:
                    polygon = make_valid(Polygon(coordinates))
                    height, estimated = height_m(tags)
                    for part in polygon.geoms if hasattr(polygon, "geoms") else [polygon]:
                        if isinstance(part, Polygon) and part.area > 2:
                            self.buildings.append(Building(part, height, estimated, way.attrib["id"]))
                continue
            highway = tags.get("highway")
            foot = tags.get("foot")
            if highway not in WALKABLE or foot in {"no", "private", "use_sidepath"} or tags.get("area") == "yes":
                continue
            if tags.get("access") in {"no", "private"} and foot not in {"yes", "designated", "permissive"}:
                continue
            if tags.get("construction") or tags.get("proposed") or tags.get("indoor") == "yes":
                continue
            if highway in {"primary", "secondary", "tertiary"} and tags.get("sidewalk") in {"no", "none"} and foot not in {"yes", "designated"}:
                continue
            explicit = highway in {"footway", "pedestrian", "path", "steps"}
            surface = "explicit" if explicit else "street_axis"
            for a, b, pa, pb in zip(refs, refs[1:], coordinates, coordinates[1:]):
                if a in blocked or b in blocked or a == b:
                    continue
                geometry = LineString([pa, pb])
                if geometry.length < 0.2:
                    continue
                self.graph.add_node(a, xy=pa, gps=nodes[a])
                self.graph.add_node(b, xy=pb, gps=nodes[b])
                if not self.graph.has_edge(a, b) or self.graph[a][b]["length"] > geometry.length:
                    self.graph.add_edge(a, b, length=geometry.length, geometry=geometry, surface=surface,
                                        way=way.attrib["id"], name=tags.get("name", ""))
        # Never create connections at geometric crossings unless OSM shares a node.
        # Multipolygon building relations are conservatively unavailable for now.
        self.node_ids = list(self.graph)
        self.node_xy = [self.graph.nodes[node]["xy"] for node in self.node_ids]
        if not self.node_ids:
            raise ValueError("Extractul nu conține o rețea pietonală utilizabilă")

    def snap(self, latitude: float, longitude: float) -> tuple[int, float]:
        from shapely import Point
        if not self.coverage_polygon.covers(Point(longitude, latitude)):
            raise ValueError("Punctul este în afara zonei pilot acoperite")
        x, y = TO_METERS.transform(longitude, latitude)
        nearest = min(range(len(self.node_ids)), key=lambda index: math.dist((x, y), self.node_xy[index]))
        distance = math.dist((x, y), self.node_xy[nearest])
        if distance > 120:
            raise ValueError("Punctul este prea departe de rețeaua pietonală verificabilă")
        return self.node_ids[nearest], distance
