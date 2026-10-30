import { isCoordinate } from "./routes.ts";
import type { Coordinate } from "./routes.ts";

export type Bounds = [number, number, number, number];

/** Detailed geometry is useful only at neighborhood scale. */
export function detailedViewport(bounds: Bounds): boolean {
  return bounds[2] - bounds[0] <= 0.12 && bounds[3] - bounds[1] <= 0.12;
}
export type TreeModel = { center: [number, number]; radius: number; height: number; seed: number };
/** Limit expensive shadow geometry to the visible area around the map focus. */
export function shadowViewport(bounds: Bounds, focus?: Coordinate): Bounds {
  const half = 0.06;
  const longitude = Math.max(bounds[0], Math.min(bounds[2], focus?.longitude ?? (bounds[0] + bounds[2]) / 2));
  const latitude = Math.max(bounds[1], Math.min(bounds[3], focus?.latitude ?? (bounds[1] + bounds[3]) / 2));
  return [Math.max(bounds[0], longitude - half), Math.max(bounds[1], latitude - half), Math.min(bounds[2], longitude + half), Math.min(bounds[3], latitude + half)];
}
export type ShadowPolygon = {
  id: string;
  source:
    | "osm_height"
    | "levels_estimate"
    | "display_estimate"
    | "tree_canopy"
    | "tree_estimate"
    | "satellite_canopy"
    | "satellite_estimate"
    | "measured"
    | "unknown";
  canopyHeight?: number;
  canopyBase?: number;
  models?: TreeModel[];
  coordinates: Coordinate[];
  holes: Coordinate[][];
};
export type ShadowLayer = {
  at: string;
  state: "available" | "low_sun" | "night";
  polygons: ShadowPolygon[];
  attribution: string[];
  warnings: string[];
  truncated: boolean;
  partialCoverage: boolean;
  sun?: { elevation: number; azimuth: number; location: Coordinate };
};

/** Show canopy models independently from daylight-shadow display controls. */
export function mapShadowVisibility(
  layer: ShadowLayer | null,
  showShadows: boolean,
  showEstimates: boolean,
  showModels: boolean,
): ShadowLayer | null {
  if (!layer) return null;
  return {
    ...layer,
    polygons: layer.polygons.filter((p) => {
      if (p.source === "tree_canopy" || p.source === "satellite_canopy")
        return showModels || (showShadows && showEstimates);
      if (!showShadows) return false;
      if (
        !showEstimates &&
        ["display_estimate", "tree_estimate", "satellite_estimate"].includes(
          p.source,
        )
      )
        return false;
      return true;
    }),
  };
}

