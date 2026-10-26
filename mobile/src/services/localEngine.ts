import type { Coordinate, RouteRequest } from "../domain/routes";
import type { Bounds, ShadowLayer } from "../domain/shadows";
import { initializeDataset } from "../engine/data";
import type { Dataset } from "../engine/data";
import { unpackDataset } from "../engine/packedData";
import type { PackedDataset } from "../engine/packedData";
import { compareLocalRoutes } from "../engine/routing";
import { localShadows } from "../engine/overlay";
import { task } from "../engine/task";
import { visibleBuildings } from "../engine/buildings";

let prepared: Promise<Dataset> | undefined;
function dataset(): Promise<Dataset> {
  if (!prepared) {
    // Static bundled map data is installed with the app, not fetched using GPS.
    const packed =
      require("../../assets/data/constanta-city.json") as PackedDataset;
    const work = task(new AbortController().signal, 20000);
    prepared = unpackDataset(packed, work)
      .then((raw) => initializeDataset(raw, work))
      .catch((error) => {
        prepared = undefined;
        throw error;
      });
  }
  return prepared;
}

export async function calculateRoutes(
  request: RouteRequest,
  signal: AbortSignal,
) {
  const data = await dataset();
  return compareLocalRoutes(data, request, signal);
}

export async function calculateBuildings(
  bounds: Bounds,
  signal: AbortSignal,
  focus?: Coordinate,
) {
  return visibleBuildings(await dataset(), bounds, signal, focus);
}

const overlays = new Map<string, ShadowLayer>();
export async function calculateShadows(
  at: string,
  bounds: Bounds,
  signal: AbortSignal,
): Promise<ShadowLayer> {
  const key = `${at}|${bounds.join(",")}`;
  if (signal.aborted) throw new Error("Calculul a fost oprit.");
  const cached = overlays.get(key);
  if (cached) return cached;
  const result = await localShadows(await dataset(), at, bounds, signal);
  if (signal.aborted) throw new Error("Calculul a fost oprit.");
  if (overlays.size >= 4) overlays.delete(overlays.keys().next().value!);
  overlays.set(key, result);
  return result;
}
