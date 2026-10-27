import { deg, rad, unproject } from "./geometry.ts";
import type { Point } from "./geometry.ts";
import { solarDirection, solarPosition } from "./solar.ts";
import type { Sun } from "./solar.ts";

// Shadow-based building height: h = L · tan(e). See docs/shadow-heights.md §3.
export type MeasureMethod = "phone_gps" | "tape_laser" | "drone_nadir";
/** Engine vs SPA reference (≤0.03°) plus unmodelled refraction (~0.035° at 25°). */
export const SUN_ANGLE_SIGMA_DEG = 0.065;
export const MIN_SUN_ELEVATION = 10;
/** Angular diameter of the Sun, in radians (≈0.53°). */
const SUN_DIAMETER = rad(0.53);
/** Typical 1σ length error per method before the penumbra term (§5). */
export const METHOD_LENGTH_SIGMA: Record<MeasureMethod, number> = {
  phone_gps: 5,
  tape_laser: 0.3,
  /** Typical straight-down photo at 60 m: ~2 cm pixels, ±1 m altitude. */
  drone_nadir: 0.5,
};
export type DronePhoto = {
  altitude_m: number;
  focal_mm: number;
  sensor_mm: number;
  image_px: number;
  shadow_px: number;
};
/** Shadow length from a straight-down drone photo (§5.2). */
export function droneLength(photo: DronePhoto): {
  length: number;
  sigma: number;
  gsd: number;
} {
  const { altitude_m, focal_mm, sensor_mm, image_px, shadow_px } = photo;
  if (
    ![altitude_m, focal_mm, sensor_mm, image_px, shadow_px].every(
      (v) => Number.isFinite(v) && v > 0,
    ) ||
    altitude_m > 500 ||
    focal_mm > 500 ||
    sensor_mm > 100 ||
    image_px > 20000 ||
    shadow_px > image_px * 1.5
  )
    throw new Error("Date de fotografie invalide.");
  // Ground size of one pixel = altitude × sensor width / (focal length × image width).
  const gsd = (altitude_m * sensor_mm) / (focal_mm * image_px),
    length = shadow_px * gsd;
  // ±2 px marking error and ±1 m altitude error (scale error is proportional).
  return { length, gsd, sigma: Math.hypot(2 * gsd, length / altitude_m) };
}
/** Elevation band where one metre of length error stays below ~0.84 m of height error. */
export const GOOD_ELEVATION = { min: 15, max: 40 };

