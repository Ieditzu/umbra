// Developer-only: ship real OSM data with the app; never run this on user GPS.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const source = process.argv[2];
if (!source)
  throw new Error(
    "Usage: node scripts/prepare-pilot.mjs /path/to/prepared/dataset.json",
  );
const data = JSON.parse(await readFile(source, "utf8"));
if (
  data.schema_version !== 1 ||
  data.crs !== "EPSG:32635" ||
  data.pilot_id !== "constanta-central-v1"
)
  throw new Error("Unexpected pilot dataset");
// Keep geometry, access-filtered graph, height provenance and original metadata.
// Millimetre rounding reduces the bundle without inventing/simplifying paths.
const output = JSON.stringify(data, (key, value) =>
  typeof value === "number" && !Number.isInteger(value)
    ? Math.round(value * 1000) / 1000
    : value,
);
const folder = new URL("../assets/data/", import.meta.url);
await mkdir(folder, { recursive: true });
await writeFile(new URL("constanta-central.json", folder), output + "\n");
await writeFile(
  new URL("manifest.json", folder),
  JSON.stringify(
    {
      pilot_id: data.pilot_id,
      osm_base_timestamp: data.metadata.osm_base_timestamp,
      imported_at: data.metadata.imported_at,
      sha256: createHash("sha256")
        .update(output + "\n")
        .digest("hex"),
      license: "ODbL-1.0",
      attribution: data.metadata.attribution,
      nodes: data.nodes.length,
      directed_edges: data.edges.length,
      buildings: data.buildings.length,
      note: "Real OSM snapshot; not field validated. Geometry rounded to millimetres. Bundled for on-device calculations.",
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Bundled ${data.nodes.length} nodes, ${data.edges.length} edges and ${data.buildings.length} buildings (${output.length} characters).`,
);
