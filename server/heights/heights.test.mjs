import assert from "node:assert/strict";
import test from "node:test";
import { HeightStore } from "./store.mjs";
import { RateLimiter } from "./routes.mjs";
import { createComputeServer } from "../compute/http.mjs";
import { ComputePool } from "../compute/pool.mjs";
import { evaluateSubmission } from "../../mobile/src/domain/measurements.ts";
import { parseMeasureTarget } from "../../mobile/src/domain/measureResponse.ts";
import { parseShadowLayer } from "../../mobile/src/domain/shadows.ts";
import { project } from "../../mobile/src/engine/geometry.ts";
import {
  shadowAxis,
  shadowLength,
} from "../../mobile/src/engine/shadowMeasure.ts";

const corner = project({ latitude: 44.1733, longitude: 28.6383 });
const ALICE = "a".repeat(32),
  BOB = "b".repeat(32);
const checklist = {
  clearGround: true,
  sharpShadow: true,
  roofCorner: true,
  flatGround: true,
};
/** A submission whose shadow length corresponds to `height` at `when`. */
function submission(id, height, when, extra = {}) {
  const at = Date.parse(when),
    e = shadowAxis(corner, at).sun.elevation;
  return {
    id,
    osm_building: "way/1",
    method: "tape_laser",
    corner,
    length_m: Math.round(shadowLength(height, e) * 100) / 100,
    lateral_m: null,
    gps_accuracy_m: null,
    drone: null,
    measured_at: new Date(at).toISOString(),
    checklist,
    app_version: "test",
    engine_version: "test",
    ...extra,
  };
}
const gps = (id, height, when) =>
  submission(id, height, when, {
    method: "phone_gps",
    lateral_m: 1,
    gps_accuracy_m: 4,
  });
const MORNING = "2026-10-27T07:30:00Z";

test("store combines, confirms, publishes and deletes measurements", () => {
  const store = new HeightStore(":memory:");
  const add = (s, who = ALICE, levels = 8) =>
    store.add(evaluateSubmission(s, levels), who, "2026-10-27T08:00:00Z");
  assert.equal(add(gps("gps-00000001", 24, MORNING)), "created");
  assert.equal(add(gps("gps-00000001", 24, MORNING)), "duplicate");
  assert.equal(add(gps("gps-00000001", 24, MORNING), BOB), "conflict");
  assert.equal(
    store.summary("way/1").confirmed,
    false,
    "one GPS reading is not enough",
  );
  assert.deepEqual(store.confirmed(), []);
  const revision = store.revision;
  // A second person measuring minutes later is independent.
  store.add(
    evaluateSubmission(gps("gps-00000002", 25, "2026-10-27T07:35:00Z"), 8),
    BOB,
    "2026-10-27T09:00:00Z",
  );
  const summary = store.summary("way/1");
  assert.equal(summary.confirmed, true);
  assert.equal(summary.count, 2);
  assert.ok(store.revision > revision);
  assert.equal(store.confirmed()[0].id, "way/1");
  assert.ok(
    store.confirmed()[0].low_m < 24.5 && store.confirmed()[0].high_m > 24.5,
  );
  assert.equal(store.changedSince("2026-10-27T08:30:00Z").length, 1);
  assert.equal(store.changedSince("2026-10-27T09:30:00Z").length, 0);
  const pub = store.building("way/1");
  assert.equal(pub.measurements.length, 2);
  for (const m of pub.measurements) {
    assert.equal(m.contributor, undefined);
    assert.equal(m.corner, undefined);
    assert.equal(m.tip, undefined);
    assert.match(m.measured_on, /^\d{4}-\d{2}-\d{2}$/);
  }
  const file = store.exportFile("2026-10-27T10:00:00Z");
  assert.equal(file.license, "ODbL-1.0");
  assert.equal(file.heights.length, 1);
  assert.equal(store.remove("gps-00000002", ALICE), "forbidden");
  assert.equal(store.remove("missing-0001", ALICE), "not_found");
  assert.equal(
    store.remove("gps-00000002", BOB, "2026-10-27T11:00:00Z"),
    "deleted",
  );
  assert.equal(store.summary("way/1").confirmed, false);
  // The unconfirmed building is reported as removed to clients that synced before.
  assert.deepEqual(store.changedSince("2026-10-27T10:30:00Z"), [
    {
      osm_building: "way/1",
      confirmed: false,
      updated_at: "2026-10-27T11:00:00Z",
    },
  ]);
  assert.equal(store.removeContributor(ALICE), 1);
  assert.deepEqual(store.confirmed(), []);
  store.close();
});

