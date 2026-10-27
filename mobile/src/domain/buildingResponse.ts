import { isCoordinate } from "./routes.ts";
import type { BuildingFeatures } from "../engine/buildings.ts";
export function parseBuildingFeatures(raw: unknown): BuildingFeatures {
  const value = raw as BuildingFeatures;
  if (
    !value ||
    value.type !== "FeatureCollection" ||
    !Array.isArray(value.features) ||
    value.features.length > 6000 ||
    typeof value.truncated !== "boolean"
  )
    throw Error("Geometrie de clădiri invalidă.");
  let vertices = 0;
  const ids = new Set<string>();
  for (const f of value.features) {
    if (
      f?.type !== "Feature" ||
      typeof f.id !== "string" ||
      !f.id ||
      ids.has(f.id) ||
      f.geometry?.type !== "Polygon" ||
      !Array.isArray(f.geometry.coordinates) ||
      !f.geometry.coordinates.length
    )
      throw Error("Clădire invalidă.");
    ids.add(f.id);
    const p = f.properties;
    if (
      !p ||
      ![p.height, p.display_height].every(
        (h) => Number.isFinite(h) && h >= 0 && h <= 1000,
      ) ||
      ![
        "missing",
        "unsupported_elevated",
        "osm_height_tag",
        "estimated_from_levels",
        "measured_shadow",
      ].includes(p.height_source)
    )
      throw Error("Înălțime de clădire invalidă.");
    for (const ring of f.geometry.coordinates) {
      if (!Array.isArray(ring) || ring.length < 4)
        throw Error("Contur de clădire invalid.");
      vertices += ring.length;
      if (vertices > 160000) throw Error("Prea multe puncte de clădiri.");
      for (const c of ring)
        if (
          !Array.isArray(c) ||
          c.length !== 2 ||
          !isCoordinate({ longitude: c[0], latitude: c[1] })
        )
          throw Error("Coordonate de clădiri invalide.");
      if (ring[0][0] !== ring.at(-1)![0] || ring[0][1] !== ring.at(-1)![1])
        throw Error("Contur de clădire deschis.");
    }
  }
  return value;
}
