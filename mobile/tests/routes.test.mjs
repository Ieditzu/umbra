import assert from "node:assert/strict";
import test from "node:test";
import {
  distanceBetween,
  exposureTotals,
  isCoordinate,
  makeRouteRequest,
  parseComparison,
  routeCoordinates,
} from "../src/domain/routes.ts";
import { normalizeApiUrl, restoreSettings } from "../src/domain/settings.ts";
import { compareRoutes } from "../src/services/routing.ts";

const origin = { latitude: 44.1733, longitude: 28.6383 };
const middle = { latitude: 44.1745, longitude: 28.64 };
const destination = { latitude: 44.176, longitude: 28.642 };
const departure = new Date("2026-10-25T09:00:00Z");
const now = new Date("2026-10-24T10:00:00Z");
const request = () =>
  makeRouteRequest(origin, destination, departure, now, 5, "Europe/Bucharest");
const fixture = () => ({
  schema_version: 1,
  departure_at: departure.toISOString(),
  generated_at: now.toISOString(),
  method: "test-fixture-only",
  warnings: [],
  attribution: ["© OpenStreetMap contributors"],
  routes: [
    {
      id: "fast",
      kind: "fastest",
      distance_m: 450,
      duration_s: 360,
      segments: [
        { coordinates: [origin, middle], exposure: "shade", duration_s: 120 },
        {
          coordinates: [middle, destination],
          exposure: "unknown",
          duration_s: 240,
        },
      ],
    },
  ],
});

test("coordinates must be finite and within geographic bounds", () => {
  assert.equal(isCoordinate(origin), true);
  for (const point of [
    null,
    {},
    { latitude: NaN, longitude: 0 },
    { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: 181 },
    { latitude: "44", longitude: 28 },
  ])
    assert.equal(isCoordinate(point), false);
  assert.equal(distanceBetween(origin, origin), 0);
});

test("request preserves actual instant, time zone and detour", () => {
  assert.equal(request().departure_at, "2026-10-25T09:00:00.000Z");
  assert.equal(request().departure_timezone, "Europe/Bucharest");
  assert.equal(request().max_extra_minutes, 5);
  assert.equal(request().walking_speed_mps, 1.4);
});

test("reject missing, coincident, distant, past and invalid requests", () => {
  for (const args of [
    [null, destination, departure, now, 5],
    [origin, origin, departure, now, 5],
    [origin, { latitude: 45, longitude: 29 }, departure, now, 5],
    [origin, destination, new Date("invalid"), now, 5],
    [origin, destination, now, departure, 5],
    [origin, destination, departure, now, -1],
  ]) {
    assert.throws(() => makeRouteRequest(...args, "Europe/Bucharest"));
  }
});

test("unknown exposure remains unknown and is never counted as shade", () => {
  const comparison = parseComparison(fixture(), request());
  assert.deepEqual(exposureTotals(comparison.routes[0]), {
    shade: 120,
    estimated_shade: 0,
    unshaded_estimate: 0,
    sun: 0,
    unknown: 240,
  });
  assert.deepEqual(routeCoordinates(comparison.routes[0]), [
    origin,
    middle,
    middle,
    destination,
  ]);
});

test("reject stale departures and incomplete source metadata", () => {
  assert.throws(() =>
    parseComparison(
      { ...fixture(), departure_at: now.toISOString() },
      request(),
    ),
  );
  assert.throws(() =>
    parseComparison({ ...fixture(), attribution: [] }, request()),
  );
  assert.throws(() => parseComparison({ ...fixture(), method: "" }, request()));
  assert.throws(() => parseComparison({ ...fixture(), routes: [] }, request()));
});

test("reject invalid duration, unknown exposure categories and disconnected geometry", () => {
  const response = fixture();
  response.routes[0].duration_s = 999;
  assert.throws(() => parseComparison(response, request()));
  const bad = fixture();
  bad.routes[0].segments[0].exposure = "maybe";
  assert.throws(() => parseComparison(bad, request()));
  const gap = fixture();
  gap.routes[0].segments[1].coordinates[0] = {
    latitude: 44.1758,
    longitude: 28.642,
  };
  assert.throws(() => parseComparison(gap, request()));
  const remote = fixture();
  remote.routes[0].segments[0].coordinates[0] = { latitude: 0, longitude: 0 };
  assert.throws(() => parseComparison(remote, request()));
});

