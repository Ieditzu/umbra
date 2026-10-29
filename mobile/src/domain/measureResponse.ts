import { isCoordinate } from "./routes.ts";
import type { MeasureTarget } from "../engine/measureTarget.ts";
import { BUILDING_ID } from "./measurements.ts";

const SOURCES = [
  "osm_height_tag",
  "estimated_from_levels",
  "copernicus_2012",
  "copernicus_2021",
  "missing",
  "unsupported_elevated",
  "measured_shadow",
];
const finite = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

/** Validate the server's building lookup before it drives the measuring ruler. */
export function parseMeasureTarget(raw: unknown): MeasureTarget | null {
  const value = raw as { building?: MeasureTarget | null };
  if (!value || typeof value !== "object" || !("building" in value))
    throw Error("Răspuns invalid pentru clădire.");
  const b = value.building;
  if (b === null) return null;
  if (
    !b ||
    typeof b.id !== "string" ||
    b.id.length > 80 ||
    typeof b.measurable !== "boolean" ||
    (b.measurable && !BUILDING_ID.test(b.id)) ||
    !["", "elevated", "not_osm"].includes(b.reason) ||
    !Array.isArray(b.footprint) ||
    b.footprint.length < 4 ||
    b.footprint.length > 1100 ||
    !b.footprint.every(isCoordinate) ||
    !b.height ||
    !SOURCES.includes(b.height.source) ||
    !finite(b.height.low_m, 0, 1000) ||
    !finite(b.height.high_m, 0, 1000) ||
    !(b.levels === null || finite(b.levels, 1, 150)) ||
    !finite(b.expected_height_m, 0.1, 1000) ||
    !b.sun ||
    !finite(b.sun.elevation, -90, 90) ||
    !finite(b.sun.azimuth, 0, 360) ||
    !Array.isArray(b.corners) ||
    b.corners.length > 16 ||
    !b.corners.every(
      (c) =>
        c &&
        Number.isInteger(c.index) &&
        c.index >= 0 &&
        c.index < b.footprint.length &&
        isCoordinate(c.coordinate) &&
        (c.clear === null || typeof c.clear === "boolean"),
    )
  )
    throw Error("Clădire invalidă pentru măsurare.");
  const s = b.shared;
  if (
    s !== undefined &&
    s !== null &&
    (typeof s !== "object" ||
      s.osm_building !== b.id ||
      !Number.isInteger(s.count) ||
      s.count < 0 ||
      typeof s.confirmed !== "boolean" ||
      !Array.isArray(s.methods) ||
      !(s.height_m === null || finite(s.height_m, 0, 1000)) ||
      !(s.sigma_m === null || finite(s.sigma_m, 0, 1000)))
  )
    throw Error("Rezumat comun invalid.");
  return b;
}
