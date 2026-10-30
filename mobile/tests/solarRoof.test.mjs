import test from "node:test";
import assert from "node:assert/strict";
import { solarRoof } from "../src/domain/solarRoof.ts";
import { project, unproject } from "../src/engine/geometry.ts";

test("roof capacity scales with projected building area", () => {
  const o = project({ latitude: 44.17, longitude: 28.63 });
  const roof = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]].map(([x, y]) => unproject({ x: o.x + x, y: o.y + y }));
  const result = solarRoof(roof);
  assert.ok(Math.abs(result.area - 100) < 0.01);
  assert.equal(result.panels, 25);
  assert.equal(result.watts, result.panels * 400);
  assert.equal(solarRoof([]).watts, 0);
});
