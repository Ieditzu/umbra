import test from "node:test";
import assert from "node:assert/strict";
import { simplifyDisplayRing } from "./display-geometry.mjs";

test("display simplification removes near collinear points and keeps corners and closure", () => {
  const ring = [[28.6,44.17],[28.6001,44.17],[28.6002,44.17],[28.6002,44.1701],[28.6,44.1701],[28.6,44.17]];
  assert.deepEqual(simplifyDisplayRing(ring), [ring[0], ring[2], ring[3], ring[4], ring[0]]);
  const corner = [[28.6,44.17],[28.6001,44.17002],[28.6002,44.17],[28.6002,44.1701],[28.6,44.1701],[28.6,44.17]];
  assert.deepEqual(simplifyDisplayRing(corner), corner);
  const small = [[1,1],[2,1],[2,2],[1,1]];
  assert.equal(simplifyDisplayRing(small), small);
});
