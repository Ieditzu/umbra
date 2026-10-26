import assert from "node:assert/strict";
import test from "node:test";
import { routeProgress } from "../src/domain/navigation.ts";
const route = {
  id: "synthetic",
  kind: "fastest",
  distance_m: 100,
  duration_s: 80,
  segments: [
    {
      coordinates: [
        { latitude: 44, longitude: 26 },
        { latitude: 44.001, longitude: 26 },
      ],
      exposure: "unknown",
      duration_s: 80,
    },
  ],
};
test("remaining route estimates follow live position and clamp before or after endpoints", () => {
  const midway = routeProgress(route, { latitude: 44.0005, longitude: 26 });
  assert.ok(Math.abs(midway.remainingMetres - 50) < 0.01);
  assert.ok(Math.abs(midway.remainingSeconds - 40) < 0.01);
  assert.ok(midway.distanceFromRoute < 0.1);
  assert.equal(
    routeProgress(route, { latitude: 43.999, longitude: 26 }).remainingMetres,
    100,
  );
  assert.equal(
    routeProgress(route, { latitude: 44.002, longitude: 26 }).remainingMetres,
    0,
  );
  assert.ok(
    routeProgress(route, { latitude: 44.0005, longitude: 26.002 })
      .distanceFromRoute > 100,
  );
  assert.equal(
    routeProgress({ ...route, segments: [] }, { latitude: 44, longitude: 26 }),
    null,
  );
});
