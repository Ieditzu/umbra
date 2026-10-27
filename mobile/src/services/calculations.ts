import Constants from "expo-constants";
import { resolveCalculationUrl } from "../domain/server";
import { parseComparison } from "../domain/routes";
import type { Coordinate, RouteRequest } from "../domain/routes";
import { parseShadowLayer } from "../domain/shadows";
import type { Bounds } from "../domain/shadows";
import { parseBuildingFeatures } from "../domain/buildingResponse";
import { parseMeasureTarget } from "../domain/measureResponse";
import type { MeasuredHeight } from "../domain/measurements";
import { requestCalculation } from "./calculationClient";
const base = () =>
  resolveCalculationUrl(
    process.env.EXPO_PUBLIC_API_URL,
    Constants.expoConfig?.hostUri,
    __DEV__,
  );
// Confirmed on-phone measurements. Only building ids and height ranges leave the phone.
let measured: MeasuredHeight[] = [];
export function setMeasuredHeights(list: MeasuredHeight[]) {
  measured = list;
}
/** Omitted when empty, so a PC server without this feature keeps working. */
const withMeasured = <T extends object>(payload: T) =>
  measured.length ? { ...payload, measured_heights: measured } : payload;
export async function calculateRoutes(
  request: RouteRequest,
  signal: AbortSignal,
) {
  return parseComparison(
    await requestCalculation(
      base(),
      "/v1/routes/compare",
      withMeasured(request),
      signal,
    ),
    request,
  );
}
export async function calculateBuildings(
  bounds: Bounds,
  signal: AbortSignal,
  focus?: Coordinate,
) {
  return parseBuildingFeatures(
    await requestCalculation(
      base(),
      "/v1/buildings",
      withMeasured({ bounds, focus }),
      signal,
    ),
  );
}
export async function calculateShadows(
  at: string,
  bounds: Bounds,
  signal: AbortSignal,
  includeEstimates = true,
  focus?: Coordinate,
) {
  return parseShadowLayer(
    await requestCalculation(
      base(),
      "/v1/shadows",
      withMeasured({ at, bounds, focus, include_estimates: includeEstimates }),
      signal,
    ),
    at,
  );
}
export async function inspectBuilding(
  point: Coordinate,
  at: string,
  signal: AbortSignal,
) {
  return parseMeasureTarget(
    await requestCalculation(
      base(),
      "/v1/buildings/inspect",
      withMeasured({ point, at }),
      signal,
    ),
  );
}
