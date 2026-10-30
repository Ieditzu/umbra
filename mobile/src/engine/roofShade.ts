import type { Building, Dataset } from "./data.ts";
import type { Coordinate } from "../domain/routes.ts";
import { contains, firstInteriorDistance, polygonContains, project, rad } from "./geometry.ts";
import { solarDirection } from "./solar.ts";
import type { Sun } from "./solar.ts";

/** Direct sunlight at one roof point; unknown heights remain uncertain. */
export function roofShade(data: Dataset, coordinate: Coordinate, roof: Building | undefined, sun: Sun): "blocked" | "uncertain" | "clear" {
  const point = project(coordinate);
  if (!roof || !roof.geometry.some((poly) => polygonContains(poly, point)) ||
      roof.height.source === "missing" || roof.height.source === "unsupported_elevated" || sun.elevation < 5)
    return "uncertain";
  const slope = Math.tan(rad(sun.elevation));
  const reach = Math.max(500, data.maxHeight / slope + 1);
  const direction = solarDirection(point, sun.azimuth);
  const end = { x: point.x + direction.x * reach, y: point.y + direction.y * reach };
  let uncertain = !contains(data.imported_m, end);
  for (const building of data.index.ray(point, end)) {
    if (building.id === roof.id) continue;
    for (const poly of building.geometry) {
      const distance = firstInteriorDistance(point, end, poly);
      if (distance === null) continue;
      if (building.height.source === "missing" || building.height.source === "unsupported_elevated") {
        uncertain = true;
        continue;
      }
      const height = distance * slope;
      if (height + roof.height.high_m < building.height.low_m) return "blocked";
      if (height + roof.height.low_m <= building.height.high_m) uncertain = true;
    }
  }
  return uncertain ? "uncertain" : "clear";
}
