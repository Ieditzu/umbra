import type { Coordinate } from "../domain/routes.ts";
import { isCoordinate } from "../domain/routes.ts";
import type { Dataset, Height } from "./data.ts";
import {
  distance,
  firstInteriorDistance,
  polygonContains,
  project,
  unproject,
} from "./geometry.ts";
import type { Point, Polygon } from "./geometry.ts";
import {
  castingCorners,
  MIN_SUN_ELEVATION,
  shadowAxis,
  shadowLength,
} from "./shadowMeasure.ts";

export type MeasureCorner = {
  index: number;
  coordinate: Coordinate;
  /** null when the Sun is too low to predict where the tip falls. */
  clear: boolean | null;
};
export type MeasureTarget = {
  id: string;
  measurable: boolean;
  reason: "" | "elevated" | "not_osm";
  footprint: Coordinate[];
  height: Height;
  levels: number | null;
  expected_height_m: number;
  sun: { elevation: number; azimuth: number };
  corners: MeasureCorner[];
  /** Shared database summary, added by the HTTP layer when sharing is enabled on the server. */
  shared?: SharedSummary | null;
};
export type SharedSummary = {
  osm_building: string;
  height_m: number | null;
  sigma_m: number | null;
  low_m: number | null;
  high_m: number | null;
  count: number;
  methods: string[];
  confirmed: boolean;
  updated_at: string;
};
function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    len = dx * dx + dy * dy;
  const t = len
    ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len))
    : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function edgeDistance(poly: Polygon, p: Point) {
  let best = Infinity;
  for (const ring of poly)
    for (let i = 1; i < ring.length; i++)
      best = Math.min(best, segmentDistance(p, ring[i - 1], ring[i]));
  return best;
}
/** Building under a tap, with the roof corners whose shadow tip should land on open ground. */
export function inspectBuilding(
  data: Dataset,
  coordinate: Coordinate,
  at: number,
): MeasureTarget | null {
  if (!isCoordinate(coordinate) || !Number.isFinite(at)) return null;
  const p = project(coordinate),
    near = 8;
  let hit: { building: Dataset["buildings"][number]; poly: Polygon } | null =
      null,
    best = near;
  for (const building of data.index.query({
    west: p.x - near,
    south: p.y - near,
    east: p.x + near,
    north: p.y + near,
  }))
    for (const poly of building.geometry) {
      // A tap inside wins; otherwise accept the closest outline within a finger's width.
      const d = polygonContains(poly, p) ? 0 : edgeDistance(poly, p);
      if (d < best) {
        best = d;
        hit = { building, poly };
      }
    }
  if (!hit) return null;
  const { building, poly } = hit,
    ring = poly[0];
  const levels = Number(building.tags["building:levels"]);
  const render = Number(building.tags["umbra:render_height"]);
  const expected =
    building.height.low_m > 0
      ? (building.height.low_m + building.height.high_m) / 2
      : render > 0 && render <= 1000
        ? render
        : 15;
  const centre = ring.reduce(
    (s, q) => ({
      x: s.x + q.x / ring.length,
      y: s.y + q.y / ring.length,
    }),
    { x: 0, y: 0 },
  );
  const axis = shadowAxis(centre, at);
  const corners: MeasureCorner[] = castingCorners(ring, axis.direction, (q) =>
    polygonContains(poly, q),
  )
    .slice(0, 16)
    .map((index) => {
      const c = ring[index];
      if (axis.sun.elevation < MIN_SUN_ELEVATION)
        return { index, coordinate: unproject(c), clear: null };
      const u = shadowAxis(c, at).direction;
      const reach =
        Math.min(300, shadowLength(expected, axis.sun.elevation)) * 1.15;
      const start = { x: c.x + u.x * 0.5, y: c.y + u.y * 0.5 },
        end = { x: c.x + u.x * reach, y: c.y + u.y * reach };
      let clear = distance(start, end) > 0;
      for (const other of data.index.ray(start, end)) {
        if (!clear) break;
        for (const shape of other.geometry)
          if (firstInteriorDistance(start, end, shape) !== null) {
            clear = false;
            break;
          }
      }
      return { index, coordinate: unproject(c), clear };
    })
    .sort((a, b) => Number(b.clear === true) - Number(a.clear === true));
  const osm = /^(way|relation)\/\d{1,15}$/.test(building.id);
  const elevated = building.height.source === "unsupported_elevated";
  return {
    id: building.id,
    measurable: osm && !elevated,
    reason: !osm ? "not_osm" : elevated ? "elevated" : "",
    footprint: ring.map((q) => unproject(q)),
    height: building.height,
    levels:
      Number.isFinite(levels) && levels > 0 && levels <= 150 ? levels : null,
    expected_height_m: expected,
    sun: { elevation: axis.sun.elevation, azimuth: axis.sun.azimuth },
    corners,
  };
}
