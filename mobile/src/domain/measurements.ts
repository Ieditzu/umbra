import {
  droneLength,
  heightFromShadow,
  METHOD_LENGTH_SIGMA,
  shadowAxis,
} from "../engine/shadowMeasure.ts";
import type { DronePhoto, MeasureMethod } from "../engine/shadowMeasure.ts";

// Shadow measurements and the shared rules (docs/shadow-heights.md §6.2–6.4).
// The phone and the shared heights server both evaluate submissions with this module.
export type MeasurementStatus = "accepted" | "rejected" | "needs_review";
export type Checklist = {
  /** Shadow tip falls on open ground, not on a car, tree, fence or another building. */
  clearGround: boolean;
  /** Direct sun with a sharp shadow edge. */
  sharpShadow: boolean;
  /** The marked tip belongs to the roof corner, not a lift room or stair tower. */
  roofCorner: boolean;
  /** Ground between the wall and the tip looks flat. */
  flatGround: boolean;
};
export type UploadState = "local" | "pending" | "sent" | "failed";
/** What the phone sends; the server recomputes everything else. */
export type Submission = {
  id: string;
  osm_building: string;
  method: MeasureMethod;
  /** EPSG:32635 metres; must be a vertex of the building footprint. */
  corner: { x: number; y: number };
  length_m: number;
  /** GPS only: sideways distance of the averaged fix from the ruler line. */
  lateral_m: number | null;
  /** GPS only: mean horizontal accuracy of the averaged fixes. */
  gps_accuracy_m: number | null;
  drone: DronePhoto | null;
  measured_at: string;
  checklist: Checklist;
  app_version: string;
  engine_version: string;
};
export type Measurement = Submission & {
  height_m: number;
  sigma_m: number;
  tip: { x: number; y: number };
  sun_elevation_deg: number;
  sun_azimuth_deg: number;
  status: MeasurementStatus;
  reason: string;
  /** OSM building:levels at measuring time, for the floor-count plausibility check. */
  levels: number | null;
  /** Initials or team label for the field study's observer agreement; stays on the phone. */
  observer: string;
  /** Anonymous install id; set only on the shared server. */
  contributor?: string;
  /** A moderator decided this status; plausibility checks no longer change it. */
  reviewed?: boolean;
  upload?: UploadState;
  /** Status the shared server gave this measurement. */
  server_status?: MeasurementStatus;
};
/** Independent reference height for the field study; never used for routing. */
export type ReferenceMethod =
  "laser_indirect" | "drone_altitude" | "floor_count";
export type Reference = {
  id: string;
  osm_building: string;
  method: ReferenceMethod;
  height_m: number;
  sigma_m: number;
  measured_at: string;
  note: string;
  observer: string;
};
export const ENGINE_VERSION = "shadow-measure-2";
export const MEASUREMENT_KEY = "umbra.measurements.v1";
export const REFERENCE_KEY = "umbra.references.v1";
export const MAX_MEASUREMENTS = 500;
/** Request-size bound: the compute server accepts at most this many measured heights. */
export const MAX_MEASURED_HEIGHTS = 200;
export const BUILDING_ID = /^(way|relation)\/\d{1,15}$/;
export const MEASUREMENT_ID = /^[a-z0-9-]{8,64}$/;
/** Methods precise enough to confirm a building on their own (§6.3 step 4). */
export const PRECISE_METHODS: MeasureMethod[] = ["tape_laser", "drone_nadir"];

export type MeasuredHeight = { id: string; low_m: number; high_m: number };

/** Status a single measurement gets from its own inputs (§6.3 step 1). */
export function initialStatus(
  checklist: Checklist,
  elevation: number,
  lateralOffset: number | null,
  lateralTolerance: number,
): { status: MeasurementStatus; reason: string } {
  if (elevation < 10) return { status: "rejected", reason: "low_sun" };
  if (!checklist.sharpShadow)
    return { status: "rejected", reason: "no_sharp_shadow" };
  if (!checklist.clearGround)
    return { status: "rejected", reason: "obstructed_tip" };
  if (!checklist.roofCorner)
    return { status: "rejected", reason: "rooftop_structure" };
  if (lateralOffset !== null && Math.abs(lateralOffset) > lateralTolerance)
    return { status: "rejected", reason: "off_ruler" };
  if (!checklist.flatGround) return { status: "needs_review", reason: "slope" };
  return { status: "accepted", reason: "" };
}
const finite = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const point = (v: unknown) =>
  !!v &&
  typeof v === "object" &&
  finite((v as { x: unknown }).x, 0, 1e7) &&
  finite((v as { y: unknown }).y, 0, 1e7);
