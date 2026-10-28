import test from "node:test";
import assert from "node:assert/strict";
import { applyWeather, atTime, createWeatherService } from "./weather.mjs";

const start = Date.parse("2026-06-01T10:00:00Z");
const request = {
  origin: { latitude: 44.17, longitude: 28.64 },
  destination: { latitude: 44.18, longitude: 28.65 },
  departure_at: new Date(start).toISOString(),
};
const comparison = {
  attribution: ["OSM"],
  routes: [
    {
      id: "fast",
      duration_s: 600,
      segments: [{ duration_s: 600, exposure: "unknown" }],
    },
    {
      id: "shade",
      duration_s: 720,
      segments: [{ duration_s: 720, exposure: "shade" }],
    },
  ],
};
const forecast = (direct) => ({
  fetchedAt: start,
  points: [
    { at: start, direct, cloud: 80 },
    { at: start + 3600000, direct, cloud: 80 },
  ],
});

test("weather changes the recommendation while preserving routes and unknown exposure", () => {
  const low = applyWeather(comparison, request, forecast(10));
  const high = applyWeather(comparison, request, forecast(600));
  assert.equal(low.weather.recommended_id, "fast");
  assert.equal(high.weather.recommended_id, "shade");
  assert.equal(high.routes[0].segments[0].exposure, "unknown");
  assert.equal(comparison.attribution.length, 1);
});
test("missing data, forecast gaps and times outside coverage leave the old routes intact", () => {
  assert.equal(
    applyWeather(comparison, request, null).weather.status,
    "unavailable",
  );
  const gap = forecast(200);
  gap.points[1].at += 3600000;
  assert.equal(atTime(gap.points, start + 5000), null);
  assert.equal(
    applyWeather(comparison, request, gap).weather.status,
    "unavailable",
  );
});
test("fetches rounded location, caches forecasts and fails safely", async () => {
  let calls = 0,
    clock = start;
  const fetcher = async (url) => {
    calls++;
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("timeformat"), "unixtime");
    assert.equal(parsed.searchParams.get("latitude"), "44.18");
    return {
      ok: true,
      json: async () => ({
        hourly: {
          time: [start / 1000, start / 1000 + 3600],
          direct_radiation_instant: [300, 100],
          cloud_cover: [20, 80],
        },
      }),
    };
  };
  const service = createWeatherService({ fetcher, now: () => clock });
  const a = await service(request);
  assert.equal(atTime(a.points, start + 1800000).direct, 200);
  await service(request);
  assert.equal(calls, 1);
  clock += 21 * 60000;
  await service({ ...request, departure_at: new Date(clock).toISOString() });
  assert.equal(calls, 2);
  assert.equal(
    await createWeatherService({
      fetcher: async () => {
        throw Error("offline");
      },
      now: () => start,
    })(request),
    null,
  );
  assert.equal(
    await service({
      ...request,
      departure_at: new Date(start + 20 * 86400000).toISOString(),
    }),
    null,
  );
});
