import assert from "node:assert/strict";
import test from "node:test";
import { placeCanopy, planTrees } from "../map-web/tree-placement.mjs";

const rectangle = (w, s, e, n) => [
  [w, s],
  [e, s],
  [e, n],
  [w, n],
  [w, s],
];
const feature = (kind, rings) => ({
  properties: {
    source: kind === "area" ? "satellite_canopy" : "tree_canopy",
    model_kind: kind,
    height: 10,
  },
  geometry: { type: "Polygon", coordinates: rings },
});
const outer = rectangle(28.63, 44.17, 28.631, 44.171);
const hole = rectangle(28.6303, 44.1703, 28.6307, 44.1707);

test("large modeled canopies produce multiple stable trees inside their footprint and outside holes", () => {
  const f = feature("area", [outer, hole]);
  const points = placeCanopy(f);
  assert.ok(points.length > 10);
  assert.deepEqual(points, placeCanopy(f));
  for (const tree of points) {
    const [lon, lat] = tree.center;
    assert.ok(lon > 28.63 && lon < 28.631 && lat > 44.17 && lat < 44.171);
    assert.ok(
      !(lon > 28.6303 && lon < 28.6307 && lat > 44.1703 && lat < 44.1707),
    );
  }
});

test("individually mapped trees stay individual and candidate budget is shared across patches", () => {
  const individual = feature("individual", [outer]);
  assert.equal(placeCanopy(individual).length, 1);
  const second = feature("area", [rectangle(28.65, 44.17, 28.651, 44.171)]);
  const output = planTrees([feature("area", [outer]), second], 3);
  assert.equal(output.length, 3);
  assert.ok(output[0].center[0] < 28.64);
  assert.ok(output[1].center[0] > 28.64);
  assert.equal(planTrees([feature("area", [outer])], 5).length, 5);
  assert.deepEqual(
    placeCanopy({ properties: { source: "tree_estimate" } }),
    [],
  );
});


test("server prepared tree candidates keep the same layout and obey obstacle filtering", () => {
  const f = feature("area", [outer]);
  const models = placeCanopy(f);
  const prepared = { ...f, properties: { ...f.properties, models } };
  assert.deepEqual(planTrees([prepared], 10), planTrees([f], 10));
  assert.deepEqual(planTrees([prepared], 10, { blocked: () => true }), []);
  assert.deepEqual(planTrees([{ ...prepared, geometry: null }], 1), models.slice(0, 1));
});
