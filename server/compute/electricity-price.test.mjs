import test from "node:test";
import assert from "node:assert/strict";
import { createElectricityPriceService } from "./electricity-price.mjs";

test("uses the latest available Romanian household price and caches it", async () => {
  let calls = 0;
  const service = createElectricityPriceService(async () => {
    calls++;
    return { ok: true, json: async () => ({ id: ["geo", "time"], size: [1, 3], dimension: { time: { category: { index: { "2025-S1": 0, "2025-S2": 1, "2026-S1": 2 } } } }, value: { 0: 0.96, 1: 1.4696, 2: 1.4584 } }) };
  });
  assert.deepEqual(await service(), { price_ron_kwh: 1.4584, period: "2026-S1", band: "2500-4999", source: "Eurostat" });
  await service();
  assert.equal(calls, 1);
});

test("unavailable or malformed data fails without caching the error", async () => {
  let calls = 0;
  const service = createElectricityPriceService(async () => { calls++; return { ok: true, json: async () => ({}) }; });
  await assert.rejects(service(), /nu este disponibil/);
  await assert.rejects(service(), /nu este disponibil/);
  assert.equal(calls, 2);
});
