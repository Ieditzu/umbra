import { bounds, contains, distance, length, intersects } from "./geometry.ts";
import type { Box, Point, Polygon } from "./geometry.ts";
import type { Task } from "./task.ts";
import type { Tree } from "./trees.ts";

export const ATTRIBUTION =
  "© OpenStreetMap contributors — ODbL 1.0 — https://www.openstreetmap.org/copyright";
export const COPERNICUS_ATTRIBUTION =
  "© European Union, Copernicus Land Monitoring Service 2022, European Environment Agency (EEA)";
export type Height = {
  low_m: number;
  high_m: number;
  source:
    | "osm_height_tag"
    | "estimated_from_levels"
    | "copernicus_2012"
    | "missing"
    | "unsupported_elevated"
    | "measured_shadow";
};
export type Building = {
  id: string;
  geometry: Polygon[];
  tags: Record<string, string>;
  height: Height;
  box: Box;
};
export type Edge = {
  from: number;
  to: number;
  way_id: number;
  geometry: Point[];
  highway: string;
  position_known: boolean;
  length: number;
};
export type RawDataset = {
  schema_version: number;
  crs: string;
  pilot_id: string;
  pilot_m: Box;
  imported_m: Box;
  nodes: { id: number; point: Point }[];
  edges: Omit<Edge, "length">[];
  buildings: Omit<Building, "box">[];
  metadata: Record<string, string>;
};
export type Dataset = Omit<RawDataset, "edges" | "buildings"> & {
  edges: Edge[];
  buildings: Building[];
  positions: Map<number, Point>;
  adjacency: Map<number, number[]>;
  index: BuildingIndex;
  maxHeight: number;
  maxDisplayHeight: number;
  trees?: Tree[];
  treeIndex?: BuildingIndex<Tree>;
};
function positive(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number(value.trim().replace(/\s*m$/, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
export function buildingHeight(tags: Record<string, string>): Height {
  if (
    positive(tags.min_height) ||
    positive(tags["building:min_level"]) ||
    tags.building === "roof"
  )
    return { low_m: 0, high_m: 0, source: "unsupported_elevated" };
  const height = positive(tags.height),
    levels = positive(tags["building:levels"]);
  if (height > 0 && height <= 1000)
    return { low_m: height, high_m: height, source: "osm_height_tag" };
  if (levels > 0 && levels <= 150)
    return {
      low_m: levels * 2.5,
      high_m: levels * 3.5 + 3,
      source: "estimated_from_levels",
    };
  return { low_m: 0, high_m: 0, source: "missing" };
}
const validPoint = (p: Point) =>
  p && Number.isFinite(p.x) && Number.isFinite(p.y);
const validBox = (b: Box) =>
  b &&
  [b.west, b.south, b.east, b.north].every(Number.isFinite) &&
  b.west < b.east &&
  b.south < b.north;

/** Uniform grid limits repeated building/ray work without an extra native module. */
export class BuildingIndex<T extends { box: Box } = Building> {
  private cells = new Map<string, number[]>();
  private buildings: T[];
  private area: Box;
  constructor(buildings: T[], area: Box) {
    this.buildings = buildings;
    this.area = area;
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i].box;
      this.eachCell(b, (key) => {
        const cell = this.cells.get(key) ?? [];
        cell.push(i);
        this.cells.set(key, cell);
      });
    }
  }
  private eachCell(b: Box, visit: (key: string) => void) {
    const w = Math.floor(Math.max(b.west, this.area.west) / 100),
      e = Math.floor(Math.min(b.east, this.area.east) / 100);
    const s = Math.floor(Math.max(b.south, this.area.south) / 100),
      n = Math.floor(Math.min(b.north, this.area.north) / 100);
    for (let x = w; x <= e; x++)
      for (let y = s; y <= n; y++) visit(`${x}:${y}`);
  }
  /** Same grid with replacement items; boxes must be unchanged and in the same order. */
  withItems(items: T[]): BuildingIndex<T> {
    if (items.length !== this.buildings.length)
      throw new Error("Index replacement must keep every building.");
    return Object.assign(
      Object.create(BuildingIndex.prototype) as BuildingIndex<T>,
      { cells: this.cells, area: this.area, buildings: items },
    );
  }
  query(box: Box): T[] {
    const ids = new Set<number>();
    this.eachCell(box, (key) => {
      for (const i of this.cells.get(key) ?? []) ids.add(i);
    });
    return [...ids]
      .map((i) => this.buildings[i])
      .filter((b) => intersects(box, b.box));
  }
  /** Walk only cells touched by the ray, not every cell of its large diagonal box. */
  ray(a: Point, b: Point): T[] {
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const count = Math.max(
      1,
      Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 45),
    );
    const ids = new Set<number>();
    // Query a narrow box around each short segment, including both sides of grid boundaries.
    for (let i = 0; i < count; i++) {
      const p = { x: a.x + (dx * i) / count, y: a.y + (dy * i) / count };
      const q = {
        x: a.x + (dx * (i + 1)) / count,
        y: a.y + (dy * (i + 1)) / count,
      };
      this.eachCell(
        {
          west: Math.min(p.x, q.x) - 0.001,
          south: Math.min(p.y, q.y) - 0.001,
          east: Math.max(p.x, q.x) + 0.001,
          north: Math.max(p.y, q.y) + 0.001,
        },
        (key) => {
          for (const id of this.cells.get(key) ?? []) ids.add(id);
        },
      );
    }
    return [...ids].map((id) => this.buildings[id]);
  }
}

