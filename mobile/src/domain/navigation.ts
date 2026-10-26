import { distanceBetween } from "./routes.ts";
import type { Coordinate, WalkingRoute } from "./routes.ts";

/** Nearest route position; the reported remainder excludes off-network entrance links. */
export function routeProgress(route: WalkingRoute, position: Coordinate) {
  let travelled = 0,
    bestAlong = 0,
    nearest = Infinity;
  for (const segment of route.segments) {
    for (let i = 1; i < segment.coordinates.length; i++) {
      const a = segment.coordinates[i - 1],
        b = segment.coordinates[i];
      const scale = Math.cos((a.latitude * Math.PI) / 180);
      const dx = (b.longitude - a.longitude) * scale,
        dy = b.latitude - a.latitude;
      const px = (position.longitude - a.longitude) * scale,
        py = position.latitude - a.latitude;
      const t =
        dx * dx + dy * dy > 0
          ? Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)))
          : 0;
      const point = {
        latitude: a.latitude + t * (b.latitude - a.latitude),
        longitude: a.longitude + t * (b.longitude - a.longitude),
      };
      const metres = distanceBetween(a, b),
        distance = distanceBetween(position, point);
      if (distance < nearest) {
        nearest = distance;
        bestAlong = travelled + t * metres;
      }
      travelled += metres;
    }
  }
  if (!travelled || !Number.isFinite(nearest)) return null;
  const remainingFraction = Math.max(0, Math.min(1, 1 - bestAlong / travelled));
  return {
    remainingMetres: route.distance_m * remainingFraction,
    remainingSeconds: route.duration_s * remainingFraction,
    distanceFromRoute: nearest,
  };
}
