import { bounds, project } from "./geometry.ts";
import type { Box, Point, Polygon } from "./geometry.ts";
import type { Coordinate } from "../domain/routes.ts";
import { BuildingIndex } from "./data.ts";
import type { Dataset } from "./data.ts";

export type RawTree = {
  id: string;
  start: Coordinate;
  end?: Coordinate;
  height?: string;
  crown?: string;
  cycle?: string;
  leafType?: string;
};
export type Tree = {
  id: string;
  geometry: Polygon;
  box: Box;
  height: number;
  base: number;
  evergreen: boolean;
  origin: "osm" | "satellite";
};

function measurement(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = Number(value?.trim().replace(/\s*m$/, ""));
  return Number.isFinite(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback;
}

/** A canopy is a simple cylinder; rows are approximate contiguous strips. */
export function makeTree(raw: RawTree): Tree | null {
  const a = project(raw.start),
    b = raw.end ? project(raw.end) : null;
  if (![a.x, a.y, ...(b ? [b.x, b.y] : [])].every(Number.isFinite)) return null;
  const height = measurement(raw.height, 8, 2, 60);
  const radius = measurement(raw.crown, 6, 1, 35) / 2;
  let ring: Point[];
  if (b && Math.hypot(b.x - a.x, b.y - a.y) > 0.1) {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const nx = (-(b.y - a.y) / length) * radius,
      ny = ((b.x - a.x) / length) * radius;
    ring = [
      { x: a.x + nx, y: a.y + ny },
      { x: b.x + nx, y: b.y + ny },
      { x: b.x - nx, y: b.y - ny },
      { x: a.x - nx, y: a.y - ny },
    ];
  } else {
    ring = Array.from({ length: 16 }, (_, i) => ({
      x: a.x + radius * Math.cos((i * Math.PI) / 8),
      y: a.y + radius * Math.sin((i * Math.PI) / 8),
    }));
  }
  ring.push({ ...ring[0] });
  return {
    id: raw.id,
    origin: "osm",
    geometry: [ring],
    box: bounds(ring),
    height,
    base: height * 0.4,
    evergreen:
      raw.cycle === "evergreen" ||
      (raw.cycle !== "deciduous" && raw.leafType === "needleleaved"),
  };
}

/** Missing leaf metadata is treated like a deciduous tree; winter foliage is omitted. */
export function treeHasFoliage(tree: Tree, at: number): boolean {
  const month = new Date(at).getUTCMonth();
  return tree.evergreen || (month >= 3 && month <= 9);
}
export function withTrees(data: Dataset, raw: RawTree[]): Dataset {
  const trees = raw.map(makeTree).filter((tree): tree is Tree => tree !== null);
  return {
    ...data,
    trees,
    treeIndex: new BuildingIndex<Tree>(trees, data.imported_m),
  };
}

/** Satellite polygons are modeled tree cover, never verified individual trees. */
export function withSatelliteCanopies(
  data: Dataset,
  records: unknown,
): Dataset {
  if (!Array.isArray(records) || records.length > 300000)
    throw new Error("Date satelitare invalide.");
  const trees = [...(data.trees ?? [])];
  for (const record of records) {
    if (
      !Array.isArray(record) ||
      typeof record[0] !== "string" ||
      !Number.isFinite(record[1]) ||
      record[1] < 3 ||
      record[1] > 60 ||
      !Array.isArray(record[2]) ||
      !record[2].length ||
      record[2].length > 64
    )
      continue;
    let count = 0;
    const geometry: Polygon = [];
    for (const rawRing of record[2]) {
      if (!Array.isArray(rawRing) || rawRing.length < 4) {
        count = 10000;
        break;
      }
      count += rawRing.length;
      if (
        count > 256 ||
        !rawRing.every(
          (p: unknown) =>
            Array.isArray(p) && p.length === 2 && p.every(Number.isFinite),
        )
      ) {
        count = 10000;
        break;
      }
      const ring = rawRing.map(([x, y]: number[]) => ({ x, y }));
      if (ring[0].x !== ring.at(-1)!.x || ring[0].y !== ring.at(-1)!.y) {
        count = 10000;
        break;
      }
      geometry.push(ring);
    }
    if (count > 256 || !geometry.length) continue;
    trees.push({
      id: record[0],
      geometry,
      box: bounds(geometry[0]),
      height: record[1],
      base: record[1] * 0.4,
      evergreen: false,
      origin: "satellite",
    });
  }
  return {
    ...data,
    trees,
    treeIndex: new BuildingIndex<Tree>(trees, data.imported_m),
  };
}
