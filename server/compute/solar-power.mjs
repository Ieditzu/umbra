import { ComputeError } from "./pool.mjs";

/** Forecast for near dates; recent historical days for seasonal comparisons. */
export async function solarPower(q, { fetcher = fetch, now = Date.now() } = {}) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const date = typeof q.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? new Date(`${q.date}T00:00:00Z`) : new Date(NaN);
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  if (!q.point || !Number.isFinite(q.point.latitude) || !Number.isFinite(q.point.longitude) || q.point.latitude < 43.5 || q.point.latitude > 48.4 || q.point.longitude < 20.2 || q.point.longitude > 30 ||
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
  const irradiation = await Promise.all(days.map(async (day) => {
    const next = new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    const params = new URLSearchParams({ latitude: String(q.point.latitude), longitude: String(q.point.longitude), hourly: "global_tilted_irradiance", tilt: String(q.tilt), azimuth: String(q.azimuth), start_date: day, end_date: next, timezone: "Europe/Bucharest" });
    let data;
    try {
      const host = isForecast ? "https://api.open-meteo.com/v1/forecast" : "https://archive-api.open-meteo.com/v1/archive";
      const response = await fetcher(`${host}?${params}`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw Error();
      data = await response.json();
    } catch { throw new ComputeError("Datele solare sunt temporar indisponibile."); }
    const times = data?.hourly?.time, radiation = data?.hourly?.global_tilted_irradiance;
    if (!Array.isArray(times) || !Array.isArray(radiation) || times.length !== radiation.length || times.length > 60) throw new ComputeError("Date solare invalide.");
    const values = times.flatMap((time, index) => typeof time === "string" && time > `${day}T00:00` && time <= `${next}T00:00` ? [radiation[index]] : []);
    if (values.length < 23 || values.length > 25 || values.some((value) => !Number.isFinite(value) || value < 0 || value > 1600)) throw new ComputeError("Datele nu acoperă întreaga zi.");
    return values.reduce((sum, value) => sum + value, 0) / 1000;
  }));
  const average = irradiation.reduce((sum, value) => sum + value, 0) / irradiation.length;
  return { date: q.date, energy_kwh: Math.round(q.watts / 1000 * average * 0.86 * 100) / 100, irradiation_kwh_m2: Math.round(average * 100) / 100, watts: q.watts, tilt: q.tilt, azimuth: q.azimuth, loss_percent: 14, source: "Open-Meteo", mode: isForecast ? "forecast" : "historical", reference_dates: isForecast ? [] : days, shading_included: false };
}