test("moderation turns a sloped-ground measurement into a confirmed height", () => {
  const store = new HeightStore(":memory:");
  const sloped = submission("slope-0001", 20, MORNING, {
    checklist: { ...checklist, flatGround: false },
  });
  store.add(evaluateSubmission(sloped, null), ALICE);
  assert.deepEqual(
    store.queue().map((m) => [m.id, m.reason]),
    [["slope-0001", "slope"]],
  );
  assert.equal(store.summary("way/1").confirmed, false);
  assert.equal(store.review("slope-0001", "accepted"), true);
  assert.deepEqual(store.queue(), []);
  assert.equal(
    store.summary("way/1").confirmed,
    true,
    "a reviewed laser reading confirms",
  );
  assert.equal(store.review("nope-00001", "accepted"), false);
  assert.throws(() => store.review("slope-0001", "maybe"));
  store.close();
});

test("server recomputes heights and never trusts a submitted height", () => {
  const s = submission("trust-0001", 30, MORNING);
  const evaluated = evaluateSubmission({ ...s, height_m: 999 }, null);
  assert.ok(Math.abs(evaluated.height_m - 30) < 0.05);
  const night = evaluateSubmission(
    { ...s, measured_at: "2026-10-27T22:00:00Z" },
    null,
  );
  assert.equal(night.status, "rejected");
  assert.equal(night.reason, "low_sun");
  const offLine = evaluateSubmission(
    { ...gps("gps-00000009", 30, MORNING), lateral_m: 40 },
    null,
  );
  assert.equal(offLine.reason, "off_ruler");
  const drone = evaluateSubmission(
    submission("drone-0001", 0, MORNING, {
      method: "drone_nadir",
      length_m: 0,
      drone: {
        altitude_m: 60,
        focal_mm: 8.8,
        sensor_mm: 13.2,
        image_px: 5472,
        shadow_px: 2000,
      },
    }),
    null,
  );
  // 60 × 13.2 / (8.8 × 5472) ≈ 1.64 cm per pixel → 32.9 m of shadow.
  assert.ok(Math.abs(drone.length_m - 32.89) < 0.05, drone.length_m);
  assert.ok(drone.sigma_m < 1.5);
});

const listen = (server) =>
  new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve(`http://127.0.0.1:${server.address().port}`),
    ),
  );
const send = (base, path, method, body, headers = {}) =>
  fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