export async function initializeDataset(
  raw: RawDataset,
  work: Task,
  options = { requireGraph: true },
): Promise<Dataset> {
  if (
    raw.schema_version !== 1 ||
    raw.crs !== "EPSG:32635" ||
    !validBox(raw.pilot_m) ||
    !validBox(raw.imported_m) ||
    (options.requireGraph && (!raw.nodes.length || !raw.edges.length)) ||
    raw.nodes.length > 150000 ||
    raw.edges.length > 400000 ||
    raw.buildings.length > 100000
  )
    throw new Error("Datele locale ale zonei nu sunt valide.");
  const positions = new Map<number, Point>(),
    adjacency = new Map<number, number[]>();
  for (const node of raw.nodes) {
    await work.checkpoint();
    if (
      !Number.isSafeInteger(node.id) ||
      positions.has(node.id) ||
      !validPoint(node.point) ||
      !contains(raw.pilot_m, node.point)
    )
      throw new Error("Nod pietonal local invalid.");
    positions.set(node.id, node.point);
  }
  const edges: Edge[] = [];
  for (const edge of raw.edges) {
    await work.checkpoint();
    const a = positions.get(edge.from),
      b = positions.get(edge.to);
    if (
      !a ||
      !b ||
      edge.geometry.length < 2 ||
      !edge.geometry.every(validPoint) ||
      distance(a, edge.geometry[0]) > 0.01 ||
      distance(b, edge.geometry.at(-1)!) > 0.01 ||
      typeof edge.position_known !== "boolean"
    )
      throw new Error("Traseu local deconectat.");
    const ln = length(edge.geometry);
    if (!(ln > 0) || !Number.isFinite(ln))
      throw new Error("Lungime de traseu invalidă.");
    const index = edges.push({ ...edge, length: ln }) - 1;
    const links = adjacency.get(edge.from) ?? [];
    links.push(index);
    adjacency.set(edge.from, links);
  }
  const buildings: Building[] = [];
  for (const building of raw.buildings) {
    await work.checkpoint();
    if (!building.geometry.length)
      throw new Error("Clădire locală fără contur.");
    for (const poly of building.geometry) {
      if (!poly.length) throw new Error("Poligon local invalid.");
      for (const ring of poly)
        if (
          ring.length < 4 ||
          !ring.every(validPoint) ||
          distance(ring[0], ring.at(-1)!) > 0.001
        )
          throw new Error("Contur local invalid.");
    }
    buildings.push({
      ...building,
      height: buildingHeight(building.tags),
      box: bounds(building.geometry.flatMap((poly) => poly[0])),
    });
  }
  work.check();
  return {
    ...raw,
    positions,
    adjacency,
    edges,
    buildings,
    maxHeight: buildings.reduce(
      (height, b) => Math.max(height, b.height.high_m),
      0,
    ),
    maxDisplayHeight: buildings.reduce(
      (height, b) =>
        Math.max(
          height,
          b.height.low_m,
          Number(b.tags["umbra:render_height"]) > 0 &&
            Number(b.tags["umbra:render_height"]) <= 1000
            ? Number(b.tags["umbra:render_height"])
            : 6,
        ),
      6,
    ),
    index: new BuildingIndex(buildings, raw.imported_m),
  };
}

export type MeasuredHeight = { id: string; low_m: number; high_m: number };
/** Old raster-derived heights are estimates; OSM and measured heights take priority. */
export function withCopernicusHeights(
  data: Dataset,
  values: Record<string, number>,
): Dataset {
  const buildings = data.buildings.map((b) => {
    const h = values[b.id];
    if (
      b.height.source !== "missing" ||
      !Number.isFinite(h) ||
      h < 3 ||
      h > 200
    )
      return b;
    // shortcut: the ±5/10 m envelope is heuristic; replace with validated local uncertainty.
    return {
      ...b,
      height: {
        low_m: Math.max(0, h - 5),
        high_m: h + 10,
        source: "copernicus_2012" as const,
      },
    };
  });
  return {
    ...data,
    buildings,
    metadata: { ...data.metadata, copernicus_heights: "2012" },
    index: data.index.withItems(buildings),
    maxHeight: buildings.reduce((h, b) => Math.max(h, b.height.high_m), 0),
  };
}
/** Request-scoped copy with confirmed shadow measurements; the shared dataset is not mutated. */
export function withMeasuredHeights(
  data: Dataset,
  measured: MeasuredHeight[] | undefined,
): Dataset {
  if (!measured?.length) return data;
  const byId = new Map(measured.map((m) => [m.id, m]));
  let changed = false;
  const buildings = data.buildings.map((b) => {
    const m = byId.get(b.id);
    // Elevated/roof-only parts have an unknown base; a ground shadow cannot measure them.
    if (!m || b.height.source === "unsupported_elevated") return b;
    changed = true;
    return {
      ...b,
      height: {
        low_m: m.low_m,
        high_m: m.high_m,
        source: "measured_shadow" as const,
      },
    };
  });
  if (!changed) return data;
  return {
    ...data,
    buildings,
    index: data.index.withItems(buildings),
    maxHeight: buildings.reduce((h, b) => Math.max(h, b.height.high_m), 0),
    maxDisplayHeight: buildings.reduce(
      (h, b) => Math.max(h, b.height.low_m),
      data.maxDisplayHeight,
    ),
  };
}
