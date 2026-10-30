import test from "node:test";
import assert from "node:assert/strict";
import { solarPower } from "./solar-power.mjs";
const q = { point: { latitude: 44.17, longitude: 28.63 }, roof_id: "way/123", date: "2026-06-21", watts: 400, tilt: 30, azimuth: 0 };
const clear = async (times) => times.map(() => "clear");
const fetcher = async (url) => {
  const u = new URL(url), month = Number(u.searchParams.get("month"));
  assert.equal(u.hostname, "re.jrc.ec.europa.eu");
  assert.equal(u.searchParams.get("angle"), "30");
  const radiation = month === 12 ? 50 : 100;
  return { ok: true, json: async () => ({ inputs: { meteo_data: { year_min: 2005, year_max: 2023 } }, outputs: { daily_profile: Array.from({ length: 24 }, (_, i) => ({ month, time: `${String(i).padStart(2, "0")}:00`, "G(i)": i >= 6 && i < 18 ? radiation : 0, "Gb(i)": i >= 6 && i < 18 ? radiation * 0.8 : 0 })) } }) };
};

test("satellite-based monthly profiles account for season and building shade", async () => {
  const options = { fetcher, shade: clear };
  const summer = await solarPower(q, options);
  const winter = await solarPower({ ...q, date: "2026-12-21" }, options);
  const blocked = await solarPower(q, { fetcher, shade: async (times) => times.map(() => "blocked") });
  const uncertain = await solarPower(q, { fetcher, shade: async (times) => times.map(() => "uncertain") });
  assert.equal(summer.mode, "historical");
  assert.deepEqual(summer.reference_dates, ["2005", "2023"]);
  assert.ok(summer.energy_kwh > winter.energy_kwh && winter.energy_kwh > 0);
  const large = await solarPower({ ...q, watts: 20000 }, options);
  assert.ok(large.energy_kwh > summer.energy_kwh * 49);
  assert.ok(blocked.energy_kwh < summer.energy_kwh && blocked.energy_kwh > 0);
  assert.equal(blocked.unshaded_kwh, summer.energy_kwh);
  assert.equal(uncertain.min_energy_kwh, blocked.energy_kwh);
  assert.ok(uncertain.uncertain_hours > 0);
});

test("local days include daylight saving transitions and distant dates", async () => {
  for (const [date, expected] of [["2026-03-29", 23], ["2026-10-25", 25], ["2050-07-15", 24]]) {
    let count = 0;
    const result = await solarPower({ ...q, date }, { fetcher, shade: async (times) => { count = times.length; return times.map(() => "clear"); } });
    assert.equal(count, expected);
    assert.ok(result.energy_kwh > 0);
  }
});

test("rejects invalid values, missing PVGIS data and shade responses", async () => {
  await assert.rejects(solarPower({ ...q, date: "2026-02-30" }), /invalide/);
  await assert.rejects(solarPower({ ...q, watts: -1 }), /invalide/);
  await assert.rejects(solarPower(q, { fetcher: async () => { throw Error(); } }), /PVGIS/);
  await assert.rejects(solarPower(q, { fetcher: async () => ({ ok: true, json: async () => ({}) }) }), /PVGIS/);
  await assert.rejects(solarPower(q, { fetcher, shade: async () => [] }), /umbre/);
});
