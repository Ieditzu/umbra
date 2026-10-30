import { ComputeError } from "./pool.mjs";
import { solarPosition } from "../../mobile/src/engine/solar.ts";

/** Approximate clear-sky potential with direct-beam rooftop shade. */
export async function solarPower(q, { shade = async (times) => times.map(() => "uncertain") } = {}) {
  const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit" });
  const date = typeof q.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? new Date(`${q.date}T00:00:00Z`) : new Date(NaN);
  if (!q.point || !Number.isFinite(q.point.latitude) || !Number.isFinite(q.point.longitude) || q.point.latitude < 43.5 || q.point.latitude > 48.4 || q.point.longitude < 20.2 || q.point.longitude > 30 ||
      typeof q.roof_id !== "string" || !/^(way|relation)\/\d{1,15}$/.test(q.roof_id) ||
      !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== q.date || date.getUTCFullYear() < 2000 || date.getUTCFullYear() > 2100 ||
      !Number.isFinite(q.watts) || q.watts < 50 || q.watts > 1000000 || !Number.isFinite(q.tilt) || q.tilt < 0 || q.tilt > 90 || !Number.isFinite(q.azimuth) || q.azimuth < -180 || q.azimuth > 180)
    throw new ComputeError("Datele panoului sunt invalide.", 422, "invalid");
  const tilt = q.tilt * Math.PI / 180;
  const hours = [];
  // UTC hourly boundaries cover Romania's local day, including DST changes.
  for (let i = -24; i <= 48; i++) {
    const end = date.getTime() + i * 3600000;
    if (localDay.format(new Date(end - 1)) !== q.date) continue;
    const at = end - 1800000;
    const sun = solarPosition(at, q.point);
    const elevation = sun.elevation * Math.PI / 180;
    const sinElevation = Math.max(0, Math.sin(elevation));
    const dayOfYear = Math.floor((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86400000);
    const airMass = sinElevation > 0 ? 1 / (sinElevation + 0.50572 * (sun.elevation + 6.07995) ** -1.6364) : Infinity;
    const direct = 1361 * (1 + 0.033 * Math.cos(2 * Math.PI * dayOfYear / 365)) * 0.7 ** airMass ** 0.678;
    const cosine = Math.max(0, sinElevation * Math.cos(tilt) + Math.cos(elevation) * Math.sin(tilt) * Math.cos((sun.azimuth - (q.azimuth + 180)) * Math.PI / 180));
    const beam = direct * cosine;
    const diffuse = 0.1 * direct * sinElevation;
    const total = beam + diffuse * (1 + Math.cos(tilt)) / 2 + (direct * sinElevation + diffuse) * 0.2 * (1 - Math.cos(tilt)) / 2;
    hours.push({ at, total, beam });
  }
  const shades = await shade(hours.map((hour) => hour.at));
  if (!Array.isArray(shades) || shades.length !== hours.length || shades.some((state) => !["blocked", "uncertain", "clear"].includes(state))) throw new ComputeError("Calculul umbrei nu este disponibil.");
  let total = 0, definite = 0, possible = 0, blockedHours = 0, uncertainHours = 0;
  hours.forEach((hour, index) => {
    total += hour.total;
    if (hour.beam <= 0) return;
    if (shades[index] === "blocked") { definite += hour.beam; blockedHours++; }
    if (shades[index] === "uncertain") { possible += hour.beam; uncertainHours++; }
  });
  const energy = (radiation) => Math.round(q.watts / 1000 * (radiation / 1000) * 0.86 * 100) / 100;
  return { date: q.date, energy_kwh: energy(total - definite), min_energy_kwh: energy(Math.max(0, total - definite - possible)), unshaded_kwh: energy(total), irradiation_kwh_m2: Math.round(total / 10) / 100, watts: q.watts, tilt: q.tilt, azimuth: q.azimuth, loss_percent: 14, source: "clear-sky model", mode: "clear_sky", reference_dates: [], shading_included: true, blocked_hours: blockedHours, uncertain_hours: uncertainHours };
}
