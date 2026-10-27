import assert from "node:assert/strict";
import test from "node:test";
import { initializeDataset } from "../src/engine/data.ts";
import { makeTree, treeHasFoliage, withTrees } from "../src/engine/trees.ts";
import { classifyAt } from "../src/engine/exposure.ts";
import { localShadows } from "../src/engine/overlay.ts";
import { project, unproject } from "../src/engine/geometry.ts";
import { task } from "../src/engine/task.ts";
import { parseShadowLayer } from "../src/domain/shadows.ts";

const point = project({ latitude: 44.175, longitude: 28.64 });
const signal = () => new AbortController().signal;
const june = Date.parse("2026-06-21T10:00:00Z");
const january = Date.parse("2026-01-21T10:00:00Z");
async function dataset(raw) {
  const box = {
    west: point.x - 1000,
    east: point.x + 1000,
    south: point.y - 1000,
    north: point.y + 1000,
  };
  const data = await initializeDataset(
    {
      schema_version: 1,
      crs: "EPSG:32635",
      pilot_id: "test",
      pilot_m: box,
      imported_m: box,
      nodes: [],
      edges: [],
      buildings: [],
      metadata: {},
    },
    task(signal(), 5000),
    { requireGraph: false },
  );
  return withTrees(data, raw);
}
const tree = {
  id: "tree-1",
  start: unproject({ x: point.x + 10, y: point.y }),
  height: "15",
  crown: "8",
  cycle: "deciduous",
};

test("mapped tree crown produces estimated shade only with summer foliage and known ground position", async () => {
  const data = await dataset([tree]);
  const sun = { elevation: 45, azimuth: 90 };
  assert.equal(
    classifyAt(data, point, sun, true, june).exposure,
    "estimated_shade",
  );
  assert.equal(classifyAt(data, point, sun, true, january).exposure, "unknown");
  assert.equal(classifyAt(data, point, sun, false, june).exposure, "unknown");
  assert.equal(
    classifyAt(data, point, { ...sun, elevation: -5 }, true, june).exposure,
    "unknown",
  );
  const evergreen = await dataset([{ ...tree, cycle: "evergreen" }]);
  assert.equal(
    classifyAt(evergreen, point, sun, true, january).exposure,
    "estimated_shade",
  );
});

test("tree rows and missing values produce bounded approximate canopy geometry", () => {
  const a = makeTree({
    ...tree,
    height: "garbage",
    crown: "1000",
    end: unproject({ x: point.x + 40, y: point.y }),
  });
  assert.equal(a.height, 8);
  assert.ok(a.box.east - a.box.west > 25);
  assert.equal(treeHasFoliage(a, june), true);
  assert.equal(treeHasFoliage(a, january), false);
});

test("canopy and estimated shadow survive server validation; winter and disabled estimates omit tree shadows", async () => {
  const data = await dataset([tree]);
  const bounds = [28.638, 44.173, 28.642, 44.177];
  const summer = await localShadows(
    data,
    new Date(june).toISOString(),
    bounds,
    signal(),
    { displayEstimates: true },
  );
  assert.ok(summer.polygons.some((p) => p.source === "tree_canopy"));
  assert.ok(summer.polygons.some((p) => p.source === "tree_estimate"));
  const winter = await localShadows(
    data,
    new Date(january).toISOString(),
    bounds,
    signal(),
    { displayEstimates: true },
  );
  assert.ok(winter.polygons.some((p) => p.source === "tree_canopy"));
  assert.ok(!winter.polygons.some((p) => p.source === "tree_estimate"));
  const off = await localShadows(
    data,
    new Date(june).toISOString(),
    bounds,
    signal(),
    { displayEstimates: false },
  );
  assert.ok(!off.polygons.some((p) => p.source.startsWith("tree_")));
  const wire = {
    type: "FeatureCollection",
    at: summer.at,
    state: summer.state,
    truncated: false,
    partial_coverage: false,
    attribution: summer.attribution,
    warnings: summer.warnings,
    features: summer.polygons.map((p) => ({
      type: "Feature",
      properties: { building_id: p.id, height_source: p.source },
      geometry: {
        type: "Polygon",
        coordinates: [p.coordinates, ...p.holes].map((r) =>
          r.map((c) => [c.longitude, c.latitude]),
        ),
      },
    })),
  };
  assert.ok(
    parseShadowLayer(wire, summer.at).polygons.some(
      (p) => p.source === "tree_estimate",
    ),
  );
});
