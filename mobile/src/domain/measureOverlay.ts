import type { Coordinate } from "./routes.ts";
import type { MeasureTarget } from "../engine/measureTarget.ts";
import { project, unproject } from "../engine/geometry.ts";
import type { Point } from "../engine/geometry.ts";
import {
  MIN_SUN_ELEVATION,
  rulerMarks,
  shadowAxis,
  shadowLength,
} from "../engine/shadowMeasure.ts";

export type MeasureOverlay = {
  outline: Coordinate[];
  corner: Coordinate | null;
  ruler: Coordinate[];
  marks: { coordinate: Coordinate; label: string }[];
  tip: Coordinate | null;
};
/** Ruler from the chosen roof corner along the shadow direction, marked in building heights. */
export function buildMeasureOverlay(
  target: MeasureTarget,
  cornerIndex: number | null,
  at: number,
  tip: Point | null = null,
  /** Field-study blind mode: no height marks that could guide where the tip is marked. */
  blind = false,
): MeasureOverlay {
  const overlay: MeasureOverlay = {
    outline: target.footprint,
    corner: null,
    ruler: [],
    marks: [],
    tip: tip ? unproject(tip) : null,
  };
  const corner = target.corners.find((c) => c.index === cornerIndex);
  if (!corner) return overlay;
  overlay.corner = corner.coordinate;
  const c = project(corner.coordinate),
    axis = shadowAxis(c, at);
  if (axis.sun.elevation < MIN_SUN_ELEVATION) return overlay;
  const max = Math.min(
    120,
    Math.max(30, Math.ceil((target.expected_height_m * 1.5) / 5) * 5),
  );
  const step = max > 60 ? 10 : 5;
  const marks = rulerMarks(c, axis, max, step);
  const reach = Math.min(400, shadowLength(max, axis.sun.elevation));
  overlay.ruler = [
    corner.coordinate,
    unproject({
      x: c.x + axis.direction.x * reach,
      y: c.y + axis.direction.y * reach,
    }),
  ];
  overlay.marks = (blind ? [] : marks).map((m) => ({
    coordinate: unproject(m.point),
    label: `${m.height} m`,
  }));
  return overlay;
}
const lngLat = (c: Coordinate) => [c.longitude, c.latitude];
/** GeoJSON for the local MapLibre renderer. */
export function measureFeatures(overlay: MeasureOverlay | null) {
  const features: object[] = [];
  if (overlay) {
    if (overlay.outline.length >= 4)
      features.push({
        type: "Feature",
        properties: { kind: "outline" },
        geometry: {
          type: "LineString",
          coordinates: overlay.outline.map(lngLat),
        },
      });
    if (overlay.ruler.length === 2)
      features.push({
        type: "Feature",
        properties: { kind: "ruler" },
        geometry: {
          type: "LineString",
          coordinates: overlay.ruler.map(lngLat),
        },
      });
    for (const mark of overlay.marks)
      features.push({
        type: "Feature",
        properties: { kind: "mark", label: mark.label },
        geometry: { type: "Point", coordinates: lngLat(mark.coordinate) },
      });
    if (overlay.corner)
      features.push({
        type: "Feature",
        properties: { kind: "corner" },
        geometry: { type: "Point", coordinates: lngLat(overlay.corner) },
      });
    if (overlay.tip)
      features.push({
        type: "Feature",
        properties: { kind: "tip" },
        geometry: { type: "Point", coordinates: lngLat(overlay.tip) },
      });
  }
  return { type: "FeatureCollection" as const, features };
}
