import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createComputeServer } from "./http.mjs";
import { ComputePool } from "./pool.mjs";
import { unproject } from "../../mobile/src/engine/geometry.ts";
import { parseShadowLayer } from "../../mobile/src/domain/shadows.ts";
import { parseComparison } from "../../mobile/src/domain/routes.ts";
import { parseBuildingFeatures } from "../../mobile/src/domain/buildingResponse.ts";
const require = createRequire(import.meta.url);
const proxy = require("../../mobile/scripts/api-proxy.cjs");
const listen = (server) =>
  new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve(`http://127.0.0.1:${server.address().port}`),
    ),
  );
const post = (url, path, payload) =>
  fetch(url + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

test("HTTP validates input compresses output and only caches static viewport results", async (t) => {
  let calls = 0;
  const pool = {
    ready: true,
    run: async () => {
      calls++;
      return JSON.stringify({ padding: "x".repeat(2000) });
    },
    close: async () => {},
  };
  const app = createComputeServer({
      pool,
      regions: {
        load: async (selection) => ({
          key: selection.key,
          tiles: [],
          bounds: [28, 44, 29, 45],
        }),
      },
    }),
    base = await listen(app.server);
  t.after(() => app.close());
  assert.equal(
    (await (await fetch(base + "/health")).json()).service,
    "umbra-compute",
  );
  assert.equal((await fetch(base + "/unknown")).status, 404);
  assert.equal((await fetch(base + "/v1/shadows")).status, 405);
  assert.equal(
    (await fetch(base + "/v1/shadows", { method: "POST", body: "{}" })).status,
    415,
  );
  assert.equal(
    (await post(base, "/v1/shadows", { bounds: [0, 1], at: "bad" })).status,
    422,
  );
  assert.equal(
    (
      await post(base, "/v1/buildings", {
        bounds: [28, 44, 29, 45],
        extra: true,
      })
    ).status,
    422,
  );
  assert.equal(
    (await post(base, "/v1/buildings", { padding: "x".repeat(17000) })).status,
    413,
  );
  const q = { bounds: [28, 44, 29, 45] };
  const response = await post(base, "/v1/buildings", q);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-encoding"), "gzip");
  assert.equal((await response.json()).padding.length, 2000);
  await post(base, "/v1/buildings", q);
  assert.equal(calls, 1);
  await post(base, "/v1/routes/compare", {});
  await post(base, "/v1/routes/compare", {});
  assert.equal(calls, 3);
});

test("Metro proxy forwards requests and reports an unavailable backend", async (t) => {
  const fake = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ path: req.url }));
  });
  await listen(fake);
  t.after(() => new Promise((r) => fake.close(r)));
  const server = createServer(
    proxy((req, res) => {
      res.statusCode = 404;
      res.end();
    }, fake.address().port),
  );
  const base = await listen(server);
  t.after(() => new Promise((r) => server.close(r)));
  assert.equal(
    (await (await fetch(base + "/umbra-api/health")).json()).path,
    "/health",
  );
  assert.equal((await fetch(base + "/umbra-api/not-allowed")).status, 404);
  assert.equal((await fetch(base + "/umbra-api/v1/buildings")).status, 405);
  const unavailable = createServer(proxy(() => {}, 1));
  const dead = await listen(unavailable);
  t.after(() => new Promise((r) => unavailable.close(r)));
  assert.equal((await fetch(dead + "/umbra-api/health")).status, 503);
});

