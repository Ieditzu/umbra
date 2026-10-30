import type { Coordinate } from "./routes.ts";
import { project } from "../engine/geometry.ts";

/** Approximate module capacity from the horizontal OSM outline, not roof planes. */
export function solarRoof(footprint: Coordinate[]) {
  if (footprint.length < 3) return { area: 0, panels: 0, watts: 0 };
  const points = footprint.map(project);
  const origin = points[0];
  let twiceArea = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    twiceArea += (a.x - origin.x) * (b.y - origin.y) - (b.x - origin.x) * (a.y - origin.y);
  }
  const area = Math.abs(twiceArea) / 2;
  const panels = Math.floor((area * 0.5 + 0.0001) / 2);
  return { area, panels, watts: panels * 400 };
}
