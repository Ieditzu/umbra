import test from "node:test";
import assert from "node:assert/strict";
import { solarPower } from "./solar-power.mjs";
const q = { point: { latitude: 44.17, longitude: 28.63 }, roof_id: "way/123", date: "2026-06-21", watts: 400, tilt: 30, azimuth: 0 };
const clear = async (times) => times.map(() => "clear");

test("clear sky potential accounts for seasons and building shade", async () => {
  const summer = await solarPower(q, { shade: clear });
  const winter = await solarPower({ ...q, date: "2026-12-21" }, { shade: clear });
  const blocked = await solarPower(q, { shade: async (times) => times.map(() => "blocked") });
  const uncertain = await solarPower(q, { shade: async (times) => times.map(() => "uncertain") });
  assert.equal(summer.mode, "clear_sky");
  assert.ok(summer.energy_kwh > winter.energy_kwh && winter.energy_kwh > 0);
  assert.ok(blocked.energy_kwh < summer.energy_kwh && blocked.energy_kwh > 0);
  assert.equal(blocked.unshaded_kwh, summer.energy_kwh);
  assert.equal(uncertain.energy_kwh, summer.energy_kwh);
  assert.equal(uncertain.min_energy_kwh, blocked.energy_kwh);
  assert.ok(uncertain.uncertain_hours > 0);
});

test("local days include daylight saving transitions and distant dates", async () => {
  for (const [date, expected] of [["2026-03-29", 23], ["2026-10-25", 25], ["2050-07-15", 24]]) {
    let count = 0;
    const result = await solarPower({ ...q, date }, { shade: async (times) => { count = times.length; return times.map(() => "clear"); } });
    assert.equal(count, expected);
    assert.ok(result.energy_kwh > 0);
  }
});

test("rejects invalid panel values and shade responses", async () => {
  await assert.rejects(solarPower({ ...q, date: "2026-02-30" }), /invalide/);
  await assert.rejects(solarPower({ ...q, watts: -1 }), /invalide/);
  await assert.rejects(solarPower(q, { shade: async () => [] }), /umbre/);
});
