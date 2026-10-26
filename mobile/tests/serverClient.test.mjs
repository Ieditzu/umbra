import assert from "node:assert/strict";
import test from "node:test";
import { resolveCalculationUrl } from "../src/domain/server.ts";
import {
  requestCalculation,
  CalculationError,
} from "../src/services/calculationClient.ts";
import { parseBuildingFeatures } from "../src/domain/buildingResponse.ts";
import { readFileSync } from "node:fs";

test("server discovery follows Metro including LAN simulator and tunnel origins", () => {
  assert.equal(
    resolveCalculationUrl(undefined, "192.168.1.20:8081", true),
    "http://192.168.1.20:8081/umbra-api",
  );
  assert.equal(
    resolveCalculationUrl(undefined, "localhost:8092", true),
    "http://localhost:8092/umbra-api",
  );
  assert.equal(
    resolveCalculationUrl(undefined, "abc.exp.direct", true),
    "https://abc.exp.direct/umbra-api",
  );
  assert.equal(
    resolveCalculationUrl("https://api.example.com", undefined, false),
    "https://api.example.com",
  );
  assert.equal(
    resolveCalculationUrl(undefined, "192.168.1.20:8081", false),
    "",
  );
  assert.equal(resolveCalculationUrl(undefined, undefined, true), "");
  assert.throws(() =>
    resolveCalculationUrl("http://public.example.com", undefined, false),
  );
});

test("remote requests preserve cancellation and meaningful server failures without local fallback", async () => {
  const signal = new AbortController().signal;
  let captured;
  const ok = await requestCalculation(
    "http://localhost:8092/umbra-api",
    "/v1/buildings",
    { bounds: [1, 2, 3, 4] },
    signal,
    async (url, options) => {
      captured = { url, options };
      return new Response(JSON.stringify({ ok: true }));
    },
  );
  assert.equal(ok.ok, true);
  assert.equal(captured.url, "http://localhost:8092/umbra-api/v1/buildings");
  assert.ok(captured.options.signal instanceof AbortSignal);
  await assert.rejects(
    requestCalculation(
      "http://localhost",
      "/v1/shadows",
      {},
      signal,
      async () =>
        new Response(
          JSON.stringify({ detail: "În afara acoperirii", code: "outside" }),
          { status: 422 },
        ),
    ),
    (e) =>
      e instanceof CalculationError &&
      e.code === "outside" &&
      e.message === "În afara acoperirii",
  );
  await assert.rejects(
    requestCalculation("http://localhost", "/x", {}, signal, async () => {
      throw Error("refused");
    }),
    /nu răspunde/,
  );
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(
    requestCalculation("http://localhost", "/x", {}, aborted.signal, () =>
      assert.fail("fetch after abort"),
    ),
    /oprit/,
  );
  await assert.rejects(
    requestCalculation(
      "http://localhost",
      "/x",
      {},
      signal,
      async () => new Response("not json"),
    ),
    /invalid/,
  );
  await assert.rejects(
    requestCalculation(
      "http://localhost",
      "/x",
      {},
      signal,
      async () =>
        new Response("{}", { headers: { "content-length": "9000000" } }),
    ),
    /prea mare/,
  );
});

test("building responses reject unbounded invalid and duplicate geometry", () => {
  const f = {
    type: "Feature",
    id: "1",
    properties: { height: 0, height_source: "missing", display_height: 6 },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [28, 44],
          [28.001, 44],
          [28, 44.001],
          [28, 44],
        ],
      ],
    },
  };
  const value = { type: "FeatureCollection", features: [f], truncated: false };
  assert.equal(parseBuildingFeatures(value), value);
  assert.throws(() => parseBuildingFeatures({ ...value, features: [f, f] }));
  assert.throws(() =>
    parseBuildingFeatures({
      ...value,
      features: [
        {
          ...f,
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [999, 44],
                [28, 44],
                [28, 45],
                [999, 44],
              ],
            ],
          },
        },
      ],
    }),
  );
  assert.throws(() =>
    parseBuildingFeatures({
      ...value,
      features: [
        { ...f, properties: { ...f.properties, display_height: Infinity } },
      ],
    }),
  );
});

test("app calculation entry points use the remote adapter and never import the city loader", () => {
  for (const path of [
    "src/state/PlannerProvider.tsx",
    "src/hooks/useShadowLayer.ts",
    "src/components/LocalRouteMap.tsx",
  ]) {
    const text = readFileSync(new URL("../" + path, import.meta.url), "utf8");
    assert.match(text, /services\/calculations/);
    assert.doesNotMatch(text, /services\/localEngine|engine\/overlay/);
  }
});

test("stalled network requests time out and caller cancellation reaches the fetch", async () => {
  const blocked = async (_, options) =>
    new Promise((_, reject) =>
      options.signal.addEventListener("abort", () => reject(Error("aborted")), {
        once: true,
      }),
    );
  await assert.rejects(
    requestCalculation(
      "http://localhost",
      "/x",
      {},
      new AbortController().signal,
      blocked,
      10,
    ),
    (error) => error.code === "timeout",
  );
  const controller = new AbortController();
  const pending = requestCalculation(
    "http://localhost",
    "/x",
    {},
    controller.signal,
    blocked,
  );
  controller.abort();
  await assert.rejects(pending, (error) => error.code === "cancelled");
});

test("a request interrupted by backend reload is retried once and an old backend gets a restart instruction", async () => {
  let attempts = 0;
  const value = await requestCalculation(
    "http://localhost",
    "/v1/buildings",
    {},
    new AbortController().signal,
    async () => {
      if (++attempts === 1) throw new TypeError("connection closed");
      return new Response(JSON.stringify({ ready: true }));
    },
  );
  assert.equal(value.ready, true);
  assert.equal(attempts, 2);
  await assert.rejects(
    requestCalculation(
      "http://localhost",
      "/v1/shadows",
      {},
      new AbortController().signal,
      async () =>
        new Response(
          JSON.stringify({
            detail: "Câmpuri de cerere necunoscute.",
            code: "invalid",
          }),
          { status: 422 },
        ),
    ),
    (e) => e.code === "restart_required",
  );
});
