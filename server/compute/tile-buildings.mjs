import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { tileBounds } from "./regions.mjs";
import { project, bounds } from "../../mobile/src/engine/geometry.ts";
import { initializeDataset } from "../../mobile/src/engine/data.ts";
import { task } from "../../mobile/src/engine/task.ts";
const require = createRequire(
  new URL("../../mobile/package.json", import.meta.url),
);
const { VectorTile } = await import(
  pathToFileURL(require.resolve("@mapbox/vector-tile")).href
);
const { PbfReader } = await import(pathToFileURL(require.resolve("pbf")).href);
const { default: clipping } = await import(
  pathToFileURL(require.resolve("polygon-clipping")).href
);

export async function decodeRegion(region, signal) {
  const work = task(signal, 12000),
    parts = new Map();
  let vertices = 0,
    skipped = 0;
  for (const tile of region.tiles) {
    await work.checkpoint();
    const layer = new VectorTile(new PbfReader(tile.bytes)).layers.building;
    if (!layer) continue;
    if (layer.length > 50000) throw Error("Prea multe clădiri în tile.");
    const [w, s, e, n] = tileBounds(tile.x, tile.y, tile.z);
    const clip = [
      [
        [
          [w, s],
          [e, s],
          [e, n],
          [w, n],
          [w, s],
        ],
      ],
    ];
    for (let i = 0; i < layer.length; i++) {
      await work.checkpoint();
      const f = layer.feature(i);
      if (f.type !== 3 || f.properties.hide_3d === true) continue;
      const json = f.toGeoJSON(tile.x, tile.y, tile.z),
        raw =
          json.geometry.type === "Polygon"
            ? [json.geometry.coordinates]
            : json.geometry.coordinates;
      const count = raw.reduce(
        (a, p) => a + p.reduce((b, r) => b + r.length, 0),
        0,
      );
      vertices += count;
      if (count > 100000 || vertices > 700000) {
        skipped++;
        continue;
      }
      let geometry;
      try {
        geometry = clipping.intersection(raw, clip);
      } catch {
        skipped++;
        continue;
      }
      if (!geometry.length) continue;
      const id =
        f.id === undefined
          ? `tile:${tile.x}/${tile.y}:${i}`
          : `tile-osm:${f.id}`;
      const previous = parts.get(id);
      const h = Number(f.properties.render_height),
        base = Number(f.properties.render_min_height ?? 0);
      const height = Number.isFinite(h) && h > 0 && h <= 1000 ? h : 6;
      if (previous) {
        try {
          previous.geometry = clipping.union(previous.geometry, geometry);
        } catch {
          skipped++;
        }
      } else
        parts.set(id, {
          geometry,
          height,
          base: Number.isFinite(base) && base > 0 ? base : 0,
        });
    }
  }
  const [w, s, e, n] = region.bounds;
  const area = bounds([
    project({ longitude: w, latitude: s }),
    project({ longitude: w, latitude: n }),
    project({ longitude: e, latitude: s }),
    project({ longitude: e, latitude: n }),
  ]);
  const buildings = [...parts.values()].flatMap((b) =>
    b.geometry.map((poly) => {
      const canonical = poly.map((ring) => {
        const points = ring
          .slice(0, -1)
          .map(([x, y]) => [
            Math.round(x * 1e7) / 1e7,
            Math.round(y * 1e7) / 1e7,
          ]);
        let start = 0;
        for (let i = 1; i < points.length; i++)
          if (
            points[i][0] < points[start][0] ||
            (points[i][0] === points[start][0] &&
              points[i][1] < points[start][1])
          )
            start = i;
        const rotated = [...points.slice(start), ...points.slice(0, start)];
        rotated.push(rotated[0]);
        return rotated;
      });
      const id =
        "map:" +
        createHash("sha256")
          .update(JSON.stringify([canonical, b.height, b.base]))
          .digest("hex")
          .slice(0, 24);
      return {
        id,
        tags: {
          "umbra:render_height": String(b.height),
          ...(b.base > 0 ? { min_height: String(b.base) } : {}),
        },
        geometry: [
          poly.map((ring) =>
            ring.map(([longitude, latitude]) =>
              project({ longitude, latitude }),
            ),
          ),
        ],
      };
    }),
  );
  const data = await initializeDataset(
    {
      schema_version: 1,
      crs: "EPSG:32635",
      pilot_id: region.key,
      pilot_m: area,
      imported_m: area,
      nodes: [],
      edges: [],
      buildings,
      metadata: {
        dataset_kind: "building-map-only",
        source: "OpenFreeMap / OpenMapTiles / OpenStreetMap",
        height_provenance:
          "render heights may contain defaults; visual estimates only",
        skipped: String(skipped),
      },
    },
    work,
    { requireGraph: false },
  );
  return data;
}
