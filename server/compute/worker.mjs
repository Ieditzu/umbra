import { parentPort } from "node:worker_threads";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { initializeDataset } from "../../mobile/src/engine/data.ts";
import { compareLocalRoutes } from "../../mobile/src/engine/routing.ts";
import { visibleBuildings } from "../../mobile/src/engine/buildings.ts";
import {
  localShadows,
  OutsideCoverageError,
} from "../../mobile/src/engine/overlay.ts";
import { task } from "../../mobile/src/engine/task.ts";

const controllers = new Map();
const dataPromise = (async () => {
  const packed = JSON.parse(
    await readFile(
      new URL("../../mobile/assets/data/constanta-city.json", import.meta.url),
      "utf8",
    ),
  );
  if (packed.format !== "umbra-gzip-json-v1" || packed.raw_bytes > 50_000_000)
    throw Error("Invalid city snapshot");
  const decoded = gunzipSync(Buffer.from(packed.payload, "base64"), {
    maxOutputLength: 50_000_000,
  });
  if (decoded.length !== packed.raw_bytes)
    throw Error("City snapshot size mismatch");
  return initializeDataset(
    JSON.parse(decoded.toString("utf8")),
    task(new AbortController().signal, 60000),
  );
})();
dataPromise
  .then((data) =>
    parentPort.postMessage({
      type: "ready",
      nodes: data.nodes.length,
      buildings: data.buildings.length,
    }),
  )
  .catch((error) =>
    parentPort.postMessage({ type: "fatal", message: error.message }),
  );
parentPort.on("message", async (message) => {
  if (message.type === "cancel") {
    controllers.get(message.id)?.abort();
    return;
  }
  const controller = new AbortController();
  controllers.set(message.id, controller);
  try {
    const data = await dataPromise;
    if (controller.signal.aborted) throw Error("Calculul a fost oprit.");
    const q = message.payload;
    let result;
    if (message.kind === "routes") {
      result = await compareLocalRoutes(data, q, controller.signal);
      result.method = result.method.replace(/^on-device\//, "server/");
    } else if (message.kind === "buildings") {
      result = await visibleBuildings(
        data,
        q.bounds,
        controller.signal,
        q.focus,
        { maxFeatures: 2500, maxVertices: 70000, marginM: 150 },
      );
      // Display coordinates only: ~11 cm precision reduces transmission/parse cost.
      for (const f of result.features)
        for (const ring of f.geometry.coordinates)
          for (const p of ring) {
            p[0] = Math.round(p[0] * 1e6) / 1e6;
            p[1] = Math.round(p[1] * 1e6) / 1e6;
          }
    } else {
      const layer = await localShadows(data, q.at, q.bounds, controller.signal);
      result = {
        type: "FeatureCollection",
        at: layer.at,
        state: layer.state,
        truncated: layer.truncated,
        partial_coverage: layer.partialCoverage,
        attribution: layer.attribution,
        warnings: layer.warnings,
        features: layer.polygons.map((p) => ({
          type: "Feature",
          properties: { building_id: p.id, height_source: p.source },
          geometry: {
            type: "Polygon",
            coordinates: [p.coordinates, ...p.holes].map((r) =>
              r.map((c) => [c.longitude, c.latitude]),
            ),
          },
        })),
      };
    }
    if (controller.signal.aborted) throw Error("Calculul a fost oprit.");
    const json = JSON.stringify(result);
    if (Buffer.byteLength(json) > 8_000_000)
      throw Error("Geometria depășește limita de răspuns. Apropie harta.");
    parentPort.postMessage({ type: "result", id: message.id, json });
  } catch (error) {
    parentPort.postMessage({
      type: "result",
      id: message.id,
      error: error.message,
      code: error instanceof OutsideCoverageError ? "outside" : "calculation",
      status: controller.signal.aborted ? 499 : 422,
    });
  } finally {
    controllers.delete(message.id);
  }
});