test("heights HTTP API validates, rate-limits and feeds shared heights to the engine", async (t) => {
  const jobs = [];
  const verify = { exists: true, corner: true, levels: 8, elevated: false };
  const pool = {
    ready: true,
    run: async (kind, q) => {
      jobs.push([kind, q]);
      return JSON.stringify(
        kind === "verify" ? verify : { building: null, ok: true },
      );
    },
    close: async () => {},
  };
  const store = new HeightStore(":memory:");
  const app = createComputeServer({
      pool,
      regions: { load: async () => null },
      heights: store,
      limiter: new RateLimiter({
        post_contributor: 3,
        post_ip: 100,
        delete_ip: 100,
      }),
    }),
    base = await listen(app.server);
  t.after(async () => {
    await app.close();
    store.close();
  });
  const health = await (await fetch(base + "/health")).json();
  assert.ok(health.capabilities.includes("shared_heights"));
  const post = (measurement, contributor = ALICE) =>
    send(base, "/v1/measurements", "POST", { measurement, contributor });
  // Validation before any work.
  assert.equal((await post(submission("bad", 20, MORNING))).status, 422);
  assert.equal(
    (await post(submission("valid-0001", 20, MORNING), "nothex")).status,
    422,
  );
  assert.equal(
    (
      await post(
        submission(
          "future-001",
          20,
          new Date(Date.now() + 3600000).toISOString(),
        ),
      )
    ).status,
    422,
  );
  assert.equal(
    (
      await send(base, "/v1/measurements", "POST", {
        measurement: submission("x-00000001", 20, MORNING),
        contributor: ALICE,
        extra: 1,
      })
    ).status,
    422,
  );
  verify.exists = false;
  assert.equal(
    (await (await post(submission("unknown-01", 20, MORNING))).json()).code,
    "unknown_building",
  );
  verify.exists = true;
  verify.corner = false;
  assert.equal(
    (await (await post(submission("corner-001", 20, MORNING))).json()).code,
    "not_a_corner",
  );
  verify.corner = true;
  const created = await post(submission("laser-0001", 20, MORNING));
  assert.equal(created.status, 201);
  const result = await created.json();
  assert.equal(result.measurement.status, "accepted");
  assert.ok(Math.abs(result.measurement.height_m - 20) < 0.05);
  assert.equal(result.building.confirmed, true);
  assert.equal(
    (await post(submission("laser-0001", 20, MORNING))).status,
    200,
    "idempotent retry",
  );
  assert.equal(
    (await post(submission("laser-0001", 20, MORNING), BOB)).status,
    409,
  );
  // Fourth POST by the same install id within the hour (limit 3 in this test).
  assert.equal((await post(submission("laser-0002", 20, MORNING))).status, 429);
  // Public endpoints.
  const file = await (await fetch(base + "/v1/heights")).json();
  assert.equal(file.heights[0].osm_building, "way/1");
  assert.equal((await fetch(base + "/v1/heights?since=yesterday")).status, 422);
  assert.equal(
    (
      await (
        await fetch(
          base +
            `/v1/heights?since=${encodeURIComponent(new Date(Date.now() + 1000).toISOString())}`,
        )
      ).json()
    ).heights.length,
    0,
  );
  const building = await (await fetch(base + "/v1/buildings/way/1")).json();
  assert.equal(building.measurements.length, 1);
  assert.ok(!JSON.stringify(building).includes(ALICE));
  assert.equal((await send(base, "/v1/heights", "POST", {})).status, 405);
  // Shared confirmed heights reach the engine without the phone sending them.
  const bounds = [28.633, 44.172, 28.638, 44.177];
  await send(base, "/v1/shadows", "POST", { bounds, at: MORNING });
  const shadowJob = jobs.findLast(([kind]) => kind === "shadows")[1];
  assert.equal(shadowJob.measured_heights[0].id, "way/1");
  // The phone's own confirmed value wins over the shared one for the same building.
  await send(base, "/v1/shadows", "POST", {
    bounds,
    at: "2026-10-27T08:00:00Z",
    measured_heights: [{ id: "way/1", low_m: 3, high_m: 4 }],
  });
  assert.equal(
    jobs.findLast(([kind]) => kind === "shadows")[1].measured_heights[0].low_m,
    3,
  );
  // Deleting needs the owner's install id.
  assert.equal(
    (await send(base, "/v1/measurements/laser-0001", "DELETE")).status,
    401,
  );
  assert.equal(
    (
      await send(base, "/v1/measurements/laser-0001", "DELETE", undefined, {
        "X-Umbra-Contributor": BOB,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await send(base, "/v1/measurements/laser-0001", "DELETE", undefined, {
        "X-Umbra-Contributor": ALICE,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await send(base, "/v1/measurements/laser-0001", "DELETE", undefined, {
        "X-Umbra-Contributor": ALICE,
      })
    ).status,
    404,
  );
  // Cached shadow results are invalidated by the new revision.
  const before = jobs.length;
  await send(base, "/v1/shadows", "POST", { bounds, at: MORNING });
  assert.equal(jobs.length, before + 1);
  assert.equal(jobs.at(-1)[1].measured_heights, undefined);
});

test(
  "real city: an uploaded laser measurement changes everyone's shadows",
  { timeout: 60000 },
  async (t) => {
    const store = new HeightStore(":memory:");
    const pool = new ComputePool(1),
      app = createComputeServer({ pool, heights: store }),
      base = await listen(app.server);
    t.after(async () => {
      await app.close();
      store.close();
    });
    const expiry = Date.now() + 30000;
    while (!pool.ready && Date.now() < expiry)
      await new Promise((r) => setTimeout(r, 100));
    const at = "2026-10-27T08:30:00Z",
      bounds = [28.633, 44.172, 28.638, 44.177];
    // Find a missing-height building through the public inspect endpoint.
    let target = null;
    for (let i = 0; i < 60 && !target; i++) {
      const point = {
        latitude: 44.1735 + (i % 8) * 0.0003,
        longitude: 28.6345 + Math.floor(i / 8) * 0.0003,
      };
      const found = parseMeasureTarget(
        await (
          await send(base, "/v1/buildings/inspect", "POST", { point, at })
        ).json(),
      );
      if (
        found?.measurable &&
        found.height.source === "missing" &&
        found.corners.length
      )
        target = found;
    }
    assert.ok(target, "a measurable missing-height building near the centre");
    assert.equal(target.shared, null);
    const c = project(target.corners[0].coordinate);
    const e = shadowAxis(c, Date.parse(at)).sun.elevation;
    const response = await send(base, "/v1/measurements", "POST", {
      contributor: ALICE,
      measurement: {
        ...submission("real-00001", 18, at),
        osm_building: target.id,
        corner: c,
        length_m: Math.round(shadowLength(18, e) * 100) / 100,
      },
    });
    assert.equal(
      response.status,
      201,
      JSON.stringify(await response.clone().json()),
    );
    const inspected = parseMeasureTarget(
      await (
        await send(base, "/v1/buildings/inspect", "POST", {
          point: target.corners[0].coordinate,
          at,
        })
      ).json(),
    );
    assert.equal(inspected.height.source, "measured_shadow");
    assert.equal(inspected.shared.confirmed, true);
    const shadows = parseShadowLayer(
      await (
        await send(base, "/v1/shadows", "POST", {
          bounds,
          at,
          include_estimates: false,
        })
      ).json(),
      at,
    );
    assert.ok(
      shadows.polygons.some(
        (p) => p.source === "measured" && p.id.startsWith(`${target.id}-`),
      ),
    );
    // A corner that is not a vertex of this building is refused.
    const wrong = await send(base, "/v1/measurements", "POST", {
      contributor: ALICE,
      measurement: {
        ...submission("real-00002", 18, at),
        osm_building: target.id,
        corner: { x: c.x + 3, y: c.y },
      },
    });
    assert.equal((await wrong.json()).code, "not_a_corner");
  },
);

test("Metro proxy forwards the shared heights routes with the install id", async (t) => {
  const { createRequire } = await import("node:module");
  const { createServer } = await import("node:http");
  const proxy = createRequire(import.meta.url)(
    "../../mobile/scripts/api-proxy.cjs",
  );
  const seen = [];
  const upstream = createServer((req, res) => {
    seen.push({
      method: req.method,
      url: req.url,
      contributor: req.headers["x-umbra-contributor"],
      forwarded: req.headers["x-forwarded-for"],
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end("{}");
  });
  const port = Number(new URL(await listen(upstream)).port);
  const metro = createServer(proxy(() => {}, port));
  const base = await listen(metro);
  t.after(async () => {
    await new Promise((r) => metro.close(r));
    await new Promise((r) => upstream.close(r));
  });
  const api = base + "/umbra-api";
  assert.equal(
    (await fetch(api + "/v1/heights?since=2026-10-27T10:00:00Z")).status,
    200,
  );
  assert.equal(seen.at(-1).url, "/v1/heights?since=2026-10-27T10:00:00Z");
  assert.equal(
    (
      await fetch(api + "/v1/measurements/abc-00001", {
        method: "DELETE",
        headers: { "X-Umbra-Contributor": ALICE },
      })
    ).status,
    200,
  );
  assert.equal(seen.at(-1).contributor, ALICE);
  assert.ok(
    seen.at(-1).forwarded,
    "phone address forwarded for per-phone limits",
  );
  assert.equal((await fetch(api + "/v1/buildings/way/12")).status, 200);
  assert.equal((await fetch(api + "/v1/heights?evil=1")).status, 404);
  assert.equal(
    (await fetch(api + "/v1/shadows?x=1", { method: "POST" })).status,
    404,
  );
  assert.equal((await fetch(api + "/v1/measurements")).status, 405);
  assert.equal(
    (await fetch(api + "/v1/buildings/way/12", { method: "POST" })).status,
    405,
  );
  assert.equal(seen.length, 3);
});
