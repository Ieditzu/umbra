import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import {
  initializeDataset,
  withCopernicusHeights,
} from "../../mobile/src/engine/data.ts";
import {
  withTrees,
  withSatelliteCanopies,
} from "../../mobile/src/engine/trees.ts";
import { task } from "../../mobile/src/engine/task.ts";
import { TreeCatalog } from "./tree-catalog.mjs";
import { CityCatalog } from "./catalog.mjs";

const CITIES = new URL("../../mobile/assets/data/cities/", import.meta.url);
const MAX_RAW = 120_000_000;

async function unpack(url, limit) {
  const packed = JSON.parse(await readFile(url, "utf8"));
  if (packed.format !== "umbra-gzip-json-v1" || packed.raw_bytes > limit)
    throw Error("Invalid packed snapshot");
  const decoded = gunzipSync(Buffer.from(packed.payload, "base64"), {
    maxOutputLength: limit,
  });
  if (decoded.length !== packed.raw_bytes)
    throw Error("Packed snapshot size mismatch");
  return JSON.parse(decoded.toString("utf8"));
}

export function loadTreeCatalog() {
  return unpack(
    new URL("../../mobile/assets/data/romania-trees.json", import.meta.url),
    80_000_000,
  ).then((raw) => new TreeCatalog(raw));
}

const union = (a, b) => ({
  west: Math.min(a.west, b.west),
  south: Math.min(a.south, b.south),
  east: Math.max(a.east, b.east),
  north: Math.max(a.north, b.north),
});
/** Join overlapping zones of one OSM snapshot; shared OSM node ids join the graphs. */
export function mergeRaw(parts) {
  if (parts.length === 1) return parts[0];
  const nodes = new Map(),
    edges = new Map(),
    buildings = new Map();
  for (const raw of parts) {
    for (const n of raw.nodes) nodes.set(n.id, n);
    for (const e of raw.edges)
      edges.set(`${e.from}:${e.to}:${e.way_id}:${e.geometry.length}`, e);
    for (const b of raw.buildings) buildings.set(b.id, b);
  }
  return {
    ...parts[0],
    pilot_id: parts.map((p) => p.pilot_id).join("+"),
    pilot_m: parts.map((p) => p.pilot_m).reduce(union),
    imported_m: parts.map((p) => p.imported_m).reduce(union),
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    buildings: [...buildings.values()],
  };
}

/**
 * Load one or more catalog areas as a single dataset with trees, canopies and
 * Copernicus height estimates. Several areas must be zones of one snapshot.
 */
export async function loadAreas(
  areas,
  { copernicus = true, treeCatalog = loadTreeCatalog() } = {},
) {
  const raws = await Promise.all(
    areas.map((a) => unpack(new URL(a.file, CITIES), MAX_RAW)),
  );
  const raw = mergeRaw(raws);
  const [data, catalog] = await Promise.all([
    initializeDataset(raw, task(new AbortController().signal, 120000)),
    treeCatalog,
  ]);
  let result = data;
  if (copernicus) {
    const sets = await Promise.all(
      areas
        .filter((a) => a.heights)
        .map(async (a) => {
          const value = JSON.parse(
            await readFile(new URL(a.heights, CITIES), "utf8"),
          );
          if (
            value.schema_version !== 1 ||
            !value.values ||
            typeof value.values !== "object" ||
            Array.isArray(value.values)
          )
            throw Error("Invalid Copernicus heights");
          return { ...value, year: value.year ?? a.heights_year ?? 2012 };
        }),
    );
    if (sets.length) {
      const year = sets[0].year;
      if (sets.some((s) => s.year !== year))
        throw Error("Mixed Copernicus height years");
      result = withCopernicusHeights(
        result,
        Object.assign({}, ...sets.map((s) => s.values)),
        year === 2021 ? 2021 : 2012,
        sets[0].source,
      );
    }
  }
  const canopies = (
    await Promise.all(
      areas
        .filter((a) => a.canopy)
        .map(async (a) => {
          const value = await unpack(new URL(a.canopy, CITIES), 40_000_000);
          if (value.schema_version !== 1) throw Error("Invalid canopy schema");
          return value.polygons;
        }),
    )
  ).flat();
  return withSatelliteCanopies(
    withTrees(result, catalog.forArea(data.imported_m)),
    canopies,
  );
}

let shared = null;
export function cityCatalog() {
  shared ??= CityCatalog.load();
  return shared;
}

// One bundled city by catalog id, for tests and offline analyses (route-effect.mjs).
export function loadCity({
  copernicus = true,
  city = "constanta",
  treeCatalog,
} = {}) {
  const treePromise = treeCatalog ?? loadTreeCatalog();
  const area = cityCatalog().get(city);
  const dataPromise = area
    ? loadAreas([area], { copernicus, treeCatalog: treePromise })
    : Promise.reject(Error(`Unknown city ${city}`));
  return { dataPromise, treePromise };
}
