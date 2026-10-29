import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createComputeServer } from "./http.mjs";
import { ComputePool } from "./pool.mjs";
import { unproject } from "../../mobile/src/engine/geometry.ts";
import { parseComparison } from "../../mobile/src/domain/routes.ts";
import { parseBuildingFeatures } from "../../mobile/src/domain/buildingResponse.ts";
import { parseShadowLayer } from "../../mobile/src/domain/shadows.ts";

test(
  "Suceava serves buildings shadows and routes from its own city data",
  { timeout: 60000 },
  async (t) => {
    const packed = JSON.parse(
      await readFile(
        new URL("../../mobile/assets/data/suceava-city.json", import.meta.url),
        "utf8",
      ),
    );
    const raw = JSON.parse(gunzipSync(Buffer.from(packed.payload, "base64")));
    const nodes = new Map(raw.nodes.map((n) => [n.id, n.point]));
    const adjacent = new Map();
    for (const e of raw.edges) {
      if (!adjacent.has(e.from)) adjacent.set(e.from, []);
      adjacent.get(e.from).push(e.to);
    }
    const start = raw.edges[0].from,
      queue = [start],
      seen = new Set(queue);
    let end = start;
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i],
        a = nodes.get(start),
        b = nodes.get(id);
      if (Math.hypot(a.x - b.x, a.y - b.y) > 200) {
        end = id;
        break;
      }
      for (const next of adjacent.get(id) ?? [])
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
    }
    assert.notEqual(start, end);
    const pool = new ComputePool(1),
      app = createComputeServer({ pool, weather: async () => null });
    await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    t.after(() => app.close());
    const until = Date.now() + 45000;
    while (!pool.ready && Date.now() < until)
      await new Promise((r) => setTimeout(r, 100));
    assert.equal(pool.ready, true);
    const base = `http://127.0.0.1:${app.server.address().port}`;
    const post = (path, body) =>
      fetch(base + path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const focus = { latitude: 47.651, longitude: 26.255 },
      bounds = [26.25, 47.648, 26.26, 47.654],
      at = "2026-06-21T09:00:00Z";
    const buildings = parseBuildingFeatures(
      await (await post("/v1/buildings", { bounds, focus })).json(),
    );
    assert.ok(buildings.features.length > 0);
    assert.ok(
      buildings.features.some(
        (f) => f.properties.height_source === "copernicus_2012",
      ),
    );
    const shadows = parseShadowLayer(
      await (await post("/v1/shadows", { bounds, focus, at })).json(),
      at,
    );
    assert.ok(shadows.polygons.length > 0);
    const request = {
      schema_version: 1,
      origin: unproject(nodes.get(start)),
      destination: unproject(nodes.get(end)),
      departure_at: new Date(Date.now() + 60000).toISOString(),
      departure_timezone: "Europe/Bucharest",
      max_extra_minutes: 0,
      walking_speed_mps: 1.4,
    };
    const route = parseComparison(
      await (await post("/v1/routes/compare", request)).json(),
      request,
    );
    assert.ok(route.routes[0].distance_m > 200);
    assert.ok(route.warnings.some((w) => w.includes("suceava-city-v1")));
  },
);