/** Keep overlapping geometry during a viewport refresh, never for another instant. */
export function visibleShadowLayer(
  snapshot: { layer: ShadowLayer | null; bounds: Bounds | null },
  at: string,
  bounds: Bounds,
  enabled: boolean,
  foreground: boolean,
): ShadowLayer | null {
  if (
    !enabled ||
    !foreground ||
    !snapshot.layer ||
    !snapshot.bounds ||
    snapshot.layer.at !== at
  )
    return null;
  const [w, s, e, n] = snapshot.bounds;
  return w < bounds[2] && e > bounds[0] && s < bounds[3] && n > bounds[1]
    ? snapshot.layer
    : null;
}
export function shadowInstant(selected: Date | null, now: number): string {
  return selected
    ? selected.toISOString()
    : new Date(Math.floor(now / 60000) * 60000).toISOString();
}
export function parseShadowLayer(raw: unknown, instant: string): ShadowLayer {
  const data = raw as Record<string, unknown>;
  if (
    !data ||
    data.type !== "FeatureCollection" ||
    typeof data.at !== "string" ||
    Date.parse(data.at) !== Date.parse(instant) ||
    !["available", "night", "low_sun"].includes(data.state as string) ||
    !Array.isArray(data.features) ||
    data.features.length > 2000
  )
    throw new Error("Strat de umbre invalid.");
  let totalPoints = 0;
  const polygons = data.features.map((rawFeature, index) => {
    const feature = rawFeature as {
      geometry?: { type?: string; coordinates?: unknown };
      properties?: {
        height_source?: string;
        building_id?: string;
        canopy_height?: number;
        canopy_base?: number;
        models?: unknown;
      };
    };
    const geometry = feature?.geometry;
    const source = feature?.properties?.height_source;
    if (
      !geometry ||
      geometry.type !== "Polygon" ||
      ![
        "osm_height",
        "levels_estimate",
        "display_estimate",
        "tree_canopy",
        "tree_estimate",
        "satellite_canopy",
        "satellite_estimate",
        "measured",
        "unknown",
      ].includes(source ?? "") ||
      !Array.isArray(geometry.coordinates) ||
      !geometry.coordinates.length
    )
      throw new Error("Geometrie de umbre invalidă.");
    const rings = geometry.coordinates.map((ring: unknown) => {
      if (!Array.isArray(ring) || ring.length < 4)
        throw new Error("Contur de umbră invalid.");
      totalPoints += ring.length;
      if (totalPoints > 60000)
        throw new Error("Prea multe puncte în stratul de umbre.");
      const points = ring.map((point: unknown) => {
        if (
          !Array.isArray(point) ||
          point.length !== 2 ||
          !isCoordinate({ longitude: point[0], latitude: point[1] })
        )
          throw new Error("Coordonate de umbre invalide.");
        return { longitude: point[0] as number, latitude: point[1] as number };
      });
      if (
        points[0].latitude !== points.at(-1)!.latitude ||
        points[0].longitude !== points.at(-1)!.longitude
      )
        throw new Error("Conturul nu este închis.");
      return points;
    });
    const canopyHeight = feature.properties?.canopy_height;
    const canopyBase = feature.properties?.canopy_base;
    if (
      (canopyHeight !== undefined || canopyBase !== undefined) &&
      (!Number.isFinite(canopyHeight) ||
        !Number.isFinite(canopyBase) ||
        canopyHeight! <= 0 ||
        canopyHeight! > 60 ||
        canopyBase! < 0 ||
        canopyBase! > canopyHeight!)
    )
      throw new Error("Înălțime de coroană invalidă.");
    const models = feature.properties?.models;
    if (models !== undefined && (
      !["tree_canopy", "satellite_canopy"].includes(source ?? "") ||
      !Array.isArray(models) || models.length > 64 ||
      !models.every((model: TreeModel) =>
        model && Array.isArray(model.center) && model.center.length === 2 &&
        isCoordinate({ longitude: model.center[0], latitude: model.center[1] }) &&
        Number.isFinite(model.radius) && model.radius > 0 && model.radius <= 7 &&
        Number.isFinite(model.height) && model.height > 0 && model.height <= 35 &&
        Number.isFinite(model.seed) && model.seed >= 0 && model.seed < 1)
    )) throw new Error("Modele de copaci invalide.");
    return {
      ...(models !== undefined ? { models: models as TreeModel[] } : {}),
      canopyHeight,
      canopyBase,
      id:
        source === "tree_canopy" || source === "satellite_canopy"
          ? (feature.properties?.building_id ?? `canopy-${index}`)
          : `${feature.properties?.building_id ?? "building"}-${index}`,
      source: source as ShadowPolygon["source"],
      coordinates: rings[0],
      holes: rings.slice(1),
    };
  });
  if (
    !Array.isArray(data.attribution) ||
    !data.attribution.length ||
    !data.attribution.every((item) => typeof item === "string") ||
    !Array.isArray(data.warnings) ||
    !data.warnings.every((item) => typeof item === "string")
  )
    throw new Error("Lipsește sursa umbrelor.");
  const sun = data.sun as ShadowLayer["sun"];
  if (
    sun &&
    (!Number.isFinite(sun.elevation) ||
      sun.elevation < -90 ||
      sun.elevation > 90 ||
      !Number.isFinite(sun.azimuth) ||
      sun.azimuth < 0 ||
      sun.azimuth >= 360 ||
      !isCoordinate(sun.location))
  )
    throw new Error("Poziție solară invalidă.");
  return {
    at: data.at,
    state: data.state as ShadowLayer["state"],
    polygons,
    attribution: data.attribution as string[],
    warnings: data.warnings as string[],
    truncated: data.truncated === true,
    partialCoverage: data.partial_coverage === true,
    ...(sun ? { sun } : {}),
  };
}
