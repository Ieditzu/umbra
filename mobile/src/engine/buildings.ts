import type { Bounds } from "../domain/shadows.ts";
import type { Dataset } from "./data.ts";
import { bounds, expand, project, unproject } from "./geometry.ts";
import { task } from "./task.ts";

export type BuildingFeatures = {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    id: string;
    properties: { height: number; height_source: string; display_height: number };
    geometry: { type: "Polygon"; coordinates: [number, number][][] };
  }[];
  truncated: boolean;
};

/** Display geometry is independent of time, shadows and native map coverage. */
export async function visibleBuildings(
  data: Dataset,
  view: Bounds,
  signal: AbortSignal,
): Promise<BuildingFeatures> {
  const work = task(signal, 10000);
  const [w, s, e, n] = view;
  if (
    view.length !== 4 ||
    !view.every(Number.isFinite) ||
    w >= e ||
    s >= n ||
    w < -180 ||
    e > 180 ||
    s < -80 ||
    n > 84 ||
    e - w > 0.5 ||
    n - s > 0.5
  )
    return { type: "FeatureCollection", features: [], truncated: true };
  const box = expand(
    bounds([
      project({ latitude: s, longitude: w }),
      project({ latitude: s, longitude: e }),
      project({ latitude: n, longitude: w }),
      project({ latitude: n, longitude: e }),
    ]),
    100,
  );
  const center = project({ latitude: (s + n) / 2, longitude: (w + e) / 2 });
  // A wide tilted viewport must not spend its entire budget on distant tall blocks.
  const distance = (b: Dataset["buildings"][number]) => {
    const p = b.geometry[0][0][0];
    return (p.x - center.x) ** 2 + (p.y - center.y) ** 2;
  };
  const nearby = data.index.query(box).sort((a, b) => distance(a) - distance(b));
  const result: BuildingFeatures = {
    type: "FeatureCollection",
    features: [],
    truncated: false,
  };
  let vertices = 0;
  for (const b of nearby) {
    await work.checkpoint();
    for (let i = 0; i < b.geometry.length; i++) {
      const poly = b.geometry[i],
        count = poly.reduce((n, ring) => n + ring.length, 0);
      if (vertices + count > 160000 || result.features.length >= 6000) {
        result.truncated = true;
        return result;
      }
      vertices += count;
      result.features.push({
        type: "Feature",
        id: `${b.id}-${i}`,
        properties: {
          height: b.height.low_m,
          height_source: b.height.source,
          // Display-only placeholder. Never fed back into solar or routing geometry.
          display_height: b.height.low_m > 0 ? b.height.low_m : 6,
        },
        geometry: {
          type: "Polygon",
          coordinates: poly.map((ring) =>
            ring.map((p) => {
              const c = unproject(p);
              return [c.longitude, c.latitude];
            }),
          ),
        },
      });
    }
  }
  return result;
}
