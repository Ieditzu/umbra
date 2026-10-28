import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createComputeServer } from "./http.mjs";
import { ComputePool } from "./pool.mjs";
import {
  polygonContains,
  unproject,
} from "../../mobile/src/engine/geometry.ts";
import { buildingHeight } from "../../mobile/src/engine/data.ts";
import { parseMeasureTarget } from "../../mobile/src/domain/measureResponse.ts";
import { parseBuildingFeatures } from "../../mobile/src/domain/buildingResponse.ts";
import { parseShadowLayer } from "../../mobile/src/domain/shadows.ts";

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

test("measured heights and building inspection are validated before the pool", async (t) => {
  const seen = [];
  const pool = {
    ready: true,
    run: async (kind, q) => {
      seen.push([kind, q]);
      return JSON.stringify({ building: null });
    },
    close: async () => {},
  };
  const app = createComputeServer({
      pool,
      regions: { load: async () => null },
    }),
    base = await listen(app.server);
  t.after(() => app.close());
  const bounds = [28.633, 44.172, 28.638, 44.177],
    at = "2026-06-21T09:00:00Z";
  for (const measured of [
    [{ id: "tile-osm:5", low_m: 10, high_m: 12 }],
    [{ id: "way/1", low_m: 12, high_m: 10 }],
    [{ id: "way/1", low_m: 0, high_m: 10 }],
    [{ id: "way/1", low_m: 10, high_m: 12, note: "x" }],
    [
      { id: "way/1", low_m: 10, high_m: 12 },
      { id: "way/1", low_m: 10, high_m: 12 },
    ],
    "way/1",
  ])
    assert.equal(
      (
        await post(base, "/v1/shadows", {
          bounds,
          at,
          measured_heights: measured,
        })
      ).status,
      422,
      JSON.stringify(measured),
    );
  assert.equal(
    (
      await post(base, "/v1/buildings/inspect", {
        point: { latitude: 99, longitude: 0 },
        at,
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await post(base, "/v1/buildings/inspect", {
        point: { latitude: 44.17, longitude: 28.63 },
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await post(base, "/v1/buildings/inspect", {
        point: { latitude: 44.17, longitude: 28.63 },
        at,
        bounds,
      })
    ).status,
    422,
  );
  assert.equal(seen.length, 0);
  const valid = [{ id: "way/1", low_m: 10, high_m: 12 }];
  assert.equal(
    (
      await post(base, "/v1/buildings/inspect", {
        point: { latitude: 44.17, longitude: 28.63 },
        at,
        measured_heights: valid,
      })
    ).status,
    200,
  );
  // Inspection is per-instant and never cached.
  await post(base, "/v1/buildings/inspect", {
    point: { latitude: 44.17, longitude: 28.63 },
    at,
    measured_heights: valid,
  });
  assert.equal(seen.filter(([kind]) => kind === "inspect").length, 2);
  assert.equal(
    (await post(base, "/v1/buildings", { bounds, measured_heights: valid }))
      .status,
    200,
  );
  assert.deepEqual(seen.at(-1)[1].measured_heights, valid);
  const health = await (await fetch(base + "/health")).json();
  assert.ok(health.capabilities.includes("shadow_measurement"));
});

test(
  "real city worker inspects a Constanța building and applies its measured height",
  { timeout: 60000 },
  async (t) => {
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
    const estimates = JSON.parse(
      await readFile(
        new URL(
          "../../mobile/assets/data/constanta-heights-2012.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ).values;
    // A building with no height near the test viewport, tapped at an interior point.
    let chosen = null;
    for (const b of raw.buildings) {
      if (
        !/^way\//.test(b.id) ||
        buildingHeight(b.tags).source !== "missing" ||
        !(b.id in estimates)
      )
        continue;
      const ring = b.geometry[0][0];
      const c = ring.slice(0, -1).reduce(
        (s, q, _, all) => ({
          x: s.x + q.x / all.length,
          y: s.y + q.y / all.length,
        }),
        { x: 0, y: 0 },
      );
      const ll = unproject(c);
      if (
        ll.longitude > 28.634 &&
        ll.longitude < 28.637 &&
        ll.latitude > 44.173 &&
        ll.latitude < 44.176 &&
        polygonContains(b.geometry[0], c)
      ) {
        chosen = { id: b.id, point: ll };
        break;
      }
    }
    assert.ok(chosen, "a missing-height building exists in the test area");
    const pool = new ComputePool(1),
      app = createComputeServer({ pool }),
      base = await listen(app.server);
    t.after(() => app.close());
    const expiry = Date.now() + 30000;
    while (!pool.ready && Date.now() < expiry)
      await new Promise((r) => setTimeout(r, 100));
    const at = "2026-06-21T09:00:00Z";
    const target = parseMeasureTarget(
      await (
        await post(base, "/v1/buildings/inspect", { point: chosen.point, at })
      ).json(),
    );
    assert.equal(target.id, chosen.id);
    assert.equal(target.measurable, true);
    assert.equal(target.height.source, "copernicus_2012");
    assert.ok(target.corners.length > 0);
    assert.ok(target.sun.elevation > 60);
    const measured = [{ id: chosen.id, low_m: 24, high_m: 26 }];
    const after = parseMeasureTarget(
      await (
        await post(base, "/v1/buildings/inspect", {
          point: chosen.point,
          at,
          measured_heights: measured,
        })
      ).json(),
    );
    assert.equal(after.height.source, "measured_shadow");
    const d = 0.0015,
      bounds = [
        chosen.point.longitude - d,
        chosen.point.latitude - d,
        chosen.point.longitude + d,
        chosen.point.latitude + d,
      ];
    const buildings = parseBuildingFeatures(
      await (
        await post(base, "/v1/buildings", {
          bounds,
          focus: chosen.point,
          measured_heights: measured,
        })
      ).json(),
    );
    const mine = buildings.features.filter((f) =>
      f.id.startsWith(`${chosen.id}-`),
    );
    assert.ok(
      mine.length &&
        mine.every(
          (f) =>
            f.properties.height_source === "measured_shadow" &&
            f.properties.height === 24,
        ),
    );
    const shadows = parseShadowLayer(
      await (
        await post(base, "/v1/shadows", {
          bounds,
          at,
          focus: chosen.point,
          include_estimates: false,
          measured_heights: measured,
        })
      ).json(),
      at,
    );
    assert.ok(
      shadows.polygons.some(
        (p) => p.source === "measured" && p.id.startsWith(`${chosen.id}-`),
      ),
    );
    // Without measurements the same building stays without a modelled shadow.
    const plain = parseShadowLayer(
      await (
        await post(base, "/v1/shadows", {
          bounds,
          at,
          focus: chosen.point,
          include_estimates: false,
        })
      ).json(),
      at,
    );
    assert.ok(!plain.polygons.some((p) => p.id.startsWith(`${chosen.id}-`)));
    const nothing = await (
      await post(base, "/v1/buildings/inspect", {
        point: { latitude: 45.9, longitude: 24.9 },
        at,
      })
    ).json();
    assert.equal(nothing.building, null);
  },
);