const METHODS: MeasureMethod[] = ["phone_gps", "tape_laser", "drone_nadir"];
const checklistValid = (c: unknown) =>
  !!c &&
  typeof c === "object" &&
  ["clearGround", "sharpShadow", "roofCorner", "flatGround"].every(
    (k) => typeof (c as Record<string, unknown>)[k] === "boolean",
  );
/** Shape check shared by the phone store and the server's request validation. */
export function isSubmission(v: unknown): v is Submission {
  const s = v as Submission;
  return (
    !!s &&
    typeof s === "object" &&
    typeof s.id === "string" &&
    MEASUREMENT_ID.test(s.id) &&
    typeof s.osm_building === "string" &&
    BUILDING_ID.test(s.osm_building) &&
    METHODS.includes(s.method) &&
    point(s.corner) &&
    finite(s.length_m, 0, 5000) &&
    (s.lateral_m === null || finite(s.lateral_m, -5000, 5000)) &&
    (s.gps_accuracy_m === null || finite(s.gps_accuracy_m, 0, 1000)) &&
    (s.method !== "phone_gps" ||
      (s.lateral_m !== null && s.gps_accuracy_m !== null)) &&
    (s.drone === null ||
      (!!s.drone &&
        typeof s.drone === "object" &&
        ["altitude_m", "focal_mm", "sensor_mm", "image_px", "shadow_px"].every(
          (k) => finite((s.drone as Record<string, unknown>)[k], 0, 1e6),
        ))) &&
    (s.method !== "drone_nadir" || s.drone !== null) &&
    typeof s.measured_at === "string" &&
    Number.isFinite(Date.parse(s.measured_at)) &&
    checklistValid(s.checklist) &&
    typeof s.app_version === "string" &&
    s.app_version.length <= 32 &&
    typeof s.engine_version === "string" &&
    s.engine_version.length <= 32
  );
}
/**
 * Recompute height, uncertainty, tip and status from the raw inputs.
 * The server never trusts a submitted height: only the length, corner and time count.
 */
export function evaluateSubmission(
  s: Submission,
  levels: number | null,
): Omit<Measurement, "observer"> {
  const at = Date.parse(s.measured_at),
    axis = shadowAxis(s.corner, at);
  let length = s.length_m,
    instrument = METHOD_LENGTH_SIGMA[s.method];
  if (s.method === "drone_nadir") {
    const photo = droneLength(s.drone!);
    length = photo.length;
    instrument = photo.sigma;
  }
  if (s.method === "phone_gps") instrument = Math.max(3, s.gps_accuracy_m!);
  const elevation = axis.sun.elevation;
  const verdict = initialStatus(
    s.checklist,
    elevation,
    s.method === "phone_gps" ? s.lateral_m : null,
    Math.max(8, 1.5 * (s.gps_accuracy_m ?? 0)),
  );
  let height = 0,
    sigma = 0;
  if (elevation > 0 && length > 0) {
    const result = heightFromShadow(
      length,
      Math.min(89, elevation),
      instrument,
    );
    height = result.height;
    sigma = result.sigma;
  }
  const round = (v: number) => Math.round(v * 100) / 100;
  const invalid = !(height >= 0.1 && height <= 1000);
  return {
    ...s,
    length_m: round(length),
    height_m: invalid ? 0.1 : round(height),
    sigma_m: invalid ? 1000 : Math.max(0.01, round(sigma)),
    tip: {
      x: s.corner.x + axis.direction.x * length,
      y: s.corner.y + axis.direction.y * length,
    },
    sun_elevation_deg: elevation,
    sun_azimuth_deg: axis.sun.azimuth,
    levels,
    ...(invalid && verdict.status !== "rejected"
      ? { status: "rejected" as const, reason: "implausible_height" }
      : verdict),
  };
}
export type BuildingEstimate = {
  height: number;
  sigma: number;
  count: number;
  methods: MeasureMethod[];
  confirmed: boolean;
  /** Effective status per measurement id after comparing measurements. */
  statuses: Map<string, { status: MeasurementStatus; reason: string }>;
};
const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b),
    m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
