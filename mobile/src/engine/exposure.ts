import { bounds, firstInteriorDistance, rad, unproject } from "./geometry.ts";
import type { Point } from "./geometry.ts";
import type { Dataset } from "./data.ts";
import type { Exposure } from "../domain/routes.ts";
import { solarDirection, solarPosition } from "./solar.ts";
import type { Sun } from "./solar.ts";

export type ExposureResult = { exposure: Exposure; reason: string };
export function classifyAt(
  data: Dataset,
  p: Point,
  sun: Sun,
  positionKnown: boolean,
): ExposureResult {
  if (sun.elevation < -0.833) return { exposure: "unknown", reason: "night" };
  if (sun.elevation < 5) return { exposure: "unknown", reason: "low_sun" };
  if (!positionKnown)
    return { exposure: "unknown", reason: "road_or_grade_position" };
  const v = solarDirection(p, sun.azimuth),
    length =
      Math.hypot(
        data.imported_m.east - data.imported_m.west,
        data.imported_m.north - data.imported_m.south,
      ) * 2;
  const end = { x: p.x + v.x * length, y: p.y + v.y * length },
    slope = Math.tan(rad(sun.elevation));
  let uncertain = false;
  for (const building of data.index.query(bounds([p, end])))
    for (const poly of building.geometry) {
      const entry = firstInteriorDistance(p, end, poly);
      if (entry === null) continue;
      if (
        building.height.source === "missing" ||
        building.height.source === "unsupported_elevated"
      ) {
        uncertain = true;
        continue;
      }
      const rayHeight = entry * slope;
      if (rayHeight + 1e-4 < building.height.low_m)
        return { exposure: "shade", reason: building.height.source };
      if (rayHeight <= building.height.high_m + 1e-4) uncertain = true;
    }
  // This bundled OSM pilot has no independent obstruction-completeness audit.
  // Absence of a modeled shadow is never automatically reported as direct sun.
  return {
    exposure: "unknown",
    reason: uncertain ? "height_uncertainty" : "inventory_not_audited",
  };
}
export const exposureAt = (
  data: Dataset,
  p: Point,
  at: number,
  known: boolean,
) => classifyAt(data, p, solarPosition(at, unproject(p)), known);
