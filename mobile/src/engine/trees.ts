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
