import Constants from "expo-constants";
import { resolveCalculationUrl } from "../domain/server";
import { parseComparison } from "../domain/routes";
import type { Coordinate, RouteRequest } from "../domain/routes";
import { parseShadowLayer } from "../domain/shadows";
import type { Bounds } from "../domain/shadows";
import { parseBuildingFeatures } from "../domain/buildingResponse";
import { requestCalculation } from "./calculationClient";
const base = () =>
  resolveCalculationUrl(
    process.env.EXPO_PUBLIC_API_URL,
    Constants.expoConfig?.hostUri,
    __DEV__,
  );
export async function calculateRoutes(
  request: RouteRequest,
  signal: AbortSignal,
) {
  return parseComparison(
    await requestCalculation(base(), "/v1/routes/compare", request, signal),
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
      { bounds, focus },
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
      { at, bounds, focus, include_estimates: includeEstimates },
      signal,
    ),
    at,
  );
}
