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

import { unproject } from "../../mobile/src/engine/geometry.ts";
import { decodeRegion } from "./tile-buildings.mjs";
import { cityCatalog, loadAreas, loadTreeCatalog } from "./city.mjs";
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
const catalog = cityCatalog();
const treePromise = loadTreeCatalog();
// Decoded areas are large (roughly 0.2–0.6 GB each); keep only recent ones per worker.
const AREA_CACHE = Math.max(
  1,
  Math.min(16, Number(process.env.UMBRA_CITY_CACHE) || 3),
);
const areaCache = new Map();
function areaData(areas) {
  const key = areas
    .map((a) => a.id)
    .sort()
    .join("+");
  let promise = areaCache.get(key);
  if (promise) {
    areaCache.delete(key);
  } else {
    promise = loadAreas(areas, { treeCatalog: treePromise });
    promise.catch(() => areaCache.delete(key));
  }
  areaCache.set(key, promise);
  while (areaCache.size > AREA_CACHE)
    areaCache.delete(areaCache.keys().next().value);
  return promise;
}
/** Answer cancellation promptly; a city load keeps running and stays cached for a retry. */
function untilAborted(promise, signal) {
  return new Promise((resolve, reject) => {
    const stop = () => reject(Error("Calculul a fost oprit."));
    if (signal.aborted) return stop();
    signal.addEventListener("abort", stop, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", stop));
  });
}
const NO_DATA =
  "Pentru această zonă nu există încă date pietonale și de clădiri pregătite.";
treePromise
  .then(() =>
    parentPort.postMessage({
      type: "ready",
      areas: catalog.areas.length,
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
    let data;
    if (message.kind === "routes") {
      const areas = catalog.forRoute(q.origin, q.destination);
      if (!areas)
        throw new OutsideCoverageError(
          catalog.at(q.origin) || catalog.at(q.destination)
            ? "Punctele alese sunt în zone fără o rețea pietonală comună. Alege o destinație mai apropiată."
            : "Pentru punctele alese nu există încă date pietonale pregătite.",
        );
      data = await untilAborted(areaData(areas), controller.signal);
    } else if (q.__region) {
      data = regionCache.get(q.__region.key);
      if (!data) {
        data = await decodeRegion(q.__region, controller.signal);
        const trees = await treePromise;
        data = withTrees(data, trees.forArea(data.imported_m));
        if (regionCache.size >= 3)
          regionCache.delete(regionCache.keys().next().value);
        regionCache.set(q.__region.key, data);
      }
    } else {
      const point =
        message.kind === "verify"
          ? unproject(q.corner)
          : (q.point ??
            q.focus ?? {
              longitude: (q.bounds[0] + q.bounds[2]) / 2,
              latitude: (q.bounds[1] + q.bounds[3]) / 2,
            });
      const area = catalog.at(point);
      if (!area) {
        // Measuring outside bundled areas finds no OSM building rather than failing.
        if (message.kind !== "verify" && message.kind !== "inspect")
          throw new OutsideCoverageError(NO_DATA);
      } else data = await untilAborted(areaData([area]), controller.signal);
    }
    if (controller.signal.aborted) throw Error("Calculul a fost oprit.");
    if (data) data = withMeasuredHeights(data, measured);
    let result;
    if (message.kind === "verify") {
      const b = data ? byId(data).get(q.osm_building) : undefined;
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
        building: data
          ? inspectBuilding(data, q.point, Date.parse(q.at))
          : null,
        attribution: [
          data?.metadata.attribution ?? "© OpenStreetMap contributors",
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
