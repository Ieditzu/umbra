import { ComputeError } from "./pool.mjs";

/** Satellite-based monthly daily profile with direct-beam rooftop shade. */
export async function solarPower(q, { fetcher = fetch, shade = async (times) => times.map(() => "uncertain") } = {}) {
  const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit" });
  const date = typeof q.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? new Date(`${q.date}T00:00:00Z`) : new Date(NaN);
  if (!q.point || !Number.isFinite(q.point.latitude) || !Number.isFinite(q.point.longitude) || q.point.latitude < 43.5 || q.point.latitude > 48.4 || q.point.longitude < 20.2 || q.point.longitude > 30 ||
      typeof q.roof_id !== "string" || !/^(way|relation)\/\d{1,15}$/.test(q.roof_id) ||
      !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== q.date || date.getUTCFullYear() < 2000 || date.getUTCFullYear() > 2100 ||
      !Number.isFinite(q.watts) || q.watts < 50 || q.watts > 1000000 || !Number.isFinite(q.tilt) || q.tilt < 0 || q.tilt > 90 || !Number.isFinite(q.azimuth) || q.azimuth < -180 || q.azimuth > 180)
    throw new ComputeError("Datele panoului sunt invalide.", 422, "invalid");
  const params = new URLSearchParams({ lat: String(q.point.latitude), lon: String(q.point.longitude), month: String(date.getUTCMonth() + 1), angle: String(q.tilt), aspect: String(q.azimuth), global: "1", outputformat: "json" });
  let data;
  try {
    const response = await fetcher(`https://re.jrc.ec.europa.eu/api/v5_3/DRcalc?${params}`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error();
    data = await response.json();
  } catch { throw new ComputeError("Datele solare PVGIS nu sunt disponibile."); }
  const profile = data?.outputs?.daily_profile;
  const years = data?.inputs?.meteo_data;
  if (!Array.isArray(profile) || profile.length !== 24 || !Number.isInteger(years?.year_min) || !Number.isInteger(years?.year_max) || years.year_min < 1900 || years.year_max < years.year_min || years.year_max > 2100) throw new ComputeError("Date solare PVGIS invalide.");
  const byHour = new Map();
  for (const row of profile) {
    if (row.month !== date.getUTCMonth() + 1 || typeof row.time !== "string" || !/^(?:[01]\d|2[0-3]):00$/.test(row.time) || !Number.isFinite(row["G(i)"]) || row["G(i)"] < 0 || row["G(i)"] > 1600 || !Number.isFinite(row["Gb(i)"]) || row["Gb(i)"] < 0 || row["Gb(i)"] > row["G(i)"] + 1) throw new ComputeError("Date solare PVGIS invalide.");
    byHour.set(Number(row.time.slice(0, 2)), { total: row["G(i)"], beam: Math.min(row["G(i)"], row["Gb(i)"]) });
  }
  if (byHour.size !== 24) throw new ComputeError("Date solare PVGIS incomplete.");
  const hours = [];
  // UTC hourly boundaries cover Romania's local day, including DST changes.
  for (let i = -24; i <= 48; i++) {
    const end = date.getTime() + i * 3600000;
    if (localDay.format(new Date(end - 1)) !== q.date) continue;
    const at = end - 1800000;
    hours.push({ at, ...byHour.get(new Date(at).getUTCHours()) });
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
  return { date: q.date, energy_kwh: energy(total - definite), min_energy_kwh: energy(Math.max(0, total - definite - possible)), unshaded_kwh: energy(total), irradiation_kwh_m2: Math.round(total / 10) / 100, watts: q.watts, tilt: q.tilt, azimuth: q.azimuth, loss_percent: 14, source: "PVGIS", mode: "historical", reference_dates: [String(years.year_min), String(years.year_max)], shading_included: true, blocked_hours: blockedHours, uncertain_hours: uncertainHours };
}
