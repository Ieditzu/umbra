import clipping from "polygon-clipping";
import type { MultiPolygon, Polygon as ClipPolygon } from "polygon-clipping";
import type { Bounds, ShadowLayer, ShadowPolygon } from "../domain/shadows.ts";
import { ATTRIBUTION } from "./data.ts";
import type { Dataset } from "./data.ts";
import {
  bounds,
  expand,
  intersects,
  lerp,
  project,
  rad,
  rect,
  unproject,
} from "./geometry.ts";
import type { Polygon } from "./geometry.ts";
import { solarDirection, solarPosition } from "./solar.ts";
import type { Sun } from "./solar.ts";
import { task } from "./task.ts";

export class OutsideCoverageError extends Error {}

const clipPoly = (poly: Polygon): ClipPolygon =>
  poly.map((ring) => ring.map((p) => [p.x, p.y]));
function ringArea(ring: [number, number][]): number {
  // Translate first to avoid cancellation when UTM northings are ~5 million.
  const [x, y] = ring[0];
  let area = 0;
  for (let i = 1; i < ring.length; i++)
    area +=
      (ring[i - 1][0] - x) * (ring[i][1] - y) -
      (ring[i][0] - x) * (ring[i - 1][1] - y);
  return Math.abs(area) / 2;
}
const area = (polys: MultiPolygon) =>
  polys.reduce(
    (sum, poly) =>
      sum +
      ringArea(poly[0]) -
      poly.slice(1).reduce((a, ring) => a + ringArea(ring), 0),
    0,
  );

/** Sweep an extruded footprint, preserving holes and concave boundaries. */
export function castShadow(
  poly: Polygon,
  height: number,
  sun: Sun,
): MultiPolygon {
  if (
    !Number.isFinite(height) ||
    height <= 0 ||
    height > 1000 ||
    !Number.isFinite(sun.elevation) ||
    !Number.isFinite(sun.azimuth) ||
    sun.elevation < 5 ||
    sun.elevation > 90 ||
    poly.length > 64 ||
    poly.reduce((n, ring) => n + ring.length, 0) > 1024
  )
    throw new Error("Geometrie de umbră nesuportată.");
  const box = bounds(poly[0]),
    v = solarDirection(
      lerp({ x: box.west, y: box.south }, { x: box.east, y: box.north }, 0.5),
      sun.azimuth,
    );
  const reach = height / Math.tan(rad(sun.elevation)),
    dx = -v.x * reach,
    dy = -v.y * reach;
  if (reach < 0.00001) return [];
  const base = clipPoly(poly),
    moved: ClipPolygon = base.map((ring) =>
      ring.map(([x, y]) => [x + dx, y + dy]),
    );
  const pieces: ClipPolygon[] = [base, moved];
  for (const ring of base)
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1],
        b = ring[i];
      if (Math.abs((b[0] - a[0]) * dy - (b[1] - a[1]) * dx) < 1e-7) continue;
      pieces.push([[a, b, [b[0] + dx, b[1] + dy], [a[0] + dx, a[1] + dy], a]]);
    }
  return clipping.difference(
    clipping.union(pieces[0], ...pieces.slice(1)),
    base,
  );
}

