import { test } from "node:test";
import assert from "node:assert/strict";
import { CityCatalog } from "./catalog.mjs";
import { mergeRaw } from "./city.mjs";

const area = (id, bounds, extra = {}) => ({
  id,
  city: id.replace(/-\d+$/, ""),
  name: id,
  file: `${id}-city.json`,
  bounds,
  ...extra,
});
const catalog = new CityCatalog({
  schema_version: 1,
  areas: [
    area("alpha", [24, 45, 24.2, 45.2]),
    // A split city: 2×2 zones overlapping by 0.02°.
    area("beta-1", [26, 44, 26.12, 44.12], { zone: [0, 0] }),
    area("beta-2", [26.08, 44, 26.2, 44.12], { zone: [0, 1] }),
    area("beta-3", [26, 44.08, 26.12, 44.2], { zone: [1, 0] }),
    area("beta-4", [26.08, 44.08, 26.2, 44.2], { zone: [1, 1] }),
    area("bad id", [0, 0, 1, 1]),
  ],
});
const p = (longitude, latitude) => ({ longitude, latitude });

test("catalog selects areas by location without city names in code", () => {
  assert.equal(catalog.areas.length, 5);
  assert.equal(catalog.at(p(24.1, 45.1)).id, "alpha");
  assert.equal(catalog.at(p(25, 45)), null);
  // Overlap: the zone where the point is most interior wins.
  assert.equal(catalog.at(p(26.09, 44.03)).id, "beta-1");
  assert.equal(catalog.at(p(26.11, 44.03)).id, "beta-2");
  assert.equal(catalog.at(p(26.05, 44.03)).id, "beta-1");
  assert.ok(catalog.covers([24.05, 45.05, 24.1, 45.1]));
  assert.ok(!catalog.covers([24.15, 45.05, 24.25, 45.1]));
});

test("routes use one area or two neighbouring zones and refuse unrelated areas", () => {
  assert.deepEqual(
    catalog.forRoute(p(24.05, 45.05), p(24.15, 45.15)).map((a) => a.id),
    ["alpha"],
  );
  // Both ends in the overlap of zones 1 and 2 need only one of them.
  assert.equal(catalog.forRoute(p(26.09, 44.05), p(26.1, 44.06)).length, 1);
  assert.deepEqual(
    catalog.forRoute(p(26.02, 44.02), p(26.18, 44.02)).map((a) => a.id),
    ["beta-1", "beta-2"],
  );
  assert.deepEqual(
    catalog.forRoute(p(26.02, 44.02), p(26.18, 44.18)).map((a) => a.id),
    ["beta-1", "beta-4"],
  );
  assert.equal(catalog.forRoute(p(24.05, 45.05), p(26.02, 44.02)), null);
  assert.equal(catalog.forRoute(p(24.05, 45.05), p(25, 45)), null);
});

test("merging zones joins graphs through shared OSM node ids without duplicates", () => {
  const box = (west, east) => ({ west, south: 0, east, north: 10 });
  const edge = (from, to) => ({
    from,
    to,
    way_id: 7,
    geometry: [
      { x: from, y: 1 },
      { x: to, y: 1 },
    ],
  });
  const a = {
    schema_version: 1,
    pilot_id: "x-1-city-v1",
    pilot_m: box(0, 6),
    imported_m: box(-1, 7),
    nodes: [1, 3, 5].map((id) => ({ id, point: { x: id, y: 1 } })),
    edges: [edge(1, 3), edge(3, 5)],
    buildings: [{ id: "way/1" }, { id: "way/2" }],
  };
  const b = {
    ...a,
    pilot_id: "x-2-city-v1",
    pilot_m: box(4, 10),
    imported_m: box(3, 11),
    nodes: [5, 7, 9].map((id) => ({ id, point: { x: id, y: 1 } })),
    edges: [edge(5, 7), edge(7, 9)],
    buildings: [{ id: "way/2" }, { id: "way/3" }],
  };
  const merged = mergeRaw([a, b]);
  assert.equal(merged.nodes.length, 5);
  assert.equal(merged.edges.length, 4);
  assert.equal(merged.buildings.length, 3);
  assert.deepEqual(merged.pilot_m, box(0, 10));
  assert.deepEqual(merged.imported_m, box(-1, 11));
  assert.equal(merged.pilot_id, "x-1-city-v1+x-2-city-v1");
  assert.equal(mergeRaw([a]), a);
});
