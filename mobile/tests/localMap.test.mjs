import assert from "node:assert/strict";
import test from "node:test";
import { initializeDataset } from "../src/engine/data.ts";
import { visibleBuildings } from "../src/engine/buildings.ts";
import { project, rect } from "../src/engine/geometry.ts";
import { task } from "../src/engine/task.ts";
import {
  parseMapMessage,
  locationFeatures,
  shadowFeatures,
  routeFeatures,
} from "../src/domain/localMap.ts";
import { distanceBetween } from "../src/domain/routes.ts";

const coordinate = { latitude: 44.1733, longitude: 28.6383 },
  p = project(coordinate);
const signal = () => new AbortController().signal;
function rawData() {
  const area = {
    west: p.x - 1000,
    east: p.x + 1000,
    south: p.y - 1000,
    north: p.y + 1000,
  };
  const outline = rect({
    west: p.x,
    south: p.y,
    east: p.x + 20,
    north: p.y + 20,
  });
  const hole = rect({
    west: p.x + 5,
    south: p.y + 5,
    east: p.x + 10,
    north: p.y + 10,
  })[0];
  return {
    schema_version: 1,
    crs: "EPSG:32635",
    pilot_id: "synthetic-test-only",
    pilot_m: area,
    imported_m: area,
    metadata: {},
    nodes: [
      { id: 1, point: p },
      { id: 2, point: { x: p.x - 100, y: p.y } },
    ],
    edges: [
      {
        from: 1,
        to: 2,
        way_id: 1,
        highway: "footway",
        position_known: true,
        geometry: [p, { x: p.x - 100, y: p.y }],
      },
    ],
    buildings: [
      { id: "height", tags: { height: "10" }, geometry: [[outline[0], hole]] },
      { id: "levels", tags: { "building:levels": "2" }, geometry: [outline] },
      { id: "missing", tags: {}, geometry: [outline] },
      {
        id: "elevated",
        tags: { height: "10", min_height: "3" },
        geometry: [outline],
      },
    ],
  };
}
const view = [28.635, 44.17, 28.642, 44.18];

test("3D display keeps source heights and courtyard rings with display placeholders isolated from missing elevations", async () => {
  const data = await initializeDataset(rawData(), task(signal()));
  const features = await visibleBuildings(data, view, signal());
  const byId = Object.fromEntries(features.features.map((f) => [f.id, f]));
  assert.equal(byId["height-0"].properties.height, 10);
  assert.equal(byId["levels-0"].properties.height, 5);
  assert.equal(byId["missing-0"].properties.height, 0);
  assert.equal(byId["elevated-0"].properties.height, 0);
  assert.equal(byId["missing-0"].properties.display_height, 6);
  assert.equal(byId["height-0"].properties.display_height, 10);
  assert.equal(data.buildings.find((b) => b.id === "missing").height.low_m, 0);
  assert.equal(byId["height-0"].geometry.coordinates.length, 2);
  assert.ok(
    Math.abs(
      byId["height-0"].geometry.coordinates[0][0][0] - coordinate.longitude,
    ) < 0.000001,
  );
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(visibleBuildings(data, view, aborted.signal), /oprit/);
});

test("3D geometry is bounded independently of city size", async () => {
  const raw = rawData();
  raw.buildings = Array.from({ length: 6001 }, (_, i) => ({
    ...raw.buildings[0],
    id: `synthetic-${i}`,
  }));
  raw.buildings[0].geometry = raw.buildings[0].geometry.map((poly) =>
    poly.map((ring) => ring.map((p) => ({ ...p, x: p.x + 250 }))),
  );
  const result = await visibleBuildings(
    await initializeDataset(raw, task(signal())),
    view,
    signal(),
  );
  assert.equal(result.features.length, 6000);
  assert.equal(result.truncated, true);
  assert.ok(!result.features.some((f) => f.id === "synthetic-0-0"));
  assert.ok(result.features.some((f) => f.id === "synthetic-6000-0"));
});

test("embedded renderer messages reject invalid coordinates and unexpected operations", () => {
  assert.deepEqual(parseMapMessage('{"type":"ready"}'), { type: "ready" });
  assert.equal(
    parseMapMessage(
      '{"type":"pick","coordinate":{"latitude":999,"longitude":28}}',
    ),
    null,
  );
  assert.equal(
    parseMapMessage('{"type":"navigate","url":"https://example.com"}'),
    null,
  );
  assert.equal(parseMapMessage("x".repeat(8001)), null);
  const msg = {
    type: "viewport",
    bounds: view,
    pitch: 55,
    zoom: 16,
    bearing: 0,
    center: coordinate,
  };
  assert.deepEqual(parseMapMessage(JSON.stringify(msg)), msg);
  assert.equal(parseMapMessage(JSON.stringify({ ...msg, pitch: 999 })), null);
});

test("GPS uncertainty and shadow data stay separate from building meshes", () => {
  const location = locationFeatures({ ...coordinate, accuracy: 400 });
  const circle = location.features[1].geometry.coordinates[0];
  assert.deepEqual(circle[0], circle.at(-1));
  assert.ok(
    Math.abs(
      distanceBetween(coordinate, {
        longitude: circle[0][0],
        latitude: circle[0][1],
      }) - 250,
    ) < 1,
  );
  assert.equal(locationFeatures(null).features.length, 0);
  const polygon = {
    id: "test",
    coordinates: [
      coordinate,
      { ...coordinate, longitude: 28.639 },
      { ...coordinate, latitude: 44.174 },
      coordinate,
    ],
    holes: [],
  };
  assert.equal(
    shadowFeatures({
      polygons: [
        { ...polygon, source: "unknown" },
        { ...polygon, source: "osm_height" },
      ],
    }).features.length,
    1,
  );
  assert.equal(routeFeatures(null).features.length, 0);
});
