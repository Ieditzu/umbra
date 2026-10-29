// Developer-only: ship real OSM data with the app; never run this on user GPS.
// Legacy: node scripts/prepare-city.mjs DATASET [constanta|suceava]
// Generic: node scripts/prepare-city.mjs DATASET --id cluj-napoca --out DIR --bounds W,S,E,N
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const { positionals, values: options } = parseArgs({
  allowPositionals: true,
  options: {
    id: { type: "string" },
    out: { type: "string" },
    bounds: { type: "string" },
  },
});
const source = positionals[0];
const legacy = {
  constanta: [28.5, 44.075, 28.75, 44.355],
  suceava: [26.09, 47.59, 26.41, 47.77],
};
const city = options.id ?? positionals[1] ?? "constanta";
if (!options.id && !legacy[city]) throw new Error("Unknown city");
if (options.id && !/^[a-z0-9-]+$/.test(options.id))
  throw new Error("City id must be lowercase ASCII");
const extractBounds = options.bounds
  ? options.bounds.split(",").map(Number)
  : legacy[city];
if (extractBounds?.length !== 4 || !extractBounds.every(Number.isFinite))
  throw new Error("Expected --bounds west,south,east,north");
if (!source)
  throw new Error(
    "Usage: node scripts/prepare-city.mjs /path/to/prepared/city/dataset.json",
  );
const data = JSON.parse(await readFile(source, "utf8"));
if (
  data.schema_version !== 1 ||
  data.crs !== "EPSG:32635" ||
  data.pilot_id !== `${city}-city-v1`
)
  throw new Error("Unexpected pilot dataset");
const heightTags = [
  "height",
  "building:levels",
  "min_height",
  "building:min_level",
  "building",
  "building:part",
];
data.buildings = data.buildings.map((building) => ({
  ...building,
  tags: Object.fromEntries(
    heightTags
      .filter((key) => building.tags[key] !== undefined)
      .map((key) => [key, building.tags[key]]),
  ),
}));
// Keep geometry, access-filtered graph, height provenance and original metadata.
// Millimetre rounding reduces the bundle without inventing/simplifying paths.
const output = JSON.stringify(data, (key, value) =>
  typeof value === "number" && !Number.isInteger(value)
    ? Math.round(value * 1000) / 1000
    : value,
);
const folder = options.out
  ? pathToFileURL(resolve(options.out) + "/")
  : new URL("../assets/data/", import.meta.url);
await mkdir(folder, { recursive: true });
const packed =
  JSON.stringify({
    format: "umbra-gzip-json-v1",
    raw_bytes: Buffer.byteLength(output),
    payload: gzipSync(output, { level: 9 }).toString("base64"),
  }) + "\n";
await writeFile(new URL(`${city}-city.json`, folder), packed);
await writeFile(
  new URL(
    options.id
      ? `${city}-manifest.json`
      : city === "constanta"
        ? "manifest.json"
        : "suceava-manifest.json",
    folder,
  ),
  JSON.stringify(
    {
      pilot_id: data.pilot_id,
      osm_base_timestamp: data.metadata.osm_base_timestamp,
      imported_at: data.metadata.imported_at,
      sha256: createHash("sha256").update(packed).digest("hex"),
      license: "ODbL-1.0",
      attribution: data.metadata.attribution,
      nodes: data.nodes.length,
      directed_edges: data.edges.length,
      buildings: data.buildings.length,
      bytes: Buffer.byteLength(packed),
      raw_bytes: Buffer.byteLength(output),
      raw_sha256: createHash("sha256").update(output).digest("hex"),
      format: "umbra-gzip-json-v1",
      geographic_extract_bounds: extractBounds,
      source_url: data.metadata.source_url ?? data.metadata.overpass_endpoint,
      source_file: data.metadata.source_file,
      source_pbf_sha256: data.metadata.source_pbf_sha256,
      height_sources: data.buildings.reduce((counts, building) => {
        const key = building.height.source;
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      }, {}),
      note: "Real OSM snapshot; not field validated. Geometry rounded to millimetres. Bundled for on-device calculations.",
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Bundled ${data.nodes.length} nodes, ${data.edges.length} edges and ${data.buildings.length} buildings (${output.length} characters).`,
);