test("alternatives must respect the fastest baseline and detour budget", () => {
  const response = fixture();
  response.routes.push({
    ...response.routes[0],
    id: "shade",
    kind: "shadiest",
    duration_s: 700,
    segments: [
      {
        coordinates: [origin, destination],
        exposure: "shade",
        duration_s: 700,
      },
    ],
  });
  assert.throws(() => parseComparison(response, request()));
  response.routes[1].duration_s = 500;
  response.routes[1].segments[0].duration_s = 500;
  assert.equal(parseComparison(response, request()).routes.length, 2);
  response.routes[1].kind = "fastest";
  assert.throws(() => parseComparison(response, request()));
});

test("server URLs exclude credentials and insecure public endpoints", () => {
  assert.equal(
    normalizeApiUrl(" https://api.example.com/ "),
    "https://api.example.com",
  );
  assert.equal(
    normalizeApiUrl("http://192.168.1.20:8000"),
    "http://192.168.1.20:8000",
  );
  assert.equal(normalizeApiUrl(""), "");
  for (const value of [
    "file:///etc/passwd",
    "https://name:secret@example.com",
    "http://example.com",
    "http://127.evil.com",
    "https://example.com?key=secret",
    "garbage",
  ])
    assert.throws(() => normalizeApiUrl(value));
});

test("invalid saved settings fall back safely", () => {
  for (const value of [null, "bad json", "{}", '{"apiUrl":"file:///tmp/data"}'])
    assert.deepEqual(restoreSettings(value), {
      maxExtraMinutes: 5,
    });
  assert.deepEqual(
    restoreSettings('{"apiUrl":"https://example.com","maxExtraMinutes":15}'),
    { maxExtraMinutes: 15 },
  );
});

test("API sends only an explicit request and validates the response", async () => {
  let call;
  const fetcher = async (url, init) => {
    call = { url, init };
    return new Response(JSON.stringify(fixture()), { status: 200 });
  };
  const result = await compareRoutes(
    "https://example.com",
    request(),
    new AbortController().signal,
    fetcher,
  );
  assert.equal(call.url, "https://example.com/v1/routes/compare");
  assert.equal(call.init.method, "POST");
  assert.deepEqual(JSON.parse(call.init.body), request());
  assert.equal(result.routes.length, 1);
});

test("unconfigured, unavailable and cancelled services do not fabricate routes", async () => {
  await assert.rejects(
    compareRoutes("", request(), new AbortController().signal),
  );
  await assert.rejects(
    compareRoutes(
      "https://example.com",
      request(),
      new AbortController().signal,
      async () => new Response("", { status: 503 }),
    ),
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    compareRoutes(
      "https://example.com",
      request(),
      controller.signal,
      async (_url, init) => {
        init.signal.throwIfAborted();
      },
    ),
  );
});

test("malformed and oversized service bodies are rejected before parsing", async () => {
  const run = (response) =>
    compareRoutes(
      "https://example.com",
      request(),
      new AbortController().signal,
      async () => response,
    );
  await assert.rejects(
    run(new Response("<html>unavailable</html>")),
    /JSON valid/,
  );
  await assert.rejects(run(new Response("x".repeat(5_000_001))), /prea mare/);
  await assert.rejects(
    run(new Response("{}", { headers: { "content-length": "5000001" } })),
    /prea mare/,
  );
});

test("weather recommendation is validated without changing route exposure", () => {
  const data = fixture();
  data.weather = {
    status: "available",
    recommended_id: "fast",
    direct_wm2: 30,
    cloud_percent: 85,
    fetched_at: now.toISOString(),
    source: "Open-Meteo",
  };
  const parsed = parseComparison(data, request());
  assert.equal(parsed.weather.recommended_id, "fast");
  assert.equal(parsed.routes[0].segments[1].exposure, "unknown");
  assert.throws(() =>
    parseComparison(
      { ...data, weather: { ...data.weather, recommended_id: "missing" } },
      request(),
    ),
  );
  assert.equal(
    parseComparison({ ...data, weather: { status: "unavailable" } }, request())
      .weather.status,
    "unavailable",
  );
});
