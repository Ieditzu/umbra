import assert from "node:assert/strict";
import test from "node:test";
import { createObstacleIndex } from "../map-web/tree-obstacles.mjs";
import { planTrees } from "../map-web/tree-placement.mjs";

const rectangle = (w, s, e, n) => [
  [w, s],
  [e, s],
  [e, n],
  [w, n],
  [w, s],
];
const building = {
  geometry: {
    type: "Polygon",
    coordinates: [
      rectangle(28.63, 44.17, 28.631, 44.171),
      rectangle(28.6303, 44.1703, 28.6307, 44.1707),
    ],
  },
};
const road = {
  properties: { class: "minor" },
  geometry: {
    type: "LineString",
    coordinates: [
      [28.632, 44.17],
      [28.632, 44.171],
    ],
  },
};
const tree = (lon, lat, radius = 2) => ({ center: [lon, lat], radius });

test("tree crowns avoid building footprints while retaining open courtyards", () => {
  const index = createObstacleIndex([building], []);
  assert.equal(index.blocked(tree(28.6301, 44.1701)), true);
  assert.equal(index.blocked(tree(28.62998, 44.1701)), true);
  assert.equal(index.blocked(tree(28.6305, 44.1705)), false);
  assert.equal(index.blocked(tree(28.63031, 44.1705)), true);
});

test("road and footway centerlines have clearance while underground roads do not", () => {
  const index = createObstacleIndex(
    [],
    [
      road,
      {
        ...road,
        properties: { class: "path" },
        geometry: {
          type: "LineString",
          coordinates: [
            [28.633, 44.17],
            [28.633, 44.171],
          ],
        },
      },
      {
        ...road,
        properties: { class: "minor", brunnel: "tunnel" },
        geometry: {
          type: "LineString",
          coordinates: [
            [28.634, 44.17],
            [28.634, 44.171],
          ],
        },
      },
    ],
  );
  assert.equal(index.blocked(tree(28.632, 44.1705)), true);
  assert.equal(index.blocked(tree(28.63204, 44.1705)), true);
  assert.equal(index.blocked(tree(28.6322, 44.1705)), false);
  assert.equal(index.blocked(tree(28.633, 44.1705)), true);
  assert.equal(index.blocked(tree(28.634, 44.1705)), false);
});

test("tree distribution excludes blocked areas and preserves other canopy candidates", () => {
  const feature = {
    properties: { source: "satellite_canopy", model_kind: "area", height: 8 },
    geometry: {
      type: "Polygon",
      coordinates: [rectangle(28.629, 44.169, 28.634, 44.172)],
    },
  };
  const obstacles = createObstacleIndex([building], [road]);
  const result = planTrees([feature], 700, obstacles);
  assert.ok(result.length > 0);
  assert.ok(result.every((t) => !obstacles.blocked(t)));
});
