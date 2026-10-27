import { headingCone } from "./heading.ts";
import type { DeviceHeading } from "./heading.ts";
import { isCoordinate } from "./routes.ts";
import type { Coordinate, WalkingRoute } from "./routes.ts";
import type { Bounds, ShadowLayer } from "./shadows.ts";

export type MapMessage =
  | { type: "ready" }
  | { type: "gesture" }
  | { type: "pick"; coordinate: Coordinate }
  | {
      type: "viewport";
      bounds: Bounds;
      pitch: number;
      zoom: number;
      center: Coordinate;
      bearing: number;
    }
  | { type: "error"; message: string };

export function parseMapMessage(text: string): MapMessage | null {
  if (text.length > 8000) return null;
  try {
    const m = JSON.parse(text);
    if (m.type === "ready" || m.type === "gesture") return { type: m.type };
    if (m.type === "pick" && isCoordinate(m.coordinate))
      return { type: "pick", coordinate: m.coordinate };
    if (m.type === "error" && typeof m.message === "string")
      return { type: "error", message: m.message.slice(0, 200) };
    if (
      m.type === "viewport" &&
      Array.isArray(m.bounds) &&
      m.bounds.length === 4 &&
      m.bounds.every(Number.isFinite) &&
      m.bounds[0] >= -180 &&
      m.bounds[2] <= 180 &&
      m.bounds[1] >= -85 &&
      m.bounds[3] <= 85 &&
      m.bounds[0] < m.bounds[2] &&
      m.bounds[1] < m.bounds[3] &&
      Number.isFinite(m.pitch) &&
      m.pitch >= 0 &&
      m.pitch <= 85 &&
      Number.isFinite(m.zoom) &&
      m.zoom >= 0 &&
      m.zoom <= 24 &&
      Number.isFinite(m.bearing) &&
      isCoordinate(m.center)
    )
      return m;
  } catch {
    /* Ignore malformed/unrecognized messages from the embedded renderer. */
  }
  return null;
}

const empty = () => ({ type: "FeatureCollection" as const, features: [] });
export function locationFeatures(
  fix: (Coordinate & { accuracy: number }) | null,
) {
  if (!fix) return empty();
  const latitude = (fix.latitude * Math.PI) / 180,
    longitude = (fix.longitude * Math.PI) / 180;
  const angular = Math.min(250, Math.max(0, fix.accuracy)) / 6378137;
  const ring: number[][] = [];
  for (let i = 0; i <= 32; i++) {
    const bearing = ((i % 32) * Math.PI) / 16;
    const lat = Math.asin(
      Math.sin(latitude) * Math.cos(angular) +
        Math.cos(latitude) * Math.sin(angular) * Math.cos(bearing),
    );
    const lon =
      longitude +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(latitude),
        Math.cos(angular) - Math.sin(latitude) * Math.sin(lat),
      );
    ring.push([(lon * 180) / Math.PI, (lat * 180) / Math.PI]);
  }
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [fix.longitude, fix.latitude] },
        properties: {},
      },
      {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [ring] },
        properties: {},
      },
    ],
  };
}
export function shadowFeatures(layer: ShadowLayer | null) {
  const features = (layer?.polygons ?? [])
    .filter((p) => p.source !== "unknown")
    .flatMap((p) => {
      const height = p.canopyHeight ?? 8,
        base = p.canopyBase ?? height * 0.4;
      const feature = {
        type: "Feature" as const,
        id: p.id,
        geometry: {
          type: "Polygon" as const,
          coordinates: [p.coordinates, ...p.holes].map((ring) =>
            ring.map((c) => [c.longitude, c.latitude]),
          ),
        },
        properties: {
          source: p.source as string,
          height,
          base,
          model_kind: p.id.startsWith("tree-")
            ? "individual"
            : p.id.startsWith("row-")
              ? "row"
              : "area",
        },
      };
      // Only mapped individual trees have a known trunk location; a canopy raster
      // or tree row does not locate an individual trunk.
      if (p.source !== "tree_canopy" || !p.id.startsWith("tree-"))
        return [feature];
      const ring = p.coordinates.slice(0, -1);
      const latitude =
        ring.reduce((sum, c) => sum + c.latitude, 0) / ring.length;
      const longitude =
        ring.reduce((sum, c) => sum + c.longitude, 0) / ring.length;
      const radiusLat = 0.4 / 111320,
        radiusLon = radiusLat / Math.cos((latitude * Math.PI) / 180);
      const trunk = Array.from({ length: 9 }, (_, i) => [
        longitude + radiusLon * Math.cos((i * Math.PI) / 4),
        latitude + radiusLat * Math.sin((i * Math.PI) / 4),
      ]);
      trunk[8] = trunk[0];
      return [
        feature,
        {
          type: "Feature" as const,
          id: `${p.id}-trunk`,
          geometry: { type: "Polygon" as const, coordinates: [trunk] },
          properties: { source: "tree_trunk", height: base, base: 0 },
        },
      ];
    });
  return { type: "FeatureCollection", sun: layer?.sun, features };
}

export function routeFeatures(route: WalkingRoute | null) {
  if (!route) return empty();
  return {
    type: "FeatureCollection",
    features: route.segments.map((s) => ({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: s.coordinates.map((c) => [c.longitude, c.latitude]),
      },
      properties: { exposure: s.exposure },
    })),
  };
}

export function headingFeatures(
  fix: Coordinate | null,
  heading: DeviceHeading | null,
) {
  if (!fix || !heading) return empty();
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [
            headingCone(fix, heading.degrees).map((p) => [
              p.longitude,
              p.latitude,
            ]),
          ],
        },
      },
    ],
  };
}
