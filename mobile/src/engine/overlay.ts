import clipping from "polygon-clipping";
import type { MultiPolygon, Polygon as ClipPolygon } from "polygon-clipping";
import type { Bounds, ShadowLayer, ShadowPolygon } from "../domain/shadows.ts";
import { ATTRIBUTION } from "./data.ts";
import type { Dataset } from "./data.ts";
import {
  bounds,
  contains,
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
import { isCoordinate } from "../domain/routes.ts";
import type { Coordinate } from "../domain/routes.ts";
import { task } from "./task.ts";
import { treeHasFoliage } from "./trees.ts";

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
  options: {
    displayEstimates?: boolean;
    includeNeutralFootprints?: boolean;
    focus?: Coordinate;
  } = {},
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
    s >= n
  )
    throw new Error("Apropie harta de România.");
  work.check();
  const geoRegion = bounds(
    rect(data.pilot_m)[0].map((p) => {
      const c = unproject(p);
      return { x: c.longitude, y: c.latitude };
    }),
  );
  const left = Math.max(w, geoRegion.west),
    right = Math.min(e, geoRegion.east);
  const bottom = Math.max(s, geoRegion.south),
    top = Math.min(n, geoRegion.north);
  if (left >= right || bottom >= top)
    throw new OutsideCoverageError(
      "Zona vizibilă nu conține clădirile încărcate.",
    );
  const original = clipPoly([
    [
      project({ latitude: bottom, longitude: left }),
      project({ latitude: bottom, longitude: right }),
      project({ latitude: top, longitude: right }),
      project({ latitude: top, longitude: left }),
      project({ latitude: bottom, longitude: left }),
    ],
  ]);
  const clip = clipping.intersection(original, clipPoly(rect(data.pilot_m)));
  if (!clip.length || area(clip) < 0.01)
    throw new OutsideCoverageError(
      "Zona vizibilă nu conține clădirile încărcate.",
    );
  const partialCoverage =
    w < left ||
    e > right ||
    s < bottom ||
    n > top ||
    area(clip) + 0.1 < area([original]);
  const viewBox = bounds(
    clip.flatMap((poly) => poly[0].map(([x, y]) => ({ x, y }))),
  );
  const focus =
    options.focus &&
    isCoordinate(options.focus) &&
    contains(viewBox, project(options.focus))
      ? options.focus
      : unproject({
          x: (viewBox.west + viewBox.east) / 2,
          y: (viewBox.south + viewBox.north) / 2,
        });
  const sun = solarPosition(at, focus);
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
      "Umbre geometrice locale pe teren plan, fără validare în teren. Norii și obstacolele necartografiate nu sunt modelate.",
    ],
    truncated: false,
    partialCoverage,
    sun: { ...sun, location: focus },
  };
  if (partialCoverage)
    result.warnings.push(
      "Datele disponibile acoperă doar o parte din zona vizibilă. Apropie harta.",
    );
  let vertices = 0,
    skipped = 0;
  if (options.displayEstimates && data.treeIndex) {
    const treeReach =
      result.state === "available" ? 60 / Math.tan(rad(sun.elevation)) : 0;
    const center = project(focus);
    const nearbyTrees = data.treeIndex
      .query(expand(viewBox, treeReach))
      .sort(
        (a, b) =>
          ((a.box.west + a.box.east) / 2 - center.x) ** 2 +
          ((a.box.south + a.box.north) / 2 - center.y) ** 2 -
          ((b.box.west + b.box.east) / 2 - center.x) ** 2 -
          ((b.box.south + b.box.north) / 2 - center.y) ** 2,
      );
    // Limit each response so dense tree data does not crowd out buildings or stall mobile rendering.
    for (const tree of nearbyTrees.slice(0, 500)) {
      await work.checkpoint();
      const add = (
        shape: MultiPolygon,
        source:
          | "tree_canopy"
          | "tree_estimate"
          | "satellite_canopy"
          | "satellite_estimate",
      ) => {
        for (const [part, polygon] of shape.entries()) {
          const count = polygon.reduce((n, ring) => n + ring.length, 0);
          if (
            area([polygon]) < 0.01 ||
            vertices + count > 60000 ||
            result.polygons.length >= 2000
          )
            continue;
          vertices += count;
          const rings = polygon.map((ring) =>
            ring.map(([x, y]) => unproject({ x, y })),
          );
          result.polygons.push({
            id: `${tree.id}-${source}-${part}`,
            source,
            ...(source === "tree_canopy" || source === "satellite_canopy"
              ? { canopyHeight: tree.height, canopyBase: tree.base }
              : {}),
            coordinates: rings[0],
            holes: rings.slice(1),
          });
        }
      };
      try {
        if (intersects(tree.box, viewBox))
          add(
            clipping.intersection(clipPoly(tree.geometry), clip),
            tree.origin === "satellite" ? "satellite_canopy" : "tree_canopy",
          );
        if (result.state !== "available" || !treeHasFoliage(tree, at)) continue;
        const v = solarDirection(center, sun.azimuth),
          slope = Math.tan(rad(sun.elevation));
        const shifted = tree.geometry.map((ring) =>
          ring.map((p) => ({
            x: p.x - (v.x * tree.base) / slope,
            y: p.y - (v.y * tree.base) / slope,
          })),
        );
        const swept = castShadow(shifted, tree.height - tree.base, sun);
        add(
          clipping.intersection(
            clipping.union(clipPoly(shifted), ...swept),
            clip,
          ),
          tree.origin === "satellite" ? "satellite_estimate" : "tree_estimate",
        );
      } catch {
        skipped++;
      }
    }
    if (nearbyTrees.length > 500) {
      result.truncated = true;
      result.warnings.push(
        "Au fost afișați maximum 500 de arbori și segmente de rând din apropiere. Apropie harta.",
      );
    }
    if (data.trees?.some((tree) => tree.origin === "satellite")) {
      result.attribution.push(
        "Canopy height: Tolan et al. 2024 · WRI and Meta · CC BY 4.0 · source imagery © Maxar · 2019–2020",
      );
      result.warnings.push(
        "În Constanța, coroanele satelitare sunt estimări din imagini din 2019–2020; pot include erori și schimbări ulterioare.",
      );
    }
    result.warnings.push(
      "Copacii și rândurile OSM au coroane aproximative; umbra este orientativă. Arborii foioși și cei fără tip declarat sunt considerați fără frunze din noiembrie până în martie.",
    );
  }
  if (result.state !== "available") return result;
  const nearby = data.index.query(
    expand(
      viewBox,
      Math.max(
        data.maxHeight,
        options.displayEstimates ? data.maxDisplayHeight : 0,
      ) / Math.tan(rad(sun.elevation)),
    ),
  );
  // At city zoom, keep actual shadow geometry ahead of missing-height outlines.
  // The existing feature budget must not be consumed entirely by neutral buildings.
  const center = project(focus);
  const proximity = (b: Dataset["buildings"][number]) =>
    ((b.box.west + b.box.east) / 2 - center.x) ** 2 +
    ((b.box.south + b.box.north) / 2 - center.y) ** 2;
  nearby.sort((a, b) =>
    options.displayEstimates || options.focus
      ? proximity(a) - proximity(b)
      : Number(a.height.low_m === 0) - Number(b.height.low_m === 0),
  );
  outer: for (const b of nearby) {
    await work.checkpoint();
    const source: ShadowPolygon["source"] =
      b.height.source === "measured_shadow"
        ? "measured"
        : b.height.source === "osm_height_tag"
          ? "osm_height"
          : b.height.source === "estimated_from_levels"
            ? "levels_estimate"
            : options.displayEstimates && b.height.source === "missing"
              ? "display_estimate"
              : "unknown";
    if (source === "unknown" && options.includeNeutralFootprints === false)
      continue;
    const renderHeight = Number(b.tags["umbra:render_height"]);
    const height =
      source === "display_estimate"
        ? Number.isFinite(renderHeight) &&
          renderHeight > 0 &&
          renderHeight <= 1000
          ? renderHeight
          : 6
        : b.height.low_m;
    const reach =
      source === "unknown" ? 0 : height / Math.tan(rad(sun.elevation));
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
            : castShadow(poly, height, sun),
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
  if (result.polygons.some((p) => p.source === "measured"))
    result.warnings.push(
      "Unele umbre folosesc înălțimi măsurate pe telefon din umbra clădirii (interval ±2σ). Sunt măsurători locale, neverificate de alte persoane.",
    );
  result.warnings.push(
    "Etajele folosesc limita inferioară de 2,5 m/etaj; înălțimile lipsă pot folosi estimări doar pentru afișare.",
  );
  if (options.displayEstimates)
    result.warnings.push(
      "Umbrele orientative folosesc înălțimea de randare a hărții sau ipoteza de 6 m pentru clădirile fără înălțime. Nu sunt măsurători și nu sunt folosite la evaluarea traseelor.",
    );
  if (skipped)
    result.warnings.push(
      `${skipped} operații geometrice nesuportate au fost omise.`,
    );
  if (result.truncated)
    result.warnings.push("Limita de geometrie a fost atinsă. Apropie harta.");
  return result;
}
