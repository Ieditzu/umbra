import { parentPort } from "node:worker_threads";
import { withMeasuredHeights } from "../../mobile/src/engine/data.ts";
import { inspectBuilding } from "../../mobile/src/engine/measureTarget.ts";
import { withTrees } from "../../mobile/src/engine/trees.ts";
import { compareLocalRoutes } from "../../mobile/src/engine/routing.ts";
import { visibleBuildings } from "../../mobile/src/engine/buildings.ts";
import {
  localShadows,
  OutsideCoverageError,
} from "../../mobile/src/engine/overlay.ts";

import { decodeRegion } from "./tile-buildings.mjs";
import { loadCity } from "./city.mjs";
const controllers = new Map();
const idIndex = new WeakMap();
/** Building lookup by OSM id for upload verification. */
function byId(data) {
  let index = idIndex.get(data);
  if (!index) {
    index = new Map(data.buildings.map((b) => [b.id, b]));
    idIndex.set(data, index);
  }
  return index;
}
const regionCache = new Map();
const { dataPromise, treePromise } = loadCity();
const suceavaPromise = loadCity({
  city: "suceava",
  treeCatalog: treePromise,
}).dataPromise;
Promise.all([dataPromise, suceavaPromise])
  .then(([data]) =>
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
    const { measured_heights: measured, ...q } = message.payload;
    const point =
      q.origin ??
      q.point ??
      q.focus ??
      (q.bounds
        ? {
            longitude: (q.bounds[0] + q.bounds[2]) / 2,
            latitude: (q.bounds[1] + q.bounds[3]) / 2,
          }
        : null);
    const inSuceava =
      point &&
      point.longitude >= 26.09 &&
      point.longitude <= 26.41 &&
      point.latitude >= 47.59 &&
      point.latitude <= 47.77;
    let data = await (inSuceava ? suceavaPromise : dataPromise);
    if (controller.signal.aborted) throw Error("Calculul a fost oprit.");
    if (q.__region && message.kind !== "routes") {
      data = regionCache.get(q.__region.key);
      if (!data) {
        data = await decodeRegion(q.__region, controller.signal);
        const catalog = await treePromise;
        data = withTrees(data, catalog.forArea(data.imported_m));
        if (regionCache.size >= 3)
          regionCache.delete(regionCache.keys().next().value);
        regionCache.set(q.__region.key, data);
      }
    }
    data = withMeasuredHeights(data, measured);
    let result;
    if (message.kind === "verify") {
      const b =
        byId(await dataPromise).get(q.osm_building) ??
        byId(await suceavaPromise).get(q.osm_building);
      result = {
        exists: !!b,
        elevated: b?.height.source === "unsupported_elevated",
        // Phones receive corners as WGS84 and project them back: allow 5 cm of rounding.
        corner: !!b?.geometry.some((poly) =>
          poly[0].some(
            (p) => Math.hypot(p.x - q.corner.x, p.y - q.corner.y) < 0.05,
          ),
        ),
        levels: (() => {
          const levels = Number(b?.tags["building:levels"]);
          return Number.isFinite(levels) && levels > 0 && levels <= 150
            ? levels
            : null;
        })(),
      };
    } else if (message.kind === "inspect") {
      result = {
        building: inspectBuilding(data, q.point, Date.parse(q.at)),
        attribution: [
          data.metadata.attribution ?? "© OpenStreetMap contributors",
        ],
      };
    } else if (message.kind === "routes") {
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
      const layer = await localShadows(
        data,
        q.at,
        q.bounds,
        controller.signal,
        {
          displayEstimates: q.include_estimates ?? true,
          includeNeutralFootprints: false,
          focus: q.focus,
        },
      );
      if (data.metadata.dataset_kind === "building-map-only") {
        layer.attribution.unshift("OpenFreeMap · © OpenMapTiles");
        layer.warnings.push(
          "Contururi generalizate de hartă și înălțimi de randare; surse orientative, nu măsurători verificate.",
        );
      }
      result = {
        type: "FeatureCollection",
        at: layer.at,
        state: layer.state,
        sun: layer.sun,
        truncated: layer.truncated,
        partial_coverage: layer.partialCoverage,
        attribution: layer.attribution,
        warnings: layer.warnings,
        features: layer.polygons.map((p) => ({
          type: "Feature",
          properties: {
            building_id: p.id,
            height_source: p.source,
            ...(p.canopyHeight !== undefined
              ? { canopy_height: p.canopyHeight, canopy_base: p.canopyBase }
              : {}),
          },
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