test(
  "real city worker serves validated buildings shadows and a connected route without changing the phone model",
  { timeout: 60000 },
  async (t) => {
    const pool = new ComputePool(),
      app = createComputeServer({ pool }),
      base = await listen(app.server);
    t.after(() => app.close());
    const aborted = new AbortController();
    aborted.abort();
    await assert.rejects(pool.run("buildings", {}, aborted.signal), /oprit/);
    const expiry = Date.now() + 30000;
    while (!pool.ready && Date.now() < expiry)
      await new Promise((r) => setTimeout(r, 100));
    assert.equal(pool.ready, true);
    assert.equal(pool.slots.length, 1);
    const cancelled = new AbortController();
    const pending = pool.run(
      "buildings",
      { bounds: [28.5, 44.075, 28.75, 44.355] },
      cancelled.signal,
    );
    setTimeout(() => cancelled.abort(), 5);
    await assert.rejects(pending, /oprit/);
    const bounds = [28.633, 44.172, 28.638, 44.177],
      at = "2026-06-21T09:00:00Z";
    const buildings = parseBuildingFeatures(
      await (
        await post(base, "/v1/buildings", {
          bounds,
          focus: { latitude: 44.175, longitude: 28.636 },
        })
      ).json(),
    );
    assert.ok(
      buildings.features.length > 0 && buildings.features.length <= 2500,
    );
    const wideBuildings = parseBuildingFeatures(
      await (await post(base, "/v1/buildings", {
        bounds: [28.3, 43.9, 28.9, 44.4],
        focus: { latitude: 44.175, longitude: 28.636 },
      })).json(),
    );
    assert.ok(wideBuildings.features.length > 0 && wideBuildings.features.length <= 2500);
    const shadows = parseShadowLayer(
      await (await post(base, "/v1/shadows", { bounds, at })).json(),
      at,
    );
    assert.ok(shadows.polygons.length > 0);
    assert.ok(shadows.polygons.some((p) => p.source === "display_estimate"));
    assert.ok(shadows.polygons.some((p) => p.source === "tree_canopy"));
    assert.ok(shadows.polygons.some((p) => p.source === "tree_canopy" && p.models?.length));
    assert.ok(shadows.polygons.some((p) => p.source === "tree_estimate"));
    assert.ok(
      shadows.polygons.some(
        (p) => p.source === "satellite_canopy" && p.canopyHeight > p.canopyBase,
      ),
    );
    assert.ok(shadows.polygons.some((p) => p.source === "satellite_estimate"));
    assert.ok(shadows.sun.elevation > 0);
    const measuredOnly = parseShadowLayer(
      await (
        await post(base, "/v1/shadows", {
          bounds,
          at,
          include_estimates: false,
        })
      ).json(),
      at,
    );
    assert.ok(
      !measuredOnly.polygons.some((p) =>
        [
          "display_estimate",
          "tree_canopy",
          "tree_estimate",
          "satellite_canopy",
          "satellite_estimate",
        ].includes(p.source),
      ),
    );
    assert.ok(measuredOnly.polygons.length < shadows.polygons.length);
    const outside = await post(base, "/v1/shadows", {
      bounds: [27, 43, 27.001, 43.001],
      at,
    });
    assert.equal(outside.status, 422);
    assert.equal((await outside.json()).code, "outside");
    const packed = JSON.parse(
      await readFile(
        new URL(
          "../../mobile/assets/data/constanta-city.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const raw = JSON.parse(
      gunzipSync(Buffer.from(packed.payload, "base64")).toString("utf8"),
    );
    const positions = new Map(raw.nodes.map((n) => [n.id, n.point]));
    const adjacency = new Map();
    for (const e of raw.edges) {
      if (!adjacency.has(e.from)) adjacency.set(e.from, []);
      adjacency.get(e.from).push(e.to);
    }
    const start = raw.edges[0].from,
      queue = [start],
      seen = new Set(queue);
    let end = start;
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i],
        a = positions.get(start),
        b = positions.get(id);
      if (Math.hypot(a.x - b.x, a.y - b.y) > 200) {
        end = id;
        break;
      }
      for (const next of adjacency.get(id) ?? [])
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
    }
    assert.notEqual(start, end);
    const q = {
      schema_version: 1,
      origin: unproject(positions.get(start)),
      destination: unproject(positions.get(end)),
      departure_at: new Date(Date.now() + 60000).toISOString(),
      departure_timezone: "Europe/Bucharest",
      max_extra_minutes: 0,
      walking_speed_mps: 1.4,
    };
    const routeResponse = await post(base, "/v1/routes/compare", q);
    const route = parseComparison(await routeResponse.json(), q);
    assert.match(route.method, /^server\//);
    assert.ok(route.routes[0].distance_m > 200);
  },
);

test("route responses include weather recommendations and fall back when unavailable", async (t) => {
  const at = Date.parse("2026-06-01T10:00:00Z");
  const route = {
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
  let enabled = true;
  const pool = {
    ready: true,
    run: async () => JSON.stringify(route),
    close: async () => {},
  };
  const app = createComputeServer({
    pool,
    weather: async () =>
      enabled
        ? {
            fetchedAt: at,
            points: [
              { at, direct: 600, cloud: 10 },
              { at: at + 3600000, direct: 600, cloud: 10 },
            ],
          }
        : null,
  });
  const base = await listen(app.server);
  t.after(() => app.close());
  const q = { departure_at: new Date(at).toISOString() };
  const first = await (await post(base, "/v1/routes/compare", q)).json();
  assert.equal(first.weather.recommended_id, "shade");
  enabled = false;
  const second = await (await post(base, "/v1/routes/compare", q)).json();
  assert.equal(second.weather.status, "unavailable");
  assert.deepEqual(second.routes, route.routes);
});

test("solar estimate is available through the Expo proxy", async (t) => {
  const pool = { ready: true, close: async () => {}, run: async (kind, payload) => {
    assert.equal(kind, "solar-shade");
    assert.equal(payload.roof_id, "way/123");
    assert.deepEqual(payload.instants, [123]);
    return JSON.stringify({ shades: ["blocked"] });
  } };
  const app = createComputeServer({ pool, solar: async (q, options) => ({ date: q.date, energy_kwh: (await options.shade([123]))[0] === "blocked" ? 0.4 : 0.83 }) });
  await listen(app.server);
  t.after(() => app.close());
  const proxyServer = createServer(proxy((req, res) => { res.statusCode = 404; res.end(); }, app.server.address().port));
  const base = await listen(proxyServer);
  t.after(() => new Promise((resolve) => proxyServer.close(resolve)));
  const response = await post(base, "/umbra-api/v1/solar-power", { date: "2026-10-30", roof_id: "way/123", point: { latitude: 44.17, longitude: 28.63 } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).energy_kwh, 0.4);
  assert.equal((await post(base, "/umbra-api/v1/solar-power", { unknown: true })).status, 422);
});
