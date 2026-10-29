import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createComputeServer } from "./http.mjs";
import { ComputePool } from "./pool.mjs";
import { CityCatalog } from "./catalog.mjs";
import { unproject } from "../../mobile/src/engine/geometry.ts";
import { parseComparison } from "../../mobile/src/domain/routes.ts";
import { parseBuildingFeatures } from "../../mobile/src/domain/buildingResponse.ts";
import { parseShadowLayer } from "../../mobile/src/domain/shadows.ts";

const catalog = CityCatalog.load();
const CITIES = new URL("../../mobile/assets/data/cities/", import.meta.url);
// A spread of sizes, regions and height sources; absent areas are skipped.
const SAMPLE = ["constanta", "suceava", "cluj-napoca", "timisoara", "iasi"];

async function raw(area) {
  const packed = JSON.parse(await readFile(new URL(area.file, CITIES), "utf8"));
  return JSON.parse(gunzipSync(Buffer.from(packed.payload, "base64")));
}
/** Two connected walking nodes ~250 m apart, starting at the node nearest the centre. */
function walk(data, near) {
  const nodes = new Map(data.nodes.map((n) => [n.id, n.point]));
  const adjacent = new Map();
  for (const e of data.edges) {
    if (!adjacent.has(e.from)) adjacent.set(e.from, []);
    adjacent.get(e.from).push(e.to);
  }
  let start = null,
    best = Infinity;
  for (const [id, q] of nodes) {
    const d = Math.hypot(q.x - near.x, q.y - near.y);
    if (d < best && adjacent.has(id)) [start, best] = [id, d];
  }
  const queue = [start],
    seen = new Set(queue);
  for (let i = 0; i < queue.length; i++) {
    const a = nodes.get(start),
      b = nodes.get(queue[i]);
    if (Math.hypot(a.x - b.x, a.y - b.y) > 250) return [nodes.get(start), b];
    for (const next of adjacent.get(queue[i]) ?? [])
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
  }
  throw Error("No connected walk");
}

async function server(t) {
  const pool = new ComputePool(1),
    app = createComputeServer({ pool, weather: async () => null });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => app.close());
  const until = Date.now() + 45000;
  while (!pool.ready && Date.now() < until)
    await new Promise((r) => setTimeout(r, 100));
  assert.equal(pool.ready, true);
  const base = `http://127.0.0.1:${app.server.address().port}`;
  return async (path, body) =>
    (
      await fetch(base + path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    ).json();
}

test(
  "each sampled city serves buildings shadows measuring and routes from its own data",
  { timeout: 300000 },
  async (t) => {
    const post = await server(t);
    const at = "2026-06-21T09:00:00Z";
    for (const id of SAMPLE) {
      const area = catalog.get(id);
      if (!area) continue;
      const data = await raw(area);
      const mid = {
        x: (data.pilot_m.west + data.pilot_m.east) / 2,
        y: (data.pilot_m.south + data.pilot_m.north) / 2,
      };
      const [a, b] = walk(data, mid);
      const focus = unproject(a);
      assert.equal(catalog.at(focus).id, id);
      const bounds = [
        focus.longitude - 0.004,
        focus.latitude - 0.003,
        focus.longitude + 0.004,
        focus.latitude + 0.003,
      ];
      const buildings = parseBuildingFeatures(
        await post("/v1/buildings", { bounds, focus }),
      );
      assert.ok(buildings.features.length > 0, id);
      // Display features carry this city's own OSM ids.
      const ids = new Set(data.buildings.map((x) => x.id));
      assert.ok(
        buildings.features.every((f) => ids.has(f.id.replace(/-\d+$/, ""))),
        id,
      );
      if (area.heights)
        assert.ok(
          buildings.features.some((f) =>
            f.properties.height_source.startsWith("copernicus_"),
          ) || area.heights_count < 50,
          id,
        );
      const shadows = parseShadowLayer(
        await post("/v1/shadows", { bounds, focus, at }),
        at,
      );
      assert.ok(shadows.polygons.length > 0, id);
      const target = data.buildings.find(
        (x) => x.height.source !== "unsupported_elevated",
      );
      const ring = target.geometry[0][0];
      const inside = unproject({
        x: ring.reduce((s, p) => s + p.x, 0) / ring.length,
        y: ring.reduce((s, p) => s + p.y, 0) / ring.length,
      });
      const inspected = await post("/v1/buildings/inspect", {
        point: inside,
        at,
      });
      assert.ok(
        inspected.building === null || ids.has(inspected.building.id),
        id,
      );
      const request = {
        schema_version: 1,
        origin: focus,
        destination: unproject(b),
        departure_at: new Date(Date.now() + 60000).toISOString(),
        departure_timezone: "Europe/Bucharest",
        max_extra_minutes: 0,
        walking_speed_mps: 1.4,
      };
      const route = parseComparison(
        await post("/v1/routes/compare", request),
        request,
      );
      assert.ok(route.routes[0].distance_m > 200, id);
      assert.ok(
        route.warnings.some((w) => w.includes(`${id}-city-v1`)),
        id,
      );
    }
  },
);

test(
  "a split city routes between neighbouring zones and reports areas without data generally",
  { timeout: 300000 },
  async (t) => {
    const zones = catalog.areas.filter((a) => a.zone);
    const left = zones.find((z) => z.zone[0] === 1 && z.zone[1] === 0),
      right = zones.find(
        (z) => z.city === left?.city && z.zone[0] === 1 && z.zone[1] === 1,
      );
    if (!left || !right) return t.skip("no split city bundled");
    const post = await server(t);
    // Walk across the shared edge: start inside the left zone only, end inside the right only.
    const y = (left.bounds[1] + left.bounds[3]) / 2;
    const edge = (left.bounds[2] + right.bounds[0]) / 2;
    const request = {
      schema_version: 1,
      origin: { longitude: right.bounds[0] - 0.006, latitude: y },
      destination: { longitude: left.bounds[2] + 0.006, latitude: y },
      departure_at: new Date(Date.now() + 60000).toISOString(),
      departure_timezone: "Europe/Bucharest",
      max_extra_minutes: 0,
      walking_speed_mps: 1.4,
    };
    assert.ok(
      request.origin.longitude < edge && request.destination.longitude > edge,
    );
    assert.deepEqual(
      catalog.forRoute(request.origin, request.destination).map((a) => a.id),
      [left.id, right.id],
    );
    const route = parseComparison(
      await post("/v1/routes/compare", request),
      request,
    );
    assert.ok(route.routes[0].distance_m > 500);
    assert.ok(
      route.warnings.some(
        (w) =>
          w.includes(`${left.id}-city-v1`) && w.includes(`${right.id}-city-v1`),
      ),
    );
    // Far apart areas have no shared graph; the message stays general.
    const far = catalog.areas.find((a) => a.city !== left.city);
    const refused = await post("/v1/routes/compare", {
      ...request,
      destination: {
        longitude: (far.bounds[0] + far.bounds[2]) / 2,
        latitude: (far.bounds[1] + far.bounds[3]) / 2,
      },
    });
    assert.equal(refused.code, "outside");
    assert.doesNotMatch(refused.detail, /Constanța|Suceava/);
  },
);
