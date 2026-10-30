import test from "node:test";
import assert from "node:assert/strict";
import { solarPower } from "./solar-power.mjs";
const now = Date.parse("2026-10-30T10:00:00Z");
const q = { point: { latitude: 44.17, longitude: 28.63 }, roof_id: "way/123", date: "2026-10-30", watts: 400, tilt: 30, azimuth: 0 };
const clear = async (times) => times.map(() => "clear");
const fixture = (start, count, irradiance = 100, direct = 100) => ({ hourly: { time: Array.from({ length: count }, (_, i) => start / 1000 + (i + 1) * 3600), global_tilted_irradiance: Array(count).fill(irradiance), direct_normal_irradiance: Array(count).fill(direct) } });
const forecast = (data) => async (url) => {
  const u = new URL(url);
  assert.equal(u.searchParams.get("azimuth"), "0");
  assert.equal(u.searchParams.get("timezone"), "Europe/Bucharest");
  assert.equal(u.searchParams.get("timeformat"), "unixtime");
  return { ok: true, json: async () => data };
};
test("integrates hourly forecast and applies direct shade without removing diffuse light", async () => {
  const weather = fixture(Date.parse("2026-10-29T22:00:00Z"), 24);
  const base = await solarPower(q, { now, fetcher: forecast(weather), shade: clear });
  const shaded = await solarPower(q, { now, fetcher: forecast(weather), shade: async (times) => times.map(() => "blocked") });
  const uncertain = await solarPower(q, { now, fetcher: forecast(weather), shade: async (times) => times.map(() => "uncertain") });
  assert.equal(base.irradiation_kwh_m2, 2.4);
  assert.equal(base.energy_kwh, 0.83);
  assert.equal(base.min_energy_kwh, base.energy_kwh);
  assert.equal(base.mode, "forecast");
  assert.ok(shaded.energy_kwh < base.energy_kwh && shaded.energy_kwh > 0);
  assert.equal(shaded.unshaded_kwh, base.energy_kwh);
  assert.equal(uncertain.energy_kwh, base.energy_kwh);
  assert.equal(uncertain.min_energy_kwh, shaded.energy_kwh);
  assert.ok(uncertain.uncertain_hours > 0);
});
test("rejects invalid dates, missing data and invalid shade responses", async () => {
  await assert.rejects(solarPower({ ...q, date: "2026-02-30" }, { now }), /invalide/);
  await assert.rejects(solarPower({ ...q, watts: -1 }, { now }), /invalide/);
  const missing = fixture(Date.parse("2026-10-29T22:00:00Z"), 24); missing.hourly.direct_normal_irradiance[3] = null;
  await assert.rejects(solarPower(q, { now, fetcher: forecast(missing) }), /întreaga zi/);
  await assert.rejects(solarPower(q, { now, fetcher: async () => { throw Error(); } }), /indisponibile/);
  await assert.rejects(solarPower(q, { now, fetcher: forecast(fixture(Date.parse("2026-10-29T22:00:00Z"), 24)), shade: async () => [] }), /umbre/);
});
test("uses all 25 local hours when daylight saving time ends", async () => {
  const weather = fixture(Date.parse("2026-10-24T21:00:00Z"), 25);
  const result = await solarPower({ ...q, date: "2026-10-25" }, { now: Date.parse("2026-10-25T10:00:00Z"), fetcher: forecast(weather), shade: clear });
  assert.equal(result.irradiation_kwh_m2, 2.5);
});
test("distant dates average three historical days without claiming a forecast", async () => {
  const years = [];
  const fetcher = async (url) => {
    const u = new URL(url), day = u.searchParams.get("start_date");
    assert.equal(u.hostname, "archive-api.open-meteo.com");
    years.push(day);
    const utcOffset = day.endsWith("07-15") ? 3 : 2;
    const start = Date.parse(`${day}T00:00:00Z`) - utcOffset * 3600000;
    return { ok: true, json: async () => fixture(start, 24) };
  };
  const result = await solarPower({ ...q, date: "2027-07-15" }, { now, fetcher, shade: clear });
  assert.equal(result.mode, "historical");
  assert.deepEqual(years, ["2025-07-15", "2024-07-15", "2023-07-15"]);
  assert.deepEqual(result.reference_dates, years);
  assert.equal(result.energy_kwh, 0.83);
  const further = await solarPower({ ...q, date: "2050-07-15" }, { now, fetcher, shade: clear });
  assert.equal(further.mode, "historical");
  assert.deepEqual(further.reference_dates, ["2025-07-15", "2024-07-15", "2023-07-15"]);
});
