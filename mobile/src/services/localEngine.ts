import type { RouteRequest } from "../domain/routes";
import type { Bounds, ShadowLayer } from "../domain/shadows";
import { initializeDataset } from "../engine/data";
import type { Dataset, RawDataset } from "../engine/data";
import { compareLocalRoutes } from "../engine/routing";
import { localShadows } from "../engine/overlay";
import { task } from "../engine/task";

let prepared: Promise<Dataset> | undefined;
function dataset(): Promise<Dataset> {
  if (!prepared) {
    // Static bundled map data is installed with the app, not fetched using GPS.
    const raw =
      require("../../assets/data/constanta-central.json") as RawDataset;
    prepared = initializeDataset(
      raw,
      task(new AbortController().signal, 20000),
    ).catch((error) => {
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
