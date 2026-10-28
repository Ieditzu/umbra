import { firstInteriorDistance, rad, unproject } from "./geometry.ts";
import type { Point } from "./geometry.ts";
import type { Dataset } from "./data.ts";
import type { Exposure } from "../domain/routes.ts";
import { solarDirection, solarPosition } from "./solar.ts";
import type { Sun } from "./solar.ts";
import { treeHasFoliage } from "./trees.ts";

export type ExposureResult = { exposure: Exposure; reason: string };
export function classifyAt(
  data: Dataset,
  p: Point,
  sun: Sun,
  positionKnown: boolean,
  at?: number,
): ExposureResult {
  if (sun.elevation < -0.833) return { exposure: "unknown", reason: "night" };
  if (sun.elevation < 5) return { exposure: "unknown", reason: "low_sun" };
  if (!positionKnown)
    return { exposure: "unknown", reason: "road_or_grade_position" };
  const v = solarDirection(p, sun.azimuth),
    slope = Math.tan(rad(sun.elevation)),
    length = Math.max(
      500,
      data.maxHeight / slope + 1,
      data.treeIndex ? 60 / slope + 1 : 0,
    );
  const end = { x: p.x + v.x * length, y: p.y + v.y * length };
  let uncertain = false,
    copernicusShade = false;
  // No known prism beyond this length can reach the ground point. Missing heights
  // beyond the corridor still leave exposure unknown because no inventory audit exists.
  for (const building of data.index.ray(p, end))
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
      if (rayHeight + 1e-4 < building.height.low_m) {
        if (building.height.source === "copernicus_2012") {
          copernicusShade = true;
          continue;
        }
        return { exposure: "shade", reason: building.height.source };
      }
      if (rayHeight <= building.height.high_m + 1e-4) uncertain = true;
    }
  if (copernicusShade)
    return { exposure: "estimated_shade", reason: "copernicus_2012" };
  if (at !== undefined && data.treeIndex) {
    for (const tree of data.treeIndex.ray(p, end)) {
      if (!treeHasFoliage(tree, at)) continue;
      const entry = firstInteriorDistance(p, end, tree.geometry);
      const reverse = firstInteriorDistance(end, p, tree.geometry);
      if (entry === null || reverse === null) continue;
      const exit = length - reverse;
      if (entry * slope < tree.height && exit * slope > tree.base)
        return {
          exposure: "estimated_shade",
          reason:
            tree.origin === "satellite"
              ? "estimated_satellite_canopy"
              : "estimated_tree_canopy",
        };
    }
  }
  // No mapped shade is not proof of direct sun: missing obstacles and clouds
  // still matter. Keep a separate, explicitly tentative display category.
  return uncertain
    ? { exposure: "unknown", reason: "height_uncertainty" }
    : { exposure: "unshaded_estimate", reason: "inventory_not_audited" };
}
export const exposureAt = (
  data: Dataset,
  p: Point,
  at: number,
  known: boolean,
) => classifyAt(data, p, solarPosition(at, unproject(p)), known, at);
