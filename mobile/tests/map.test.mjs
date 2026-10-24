import assert from "node:assert/strict";
import test from "node:test";
import { freshFix, shouldRefreshRoute } from "../src/domain/live.ts";
import { parseShadowLayer, shadowInstant } from "../src/domain/shadows.ts";

const point = { latitude: 44.175, longitude: 28.635 };
const at = "2026-10-24T12:00:00.000Z";
const polygon = [
  [28.635, 44.175],
  [28.636, 44.175],
  [28.636, 44.176],
  [28.635, 44.175],
];
const fixture = () => ({
  type: "FeatureCollection",
  at,
  state: "available",
  features: [
    {
      properties: {
        height_source: "levels_estimate",
        building_id: "test-only",
      },
      geometry: {
        type: "Polygon",
        coordinates: [polygon.map((point) => [...point])],
      },
    },
  ],
  attribution: ["© OpenStreetMap contributors"],
  warnings: [],
});

test("live location rejects stale, future and invalid GPS fixes", () => {
  const fix = { ...point, accuracy: 8, timestamp: 100000 };
  assert.equal(freshFix(fix, 105000), true);
  assert.equal(freshFix(fix, 135000), false);
  assert.equal(freshFix(fix, 90000), false);
  assert.equal(freshFix({ ...fix, latitude: NaN }, 105000), false);
  assert.equal(freshFix({ ...fix, accuracy: -1 }, 105000), false);
  assert.equal(freshFix(null, 105000), false);
});

test("automatic routes update on destination changes and useful movement without GPS request spam", () => {
  const previous = { origin: point, key: "destination-1", at: 100000 };
  assert.equal(shouldRefreshRoute(null, point, "destination-1", 100000), true);
  assert.equal(
    shouldRefreshRoute(previous, point, "destination-2", 101000),
    true,
  );
  assert.equal(
    shouldRefreshRoute(
      previous,
      { ...point, latitude: point.latitude + 0.001 },
      "destination-1",
      105000,
    ),
    false,
  );
  assert.equal(
    shouldRefreshRoute(
      previous,
      { ...point, latitude: point.latitude + 0.001 },
      "destination-1",
      111000,
    ),
    true,
  );
  assert.equal(
    shouldRefreshRoute(
      previous,
      { ...point, latitude: point.latitude + 0.00001 },
      "destination-1",
      115000,
    ),
    false,
  );
  assert.equal(
    shouldRefreshRoute(previous, point, "destination-1", 160000),
    true,
  );
});

test("shadow clock refreshes every minute while selected times stay frozen", () => {
  const clock = Date.parse("2026-10-24T12:00:45Z");
  assert.equal(shadowInstant(null, clock), at);
  assert.equal(shadowInstant(null, clock + 30000), "2026-10-24T12:01:00.000Z");
  const selected = new Date("2026-10-24T10:30:00+03:00");
  assert.equal(shadowInstant(selected, clock), "2026-10-24T07:30:00.000Z");
  assert.equal(
    shadowInstant(selected, clock + 60000),
    shadowInstant(selected, clock),
  );
});

test("GeoJSON shadow coordinates are correctly converted for native maps", () => {
  const layer = parseShadowLayer(fixture(), at);
  assert.deepEqual(layer.polygons[0].coordinates[0], point);
  assert.equal(layer.polygons[0].source, "levels_estimate");
  assert.equal(layer.polygons[0].holes.length, 0);
  assert.equal(
    parseShadowLayer({ ...fixture(), at: "2026-10-24T12:00:00+00:00" }, at)
      .state,
    "available",
  );
});

test("unknown building heights remain distinct from calculated shadow geometry", () => {
  const data = fixture();
  data.features[0].properties.height_source = "unknown";
  assert.equal(parseShadowLayer(data, at).polygons[0].source, "unknown");
});

test("old shadow snapshots and malformed map geometry cannot be displayed", () => {
  assert.throws(() => parseShadowLayer(fixture(), "2026-10-24T13:00:00.000Z"));
  const bad = fixture();
  bad.features[0].geometry.coordinates[0][0] = [999, 999];
  assert.throws(() => parseShadowLayer(bad, at));
  const open = fixture();
  open.features[0].geometry.coordinates = [
    [
      [28, 44],
      [28.1, 44],
      [28.1, 44.1],
      [28, 44.1],
    ],
  ];
  assert.throws(() => parseShadowLayer(open, at));
  assert.throws(() => parseShadowLayer({ ...fixture(), attribution: [] }, at));
});
