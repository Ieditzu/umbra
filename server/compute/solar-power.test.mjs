import test from "node:test";
import assert from "node:assert/strict";
import { solarPower } from "./solar-power.mjs";
const now = Date.parse("2026-10-30T10:00:00Z");
const q = { point: { latitude: 44.17, longitude: 28.63 }, date: "2026-10-30", watts: 400, tilt: 30, azimuth: 0 };
const hours = Array.from({ length: 24 }, (_, i) => i === 23 ? "2026-10-31T00:00" : `2026-10-30T${String(i + 1).padStart(2, "0")}:00`);
const forecast = (values) => async (url) => {
  const u = new URL(url);
  assert.equal(u.searchParams.get("azimuth"), "0");
  assert.equal(u.searchParams.get("timezone"), "Europe/Bucharest");
  return { ok: true, json: async () => ({ hourly: { time: hours, global_tilted_irradiance: values } }) };
};
test("integrates preceding-hour radiation for the chosen day and panel capacity", async () => {
  const result = await solarPower(q, { now, fetcher: forecast(Array(24).fill(100)) });
  assert.equal(result.irradiation_kwh_m2, 2.4);
  assert.equal(result.energy_kwh, 0.83);
  assert.equal(result.shading_included, false);
  assert.equal(result.mode, "forecast");
  assert.deepEqual(result.reference_dates, []);
});
test("rejects invalid dates and incomplete or unavailable forecasts", async () => {
  await assert.rejects(solarPower({ ...q, date: "2026-02-30" }, { now }), /invalide/);
  await assert.rejects(solarPower({ ...q, watts: -1 }, { now }), /invalide/);
  const missing = Array(24).fill(100); missing[3] = null;
  await assert.rejects(solarPower(q, { now, fetcher: forecast(missing) }), /întreaga zi/);
  await assert.rejects(solarPower(q, { now, fetcher: async () => { throw Error(); } }), /indisponibile/);
});

test("uses every local hour on daylight saving transition days", async () => {
  const date = "2026-10-25";
  const ts = ["2026-10-25T01:00", "2026-10-25T02:00", "2026-10-25T03:00", "2026-10-25T03:00", ...Array.from({length: 20}, (_, i) => `2026-10-25T${String(i + 4).padStart(2, "0")}:00`), "2026-10-26T00:00"];
  const result = await solarPower({ ...q, date }, { now: Date.parse("2026-10-25T10:00:00Z"), fetcher: async () => ({ ok: true, json: async () => ({ hourly: { time: ts, global_tilted_irradiance: Array(25).fill(100) } }) }) });
  assert.equal(result.irradiation_kwh_m2, 2.5);
});


test("distant summer and winter dates average three past days without claiming a forecast", async () => {
  const years = [];
  const fetcher = async (url) => {
    const u = new URL(url);
    assert.equal(u.hostname, "archive-api.open-meteo.com");
    const day = u.searchParams.get("start_date");
    years.push(day);
    const next = new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    const times = Array.from({length: 24}, (_, i) => i === 23 ? `${next}T00:00` : `${day}T${String(i + 1).padStart(2, "0")}:00`);
    return { ok: true, json: async () => ({ hourly: { time: times, global_tilted_irradiance: Array(24).fill(100) } }) };
  };
  const result = await solarPower({ ...q, date: "2027-07-15" }, { now, fetcher });
  assert.equal(result.mode, "historical");
  assert.deepEqual(years, ["2025-07-15", "2024-07-15", "2023-07-15"]);
  assert.deepEqual(result.reference_dates, years);
  assert.equal(result.energy_kwh, 0.83);
  const winter = await solarPower({ ...q, date: "2027-01-15" }, { now, fetcher });
  assert.equal(winter.mode, "historical");
  assert.equal(winter.reference_dates[0], "2025-01-15");
});
