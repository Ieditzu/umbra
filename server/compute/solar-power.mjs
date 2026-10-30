import { ComputeError } from "./pool.mjs";

/** Daylight forecast in Romania, before local obstructions and equipment-specific effects. */
export async function solarPower(q, { fetcher = fetch, now = Date.now() } = {}) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const date = typeof q.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? new Date(`${q.date}T00:00:00Z`) : new Date(NaN);
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  if (!q.point || !Number.isFinite(q.point.latitude) || !Number.isFinite(q.point.longitude) || q.point.latitude < 43.5 || q.point.latitude > 48.4 || q.point.longitude < 20.2 || q.point.longitude > 30 ||
      !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== q.date || date.getTime() < todayMs || date.getTime() > todayMs + 14 * 86400000 ||
      !Number.isFinite(q.watts) || q.watts < 50 || q.watts > 10000 || !Number.isFinite(q.tilt) || q.tilt < 0 || q.tilt > 90 || !Number.isFinite(q.azimuth) || q.azimuth < -180 || q.azimuth > 180)
    throw new ComputeError("Datele panoului sunt invalide.", 422, "invalid");
  const next = new Date(date.getTime() + 86400000).toISOString().slice(0, 10);
  const params = new URLSearchParams({ latitude: String(q.point.latitude), longitude: String(q.point.longitude), hourly: "global_tilted_irradiance", tilt: String(q.tilt), azimuth: String(q.azimuth), start_date: q.date, end_date: next, timezone: "Europe/Bucharest" });
  let data;
  try {
    const response = await fetcher(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw Error();
    data = await response.json();
  } catch { throw new ComputeError("Prognoza solară este temporar indisponibilă."); }
  const times = data?.hourly?.time, radiation = data?.hourly?.global_tilted_irradiance;
  if (!Array.isArray(times) || !Array.isArray(radiation) || times.length !== radiation.length || times.length > 60) throw new ComputeError("Prognoză solară invalidă.");
  const values = times.flatMap((time, index) => typeof time === "string" && time > `${q.date}T00:00` && time <= `${next}T00:00` ? [radiation[index]] : []);
  if (values.length < 23 || values.length > 25 || values.some((value) => !Number.isFinite(value) || value < 0 || value > 1600)) throw new ComputeError("Prognoza nu acoperă întreaga zi.");
  const irradiation = values.reduce((sum, value) => sum + value, 0) / 1000;
  return { date: q.date, energy_kwh: Math.round(q.watts / 1000 * irradiation * 0.86 * 100) / 100, irradiation_kwh_m2: Math.round(irradiation * 100) / 100, watts: q.watts, tilt: q.tilt, azimuth: q.azimuth, loss_percent: 14, source: "Open-Meteo", shading_included: false };
}
