// QA helper only. Produces public OSM data for the bundled renderer, not user GPS.
import { readFile, writeFile } from "node:fs/promises";
import { initializeDataset } from "../src/engine/data.ts";
import { unpackDataset } from "../src/engine/packedData.ts";
import { visibleBuildings } from "../src/engine/buildings.ts";
import { localShadows } from "../src/engine/overlay.ts";
import { shadowFeatures } from "../src/domain/localMap.ts";
import { task } from "../src/engine/task.ts";

const signal = new AbortController().signal;
const packed = JSON.parse(
  await readFile(
    new URL("../assets/data/constanta-city.json", import.meta.url),
    "utf8",
  ),
);
const data = await initializeDataset(
  await unpackDataset(packed, task(signal)),
  task(signal),
);
const view = [28.628, 44.17, 28.645, 44.181];
const buildings = await visibleBuildings(data, view, signal);
const shadows = shadowFeatures(
  await localShadows(data, "2026-06-21T09:00:00Z", view, signal),
);
const script = `window.umbraMap.receive(${JSON.stringify({ type: "data", name: "buildings", value: buildings })});\nwindow.umbraMap.receive(${JSON.stringify({ type: "data", name: "shadows", value: shadows })});\nwindow.umbraMap.receive({type:"tilt",value:true});`;
const output = process.argv[2] ?? "/tmp/umbra-map-preview.js";
await writeFile(output, script);
console.log(
  JSON.stringify({
    output,
    buildings: buildings.features.length,
    measuredOrFloorEstimated: buildings.features.filter((f) => f.properties.height > 0).length,
    displayVolumes: buildings.features.filter((f) => f.properties.display_height > 0).length,
    shadows: shadows.features.length,
  }),
);
