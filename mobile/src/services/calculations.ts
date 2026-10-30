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
export async function getElectricityPrice(signal: AbortSignal) {
  const value = await requestCalculation(base(), "/v1/electricity-price", {}, signal) as Record<string, unknown>;
  if (typeof value.price_ron_kwh !== "number" || !Number.isFinite(value.price_ron_kwh) || value.price_ron_kwh <= 0 || value.price_ron_kwh > 100 || typeof value.period !== "string" || !/^\d{4}-S[12]$/.test(value.period) || value.band !== "2500-4999" || value.source !== "Eurostat") throw new Error("Preț mediu invalid.");
  return { price: value.price_ron_kwh, period: value.period };
}
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

export async function calculateSolarPower(
  point: Coordinate,
  roofId: string,
  date: string,
  watts: number,
  tilt: number,
  azimuth: number,
  signal: AbortSignal,
): Promise<{ energy_kwh: number; min_energy_kwh: number; unshaded_kwh: number; uncertain_hours: number; blocked_hours: number; mode: "forecast" | "historical"; reference_dates: string[] }> {
  const result = await requestCalculation(base(), "/v1/solar-power", withMeasured({ point, roof_id: roofId, date, watts, tilt, azimuth }), signal) as Record<string, unknown>;
  if (result.date !== date || result.watts !== watts || result.tilt !== tilt || result.azimuth !== azimuth || result.shading_included !== true || !["forecast", "historical"].includes(result.mode as string) || !Array.isArray(result.reference_dates) || result.reference_dates.length !== (result.mode === "historical" ? 3 : 0) || !result.reference_dates.every((day: unknown) => typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day)) || typeof result.min_energy_kwh !== "number" || !Number.isFinite(result.min_energy_kwh) || result.min_energy_kwh < 0 || typeof result.unshaded_kwh !== "number" || !Number.isFinite(result.unshaded_kwh) || typeof result.uncertain_hours !== "number" || !Number.isFinite(result.uncertain_hours) || result.uncertain_hours < 0 || typeof result.blocked_hours !== "number" || !Number.isFinite(result.blocked_hours) || result.blocked_hours < 0 || typeof result.energy_kwh !== "number" || !Number.isFinite(result.energy_kwh) || result.energy_kwh < 0 || typeof result.irradiation_kwh_m2 !== "number" || !Number.isFinite(result.irradiation_kwh_m2) || result.irradiation_kwh_m2 < 0) throw new Error("Estimare solară invalidă.");
  if (result.min_energy_kwh > result.energy_kwh || result.energy_kwh > result.unshaded_kwh) throw new Error("Estimare solară invalidă.");
  return { energy_kwh: result.energy_kwh, min_energy_kwh: result.min_energy_kwh, unshaded_kwh: result.unshaded_kwh, uncertain_hours: result.uncertain_hours, blocked_hours: result.blocked_hours, mode: result.mode as "forecast" | "historical", reference_dates: result.reference_dates as string[] };
}
