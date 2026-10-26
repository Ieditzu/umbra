import { DEFAULT_SETTINGS, restoreSettings } from "./settings.ts";
import type { Settings } from "./settings.ts";
import type { MapStyle } from "./mapDisplay.ts";

export type AppPreferences = Settings & {
  mapStyle: MapStyle;
  threeD: boolean;
  showShadows: boolean;
  departureAt: string | null;
};
export const DEFAULT_PREFERENCES: AppPreferences = {
  ...DEFAULT_SETTINGS,
  mapStyle: "map",
  threeD: false,
  showShadows: true,
  departureAt: null,
};

export function restorePreferences(
  raw: string | null,
  platform: string,
): AppPreferences {
  let value: Partial<AppPreferences>;
  try {
    value = JSON.parse(raw ?? "null") ?? {};
  } catch {
    value = {};
  }
  const at =
    typeof value.departureAt === "string" ? Date.parse(value.departureAt) : NaN;
  const year = new Date(at).getUTCFullYear();
  return {
    ...restoreSettings(raw),
    mapStyle:
      value.mapStyle === "satellite"
        ? "satellite"
        : value.mapStyle === "terrain" && platform === "android"
          ? "terrain"
          : "map",
    threeD: typeof value.threeD === "boolean" ? value.threeD : false,
    showShadows:
      typeof value.showShadows === "boolean" ? value.showShadows : true,
    departureAt:
      Number.isFinite(at) && year >= 2000 && year <= 2100
        ? new Date(at).toISOString()
        : null,
  };
}

/** Persist only preferences, excluding coordinates, destinations, results and old URLs. */
export function serializePreferences(value: AppPreferences): string {
  return JSON.stringify({
    maxExtraMinutes: value.maxExtraMinutes,
    mapStyle: value.mapStyle,
    threeD: value.threeD,
    showShadows: value.showShadows,
    departureAt: value.departureAt,
  });
}