export async function localShadows(
  data: Dataset,
  instant: string,
  viewport: Bounds,
  signal: AbortSignal,
): Promise<ShadowLayer> {
  const work = task(signal, 12000),
    at = Date.parse(instant),
    year = new Date(at).getUTCFullYear();
  const [w, s, e, n] = viewport;
  if (
    !Number.isFinite(at) ||
    year < 2000 ||
    year > 2100 ||
    !/(Z|[+-]\d{2}:\d{2})$/.test(instant) ||
    viewport.length !== 4 ||
    !viewport.every(Number.isFinite) ||
    w < -180 ||
    e > 180 ||
    s < -80 ||
    n > 84 ||
    w >= e ||
    s >= n ||
    e - w > 0.5 ||
    n - s > 0.5 ||
    (e - w) * (n - s) > 0.25
  )
    throw new Error("Apropie harta de Constanța.");
  work.check();
  const original = clipPoly([
    [
      project({ latitude: s, longitude: w }),
      project({ latitude: s, longitude: e }),
      project({ latitude: n, longitude: e }),
      project({ latitude: n, longitude: w }),
      project({ latitude: s, longitude: w }),
    ],
  ]);
  const clip = clipping.intersection(original, clipPoly(rect(data.pilot_m)));
  if (!clip.length || area(clip) < 0.01)
    throw new OutsideCoverageError(
      "Zona vizibilă este în afara acoperirii Constanța.",
    );
  const partialCoverage = area(clip) + 0.1 < area([original]);
  const sun = solarPosition(
    at,
    unproject({
      x: (data.pilot_m.west + data.pilot_m.east) / 2,
      y: (data.pilot_m.south + data.pilot_m.north) / 2,
    }),
  );
  const result: ShadowLayer = {
    at: instant,
    state:
      sun.elevation < -0.833
        ? "night"
        : sun.elevation < 5
          ? "low_sun"
          : "available",
    polygons: [],
    attribution: [ATTRIBUTION],
    warnings: [
      "Umbre geometrice locale pe teren plan, fără validare în teren. Arborii, norii și obstacolele necartografiate nu sunt modelate.",
    ],
    truncated: false,
    partialCoverage,
  };
  if (partialCoverage)
    result.warnings.push(
      "Harta depășește acoperirea Constanța; sunt afișate doar datele incluse.",
    );
  if (result.state !== "available") return result;
  const viewBox = bounds(
    clip.flatMap((poly) => poly[0].map(([x, y]) => ({ x, y }))),
  );
  let vertices = 0,
    skipped = 0;
  const nearby = data.index.query(
    expand(viewBox, data.maxHeight / Math.tan(rad(sun.elevation))),
  );
  // At city zoom, keep actual shadow geometry ahead of missing-height outlines.
  // The existing feature budget must not be consumed entirely by neutral buildings.
  nearby.sort(
    (a, b) => Number(a.height.low_m === 0) - Number(b.height.low_m === 0),
  );
  outer: for (const b of nearby) {
    await work.checkpoint();
    const source: ShadowPolygon["source"] =
      b.height.source === "osm_height_tag"
        ? "osm_height"
        : b.height.source === "estimated_from_levels"
          ? "levels_estimate"
          : "unknown";
    const reach =
      source === "unknown" ? 0 : b.height.low_m / Math.tan(rad(sun.elevation));
    if (!intersects(expand(b.box, reach), viewBox)) continue;
    for (let i = 0; i < b.geometry.length; i++) {
      await work.checkpoint();
      let shape: MultiPolygon;
      try {
        const poly = b.geometry[i];
        if (poly.length > 64 || poly.reduce((n, r) => n + r.length, 0) > 1024) {
          skipped++;
          continue;
        }
        shape = clipping.intersection(
          source === "unknown"
            ? [clipPoly(poly)]
            : castShadow(poly, b.height.low_m, sun),
          clip,
        );
      } catch {
        skipped++;
        continue;
      }
      for (let part = 0; part < shape.length; part++) {
        const polygon = shape[part];
        if (area([polygon]) < 0.01) continue;
        const count = polygon.reduce((n, ring) => n + ring.length, 0);
        if (vertices + count > 60000 || result.polygons.length >= 2000) {
          result.truncated = true;
          break outer;
        }
        const rings = polygon.map((ring) =>
          ring.map(([x, y]) => unproject({ x, y })),
        );
        vertices += count;
        result.polygons.push({
          id: `${b.id}-${i}-${part}`,
          source,
          coordinates: rings[0],
          holes: rings.slice(1),
        });
      }
    }
  }
  work.check();
  result.warnings.push(
    "Etajele folosesc limita inferioară de 2,5 m/etaj. Contururile fără înălțime sunt clădiri, nu umbre inventate.",
  );
  if (skipped)
    result.warnings.push(
      `${skipped} operații geometrice nesuportate au fost omise.`,
    );
  if (result.truncated)
    result.warnings.push("Limita de geometrie a fost atinsă. Apropie harta.");
  return result;
}