/** Different people, or the same person at least 10 minutes later. */
function independent(a: Measurement, b: Measurement) {
  if (a.contributor && b.contributor && a.contributor !== b.contributor)
    return true;
  if (a.observer && b.observer && a.observer !== b.observer) return true;
  return (
    Math.abs(Date.parse(a.measured_at) - Date.parse(b.measured_at)) >= 600000
  );
}
/** Plausibility checks, inverse-variance mean and the confirmation rule (§6.3). */
export function combineMeasurements(
  list: Measurement[],
  levels: number | null = null,
): BuildingEstimate | null {
  const statuses = new Map<
    string,
    { status: MeasurementStatus; reason: string }
  >();
  for (const m of list)
    statuses.set(m.id, { status: m.status, reason: m.reason });
  const candidates = list.filter((m) => m.status === "accepted");
  for (const m of candidates) {
    if (m.reviewed) continue;
    const others = candidates.filter((o) => o.id !== m.id);
    // With three or more, one wild value must not drag the reference away from the rest.
    const reference = candidates.length >= 3 ? candidates : others;
    if (
      others.length &&
      Math.abs(m.height_m - median(reference.map((o) => o.height_m))) >
        3 * m.sigma_m
    ) {
      statuses.set(m.id, { status: "needs_review", reason: "outlier" });
      continue;
    }
    // 2.3–4.5 m per floor plus a roof allowance, widened by the measurement's own 2σ.
    if (
      levels &&
      (m.height_m + 2 * m.sigma_m < levels * 2.3 ||
        m.height_m - 2 * m.sigma_m > levels * 4.5 + 3)
    )
      statuses.set(m.id, { status: "needs_review", reason: "floor_count" });
  }
  const accepted = candidates.filter(
    (m) => statuses.get(m.id)?.status === "accepted",
  );
  if (!accepted.length) return null;
  const weight = accepted.reduce((s, m) => s + 1 / m.sigma_m ** 2, 0);
  const height =
    accepted.reduce((s, m) => s + m.height_m / m.sigma_m ** 2, 0) / weight;
  const agree = accepted.some((a, i) =>
    accepted.some(
      (b, j) =>
        j > i &&
        independent(a, b) &&
        Math.abs(a.height_m - b.height_m) <=
          2 * Math.hypot(a.sigma_m, b.sigma_m),
    ),
  );
  return {
    height,
    sigma: 1 / Math.sqrt(weight),
    count: accepted.length,
    methods: [...new Set(accepted.map((m) => m.method))],
    confirmed:
      agree || accepted.some((m) => PRECISE_METHODS.includes(m.method)),
    statuses,
  };
}
/** ±2σ range used by the engine, with a lower bound that never reaches zero. */
export function heightRange(estimate: { height: number; sigma: number }) {
  const round = (v: number) => Math.round(v * 10) / 10;
  const low = Math.max(0.5, round(estimate.height - 2 * estimate.sigma));
  return {
    low_m: low,
    high_m: Math.max(
      low,
      Math.min(1000, round(estimate.height + 2 * estimate.sigma)),
    ),
  };
}
/** Only confirmed estimates replace a building's height (§6.4). */
export function measuredHeights(list: Measurement[]): MeasuredHeight[] {
  const groups = new Map<string, Measurement[]>();
  for (const m of list) {
    const group = groups.get(m.osm_building) ?? [];
    group.push(m);
    groups.set(m.osm_building, group);
  }
  const result: MeasuredHeight[] = [];
  for (const [id, group] of groups) {
    const estimate = combineMeasurements(group, group.at(-1)?.levels ?? null);
    if (!estimate?.confirmed) continue;
    result.push({ id, ...heightRange(estimate) });
  }
  // Keep the most recently measured buildings inside the request limit.
  return result.slice(-MAX_MEASURED_HEIGHTS);
}
export function isMeasurement(v: unknown): v is Measurement {
  const m = v as Measurement;
  return (
    isSubmission(m) &&
    finite(m.height_m, 0.1, 1000) &&
    finite(m.sigma_m, 0.01, 1000) &&
    point(m.tip) &&
    finite(m.sun_elevation_deg, -90, 90) &&
    finite(m.sun_azimuth_deg, 0, 360) &&
    ["accepted", "rejected", "needs_review"].includes(m.status) &&
    typeof m.reason === "string" &&
    (m.levels === null || finite(m.levels, 1, 150)) &&
    typeof m.observer === "string" &&
    m.observer.length <= 24
  );
}
/** Older saved entries predate the submission fields; upgrade instead of dropping them. */
function upgrade(v: unknown): unknown {
  if (!v || typeof v !== "object") return v;
  const m = v as Record<string, unknown>;
  return {
    lateral_m: null,
    gps_accuracy_m: m.method === "phone_gps" ? 5 : null,
    drone: null,
    observer: "",
    upload: "local",
    ...m,
    ...(m.method === "phone_gps" && m.lateral_m === undefined
      ? { lateral_m: 0 }
      : {}),
  };
}
/** Corrupt entries are dropped one by one instead of losing every saved measurement. */
export function restoreMeasurements(raw: string | null): Measurement[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.map(upgrade).filter(isMeasurement).slice(-MAX_MEASUREMENTS);
  } catch {
    return [];
  }
}
export function isReference(v: unknown): v is Reference {
  const r = v as Reference;
  return (
    !!r &&
    typeof r === "object" &&
    typeof r.id === "string" &&
    MEASUREMENT_ID.test(r.id) &&
    typeof r.osm_building === "string" &&
    BUILDING_ID.test(r.osm_building) &&
    ["laser_indirect", "drone_altitude", "floor_count"].includes(r.method) &&
    finite(r.height_m, 0.1, 1000) &&
    finite(r.sigma_m, 0, 100) &&
    typeof r.measured_at === "string" &&
    Number.isFinite(Date.parse(r.measured_at)) &&
    typeof r.note === "string" &&
    r.note.length <= 200 &&
    typeof r.observer === "string" &&
    r.observer.length <= 24
  );
}
export function restoreReferences(raw: string | null): Reference[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(isReference).slice(-500) : [];
  } catch {
    return [];
  }
}
/** Field-study export: every attempt, including rejected ones, plus reference heights. */
export function studyExport(
  measurements: Measurement[],
  references: Reference[],
  exportedAt: string,
) {
  return {
    format: "umbra-shadow-study-v1",
    exported_at: exportedAt,
    crs: "EPSG:32635",
    measurements: measurements.map((m) => {
      const copy = { ...m };
      delete copy.contributor;
      delete copy.upload;
      return copy;
    }),
    references,
  };
}
const CSV_COLUMNS = [
  "id",
  "osm_building",
  "method",
  "observer",
  "measured_at",
  "length_m",
  "sun_elevation_deg",
  "height_m",
  "sigma_m",
  "status",
  "reason",
] as const;
export function studyCsv(measurements: Measurement[]): string {
  const cell = (v: unknown) => {
    const text = String(v ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    CSV_COLUMNS.join(","),
    ...measurements.map((m) => CSV_COLUMNS.map((k) => cell(m[k])).join(",")),
  ].join("\n");
}
export const reasonLabel: Record<string, string> = {
  low_sun: "Soarele e sub 10°.",
  no_sharp_shadow: "Fără umbră clară.",
  obstructed_tip: "Vârful umbrei nu e pe sol liber.",
  rooftop_structure: "Vârful nu aparține colțului acoperișului.",
  off_ruler: "Poziția GPS e prea departe de linia umbrei.",
  slope: "Teren în pantă: de verificat.",
  outlier: "Diferă mult de celelalte măsurători.",
  floor_count: "Nu se potrivește cu numărul de etaje din OSM.",
  implausible_height: "Înălțime imposibilă.",
  not_a_corner: "Colțul nu aparține clădirii.",
  reviewed: "Verificată de moderator.",
};
export const methodLabel: Record<MeasureMethod, string> = {
  phone_gps: "telefon",
  tape_laser: "ruletă/laser",
  drone_nadir: "dronă",
};
export const referenceLabel: Record<ReferenceMethod, string> = {
  laser_indirect: "laser (înălțime indirectă)",
  drone_altitude: "dronă la nivelul acoperișului",
  floor_count: "etaje × înălțime etaj măsurată",
};
