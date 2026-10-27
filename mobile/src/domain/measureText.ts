import type { BuildingEstimate } from "./measurements.ts";
import { methodLabel } from "./measurements.ts";
import type { Height } from "../engine/data.ts";
import type { SunAdvice, Window } from "../engine/shadowMeasure.ts";

/** Romanian decimal comma, one decimal. */
export const metres = (v: number, digits = 1) =>
  `${v.toFixed(digits).replace(".", ",")} m`;
const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SV", "V", "NV"];
export function compass(azimuth: number): string {
  return DIRECTIONS[Math.round((((azimuth % 360) + 360) % 360) / 45) % 8];
}
/** Building height line in the style of docs/shadow-heights.md §6.5. */
export function heightLabel(
  height: Height,
  levels: number | null,
  estimate: BuildingEstimate | null,
): string {
  if (estimate?.confirmed)
    return `Măsurată: ${metres(estimate.height)} ± ${metres(estimate.sigma).replace(" m", "")} · ${estimate.count} ${estimate.count === 1 ? "măsurătoare" : "măsurători"} · ${estimate.methods.map((m) => methodLabel[m]).join(" + ")}`;
  if (height.source === "osm_height_tag")
    return `${metres(height.low_m)} · din OpenStreetMap`;
  if (height.source === "estimated_from_levels")
    return `Estimat: ${levels ?? "?"} etaje → ${Math.round(height.low_m)}–${Math.round(height.high_m)} m`;
  if (height.source === "unsupported_elevated")
    return "Clădire suspendată sau doar acoperiș";
  return "Înălțime necunoscută";
}
export const adviceLabel: Record<SunAdvice, string> = {
  too_low: "Soarele e prea jos (sub 10°): nu se poate măsura acum.",
  low: "Soare jos: umbre lungi care pot atinge alte clădiri și margine încețoșată.",
  good: "Moment bun pentru măsurare.",
  high: "Soare sus: fiecare metru greșit pe sol înseamnă mai mult pe înălțime.",
  too_high:
    "Soare foarte sus: eroarea e mare. Revino dimineața, seara sau în altă zi.",
};
export function windowsLabel(windows: Window[], now: number): string {
  const time = (t: number) =>
    new Date(t).toLocaleTimeString("ro-RO", {
      hour: "2-digit",
      minute: "2-digit",
    });
  const upcoming = windows.filter((w) => w.end > now);
  if (!upcoming.length) return "Azi nu mai sunt intervale bune.";
  return `Intervale bune azi: ${upcoming.map((w) => `${time(Math.max(w.start, now))}–${time(w.end)}`).join(", ")}`;
}
