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

// Bundled Constanța snapshot with mapped trees and satellite canopies.
// Shared by the compute worker and offline analyses (route-effect.mjs).
export function loadCity({ copernicus = true } = {}) {
  const treePromise = (async () => {
    const packed = JSON.parse(
      await readFile(
        new URL("../../mobile/assets/data/romania-trees.json", import.meta.url),
        "utf8",
      ),
    );
    if (packed.format !== "umbra-gzip-json-v1" || packed.raw_bytes > 80_000_000)
      throw Error("Invalid tree snapshot");
    const decoded = gunzipSync(Buffer.from(packed.payload, "base64"), {
      maxOutputLength: 80_000_000,
    });
    if (decoded.length !== packed.raw_bytes)
      throw Error("Tree snapshot size mismatch");
    return new TreeCatalog(JSON.parse(decoded.toString("utf8")));
  })();
  const canopyPromise = (async () => {
    const packed = JSON.parse(
      await readFile(
        new URL(
          "../../mobile/assets/data/constanta-canopy.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    if (packed.format !== "umbra-gzip-json-v1" || packed.raw_bytes > 40_000_000)
      throw Error("Invalid canopy snapshot");
    const decoded = gunzipSync(Buffer.from(packed.payload, "base64"), {
      maxOutputLength: 40_000_000,
    });
    if (decoded.length !== packed.raw_bytes)
      throw Error("Canopy snapshot size mismatch");
    const raw = JSON.parse(decoded.toString("utf8"));
    if (raw.schema_version !== 1) throw Error("Invalid canopy schema");
    return raw.polygons;
  })();
  const dataPromise = (async () => {
    const packed = JSON.parse(
      await readFile(
        new URL(
          "../../mobile/assets/data/constanta-city.json",
          import.meta.url,
        ),
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
    const [data, catalog, canopies] = await Promise.all([
      initializeDataset(
        JSON.parse(decoded.toString("utf8")),
        task(new AbortController().signal, 60000),
      ),
      treePromise,
      canopyPromise,
    ]);
    const raster = copernicus
      ? JSON.parse(
          await readFile(
            new URL(
              "../../mobile/assets/data/constanta-heights-2012.json",
              import.meta.url,
            ),
            "utf8",
          ),
        )
      : null;
    if (
      raster &&
      (raster.schema_version !== 1 ||
        !raster.values ||
        typeof raster.values !== "object" ||
        Array.isArray(raster.values))
    )
      throw Error("Invalid Copernicus heights");
    return withSatelliteCanopies(
      withTrees(
        raster ? withCopernicusHeights(data, raster.values) : data,
        catalog.forArea(data.imported_m),
      ),
      canopies,
    );
  })();
  return { dataPromise, treePromise };
}
