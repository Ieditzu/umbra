import { ComputeError } from "./pool.mjs";
import { solarPosition } from "../../mobile/src/engine/solar.ts";

/** Forecast or a seasonal historical sample, with direct-beam rooftop shade. */
export async function solarPower(q, { fetcher = fetch, now = Date.now(), shade = async (times) => times.map(() => "uncertain") } = {}) {
  const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit" });
  const today = localDay.format(now);
  const date = typeof q.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? new Date(`${q.date}T00:00:00Z`) : new Date(NaN);
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  if (!q.point || !Number.isFinite(q.point.latitude) || !Number.isFinite(q.point.longitude) || q.point.latitude < 43.5 || q.point.latitude > 48.4 || q.point.longitude < 20.2 || q.point.longitude > 30 ||
      typeof q.roof_id !== "string" || !/^(way|relation)\/\d{1,15}$/.test(q.roof_id) ||
      !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== q.date || date.getUTCFullYear() < new Date(todayMs).getUTCFullYear() || date.getUTCFullYear() > new Date(todayMs).getUTCFullYear() + 1 ||
      !Number.isFinite(q.watts) || q.watts < 50 || q.watts > 10000 || !Number.isFinite(q.tilt) || q.tilt < 0 || q.tilt > 90 || !Number.isFinite(q.azimuth) || q.azimuth < -180 || q.azimuth > 180)
    throw new ComputeError("Datele panoului sunt invalide.", 422, "invalid");
  const isForecast = date.getTime() >= todayMs && date.getTime() <= todayMs + 14 * 86400000;
  const days = [];
  if (isForecast) days.push(q.date);
  else {
    const monthDay = q.date.slice(5);
    // Leap-day comparisons use the three most recent leap years.
    for (let year = new Date(todayMs).getUTCFullYear() - 1; days.length < 3; year--) {
      const candidate = `${year}-${monthDay}`;
      const parsed = new Date(`${candidate}T00:00:00Z`);
      if (parsed.toISOString().slice(0, 10) === candidate) days.push(candidate);
    }
  }
  const daily = await Promise.all(days.map(async (day) => {
    const next = new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    const params = new URLSearchParams({ latitude: String(q.point.latitude), longitude: String(q.point.longitude), hourly: "global_tilted_irradiance,direct_normal_irradiance", tilt: String(q.tilt), azimuth: String(q.azimuth), start_date: day, end_date: next, timezone: "Europe/Bucharest", timeformat: "unixtime" });
    let data;
    try {
      const host = isForecast ? "https://api.open-meteo.com/v1/forecast" : "https://archive-api.open-meteo.com/v1/archive";
      const response = await fetcher(`${host}?${params}`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw Error();
      data = await response.json();
    } catch { throw new ComputeError("Datele solare sunt temporar indisponibile."); }
    const times = data?.hourly?.time, radiation = data?.hourly?.global_tilted_irradiance, direct = data?.hourly?.direct_normal_irradiance;
    if (!Array.isArray(times) || !Array.isArray(radiation) || !Array.isArray(direct) || times.length !== radiation.length || times.length !== direct.length || times.length > 60) throw new ComputeError("Date solare invalide.");
    const values = times.flatMap((time, index) => Number.isSafeInteger(time) && localDay.format(new Date((time - 1) * 1000)) === day ? [{ at: time * 1000 - 1800000, total: radiation[index], direct: direct[index] }] : []);
    if (values.length < 23 || values.length > 25 || values.some(({ total, direct: dni }) => !Number.isFinite(total) || total < 0 || total > 1600 || !Number.isFinite(dni) || dni < 0 || dni > 1600)) throw new ComputeError("Datele nu acoperă întreaga zi.");
    return values;
  }));
  const hours = daily.flat();
  const shades = await shade(hours.map((hour) => hour.at));
  if (!Array.isArray(shades) || shades.length !== hours.length || shades.some((state) => !["blocked", "uncertain", "clear"].includes(state))) throw new ComputeError("Calculul umbrei nu este disponibil.");
  const tilt = q.tilt * Math.PI / 180;
  let total = 0, definite = 0, possible = 0, blockedHours = 0, uncertainHours = 0;
  hours.forEach((hour, index) => {
    total += hour.total;
    const sun = solarPosition(hour.at, q.point);
    const elevation = sun.elevation * Math.PI / 180;
    const difference = (sun.azimuth - (q.azimuth + 180)) * Math.PI / 180;
    const cosine = Math.max(0, Math.sin(elevation) * Math.cos(tilt) + Math.cos(elevation) * Math.sin(tilt) * Math.cos(difference));
    const beam = sun.elevation > 0 ? Math.min(hour.total, hour.direct * cosine) : 0;
    if (beam <= 0) return;
    if (shades[index] === "blocked") { definite += beam; blockedHours++; }
    if (shades[index] === "uncertain") { possible += beam; uncertainHours++; }
  });
  const energy = (radiation) => Math.round(q.watts / 1000 * (radiation / days.length / 1000) * 0.86 * 100) / 100;
  return { date: q.date, energy_kwh: energy(total - definite), min_energy_kwh: energy(Math.max(0, total - definite - possible)), unshaded_kwh: energy(total), irradiation_kwh_m2: Math.round(total / days.length / 10) / 100, watts: q.watts, tilt: q.tilt, azimuth: q.azimuth, loss_percent: 14, source: "Open-Meteo", mode: isForecast ? "forecast" : "historical", reference_dates: isForecast ? [] : days, shading_included: true, blocked_hours: blockedHours / days.length, uncertain_hours: uncertainHours / days.length };
}
