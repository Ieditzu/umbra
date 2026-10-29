import assert from "node:assert/strict";
import test from "node:test";
import { cityCatalog, loadAreaGraph, loadAreas } from "./city.mjs";
import { visibleBuildings } from "../../mobile/src/engine/buildings.ts";

test("map-only city loading preserves buildings and skips the walking graph", { timeout: 30000 }, async () => {
  const area = cityCatalog().get("suceava");
  assert.ok(area);
  const trees = Promise.resolve({ forArea: () => [] });
  const map = await loadAreas([area], { treeCatalog: trees, includeGraph: false });
  assert.equal(map.nodes.length, 0);
  assert.equal(map.edges.length, 0);
  assert.equal(map.positions.size, 0);
  assert.ok(map.buildings.length > 0);
  const focus = { longitude: 26.25, latitude: 47.65 };
  const features = await visibleBuildings(map, [26.24,47.64,26.26,47.66], new AbortController().signal, focus);
  assert.ok(features.features.length > 0);
  const graph = await loadAreaGraph([area], map);
  assert.ok(graph.edges.length > 0);
  assert.equal(graph.buildings, map.buildings);
  assert.equal(graph.index, map.index);
  assert.equal(map.edges.length, 0);
});