export type ShadowAxis = { sun: Sun; direction: Point };
/** Horizontal unit vector pointing away from the Sun at a footprint corner. */
export function shadowAxis(corner: Point, at: number): ShadowAxis {
  const sun = solarPosition(at, unproject(corner));
  const toward = solarDirection(corner, sun.azimuth);
  return { sun, direction: { x: -toward.x, y: -toward.y } };
}
/** Width of the blurred shadow edge on flat ground (§3.3). */
export function penumbraWidth(height: number, elevation: number): number {
  return (height * SUN_DIAMETER) / Math.sin(rad(elevation)) ** 2;
}
/** Shadow length a vertical edge of this height casts at this elevation. */
export function shadowLength(height: number, elevation: number): number {
  return height / Math.tan(rad(elevation));
}
export type HeightEstimate = {
  height: number;
  sigma: number;
  penumbra: number;
  lengthSigma: number;
};
/** Height and 1σ uncertainty from a measured length (§3.2 plus penumbra reading error). */
export function heightFromShadow(
  length: number,
  elevation: number,
  instrumentSigma: number,
): HeightEstimate {
  if (
    !Number.isFinite(length) ||
    length <= 0 ||
    !Number.isFinite(elevation) ||
    elevation <= 0 ||
    elevation >= 90 ||
    !Number.isFinite(instrumentSigma) ||
    instrumentSigma < 0
  )
    throw new Error("Măsurătoare de umbră invalidă.");
  const e = rad(elevation),
    height = length * Math.tan(e),
    penumbra = penumbraWidth(height, elevation);
  // Marking the middle of a band of width w behaves like a uniform error over w.
  const lengthSigma = Math.hypot(instrumentSigma, penumbra / Math.sqrt(12));
  const sigma = Math.hypot(
    Math.tan(e) * lengthSigma,
    (length * rad(SUN_ANGLE_SIGMA_DEG)) / Math.cos(e) ** 2,
  );
  return { height, sigma, penumbra, lengthSigma };
}
/** Expected height uncertainty before measuring, for the method chooser. */
export function expectedSigma(
  height: number,
  elevation: number,
  method: MeasureMethod,
): number | null {
  if (elevation < MIN_SUN_ELEVATION || elevation >= 89 || !(height > 0))
    return null;
  return heightFromShadow(
    shadowLength(height, elevation),
    elevation,
    METHOD_LENGTH_SIGMA[method],
  ).sigma;
}
export type SunAdvice = "too_low" | "low" | "good" | "high" | "too_high";
export function sunAdvice(elevation: number): SunAdvice {
  if (elevation < MIN_SUN_ELEVATION) return "too_low";
  if (elevation < GOOD_ELEVATION.min) return "low";
  if (elevation <= GOOD_ELEVATION.max) return "good";
  return elevation <= 60 ? "high" : "too_high";
}
export type RulerMark = { height: number; point: Point };
/** Points along the shadow line where a roof corner of each height would cast its tip. */
export function rulerMarks(
  corner: Point,
  axis: ShadowAxis,
  maxHeight: number,
  step = 5,
): RulerMark[] {
  if (axis.sun.elevation < MIN_SUN_ELEVATION) return [];
  const marks: RulerMark[] = [];
  for (let h = step; h <= maxHeight + 1e-9 && marks.length < 40; h += step) {
    const d = shadowLength(h, axis.sun.elevation);
    if (d > 400) break;
    marks.push({
      height: h,
      point: {
        x: corner.x + axis.direction.x * d,
        y: corner.y + axis.direction.y * d,
      },
    });
  }
  return marks;
}
export type GpsTip = {
  length: number;
  lateral: number;
  accuracy: number;
  tip: Point;
  samples: number;
};
/** Average fixes, then snap them to the known shadow line to remove the sideways GPS error (§5.1). */
export function snapGpsTip(
  corner: Point,
  axis: ShadowAxis,
  fixes: { point: Point; accuracy: number }[],
): GpsTip {
  const usable = fixes.filter(
    (f) =>
      Number.isFinite(f.point.x) &&
      Number.isFinite(f.point.y) &&
      Number.isFinite(f.accuracy) &&
      f.accuracy > 0 &&
      f.accuracy <= 30,
  );
  if (!usable.length)
    throw new Error("Semnal GPS prea slab. Așteaptă o precizie sub 30 m.");
  const mean = {
    x: usable.reduce((s, f) => s + f.point.x, 0) / usable.length,
    y: usable.reduce((s, f) => s + f.point.y, 0) / usable.length,
  };
  const dx = mean.x - corner.x,
    dy = mean.y - corner.y,
    u = axis.direction;
  const length = dx * u.x + dy * u.y,
    lateral = dx * u.y - dy * u.x;
  return {
    length,
    lateral,
    // Fixes taken while standing still are correlated; do not divide by √n.
    accuracy: usable.reduce((s, f) => s + f.accuracy, 0) / usable.length,
    tip: { x: corner.x + u.x * length, y: corner.y + u.y * length },
    samples: usable.length,
  };
}
/** Corners whose roof-corner shadow tip lies on the outline of the shadow, not inside it. */
export function castingCorners(
  ring: Point[],
  direction: Point,
  inside: (p: Point) => boolean,
): number[] {
  const count =
    ring.length > 1 &&
    ring[0].x === ring.at(-1)!.x &&
    ring[0].y === ring.at(-1)!.y
      ? ring.length - 1
      : ring.length;
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    const c = ring[i];
    // Probe just past the corner on both sides of the shadow line: a wall running
    // along the shadow direction would otherwise put the probe on the outline.
    const side = { x: -direction.y * 0.05, y: direction.x * 0.05 };
    const ahead = { x: c.x + direction.x * 0.3, y: c.y + direction.y * 0.3 };
    if (
      inside({ x: ahead.x + side.x, y: ahead.y + side.y }) ||
      inside({ x: ahead.x - side.x, y: ahead.y - side.y })
    )
      continue;
    // Skip almost-straight vertices: their tip sits in the middle of a shadow edge.
    const a = ring[(i - 1 + count) % count],
      b = ring[(i + 1) % count];
    const turn = Math.abs(
      deg(
        Math.atan2(
          (c.x - a.x) * (b.y - c.y) - (c.y - a.y) * (b.x - c.x),
          (c.x - a.x) * (b.x - c.x) + (c.y - a.y) * (b.y - c.y),
        ),
      ),
    );
    if (turn < 20) continue;
    result.push(i);
  }
  return result;
}
export type Window = { start: number; end: number };
/** Today's time ranges with the Sun inside the recommended elevation band. */
export function measuringWindows(
  corner: Point,
  dayStart: number,
  band = GOOD_ELEVATION,
): Window[] {
  const step = 5 * 60000,
    windows: Window[] = [];
  let open: number | null = null;
  const c = unproject(corner);
  for (let t = dayStart; t <= dayStart + 86400000; t += step) {
    const e = solarPosition(t, c).elevation;
    const good = e >= band.min && e <= band.max;
    if (good && open === null) open = t;
    if (!good && open !== null) {
      windows.push({ start: open, end: t - step });
      open = null;
    }
  }
  if (open !== null) windows.push({ start: open, end: dayStart + 86400000 });
  return windows.filter((w) => w.end > w.start);
}
