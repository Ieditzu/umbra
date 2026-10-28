import assert from "node:assert/strict";
import test from "node:test";
import {
  ATTRIBUTION,
  initializeDataset,
  withMeasuredHeights,
} from "../src/engine/data.ts";
import { project, rect, unproject } from "../src/engine/geometry.ts";
import { classifyAt } from "../src/engine/exposure.ts";
import { localShadows } from "../src/engine/overlay.ts";
import { solarPosition } from "../src/engine/solar.ts";
import { task } from "../src/engine/task.ts";
import { inspectBuilding } from "../src/engine/measureTarget.ts";
import {
  buildMeasureOverlay,
  measureFeatures,
} from "../src/domain/measureOverlay.ts";
import { parseMeasureTarget } from "../src/domain/measureResponse.ts";
import { parseBuildingFeatures } from "../src/domain/buildingResponse.ts";
import { visibleBuildings } from "../src/engine/buildings.ts";

const centre = { latitude: 44.1733, longitude: 28.6383 },
  p = project(centre);
const noon = Date.parse("2026-06-21T10:07:00Z");
const signal = () => new AbortController().signal;
const box = (w, s, e, n) =>
  rect({ west: p.x + w, south: p.y + s, east: p.x + e, north: p.y + n });
function dataset(buildings) {
  const pilot = {
    west: p.x - 1000,
    south: p.y - 1000,
    east: p.x + 1000,
    north: p.y + 1000,
  };
  return initializeDataset(
    {
      schema_version: 1,
      crs: "EPSG:32635",
      pilot_id: "synthetic-test-only",
      pilot_m: pilot,
      imported_m: pilot,
      nodes: [],
      edges: [],
      buildings,
      metadata: { attribution: ATTRIBUTION, osm_base_timestamp: "synthetic" },
    },
    task(signal()),
    { requireGraph: false },
  );
}
// A block with no height tag south of the test point, so it shades the point at noon.
const block = {
  id: "way/100",
  tags: { building: "yes" },
  geometry: [box(-10, -20, 10, -5)],
};

test("a confirmed measurement turns a missing height into modelled shade", async () => {
  const data = await dataset([block]);
  const point = { x: p.x, y: p.y };
  const sun = solarPosition(noon, centre);
  assert.equal(classifyAt(data, point, sun, true).reason, "height_uncertainty");
  const measured = withMeasuredHeights(data, [
    { id: "way/100", low_m: 30, high_m: 32 },
  ]);
  const result = classifyAt(measured, point, sun, true);
  assert.equal(result.exposure, "shade");
  assert.equal(result.reason, "measured_shadow");
  // The shared dataset stays unchanged for other requests.
  assert.equal(data.buildings[0].height.source, "missing");
  assert.equal(measured.maxHeight, 32);
  assert.equal(withMeasuredHeights(data, []), data);
  assert.equal(
    withMeasuredHeights(data, [{ id: "way/9", low_m: 3, high_m: 4 }]),
    data,
  );
  // A too-short measured range does not invent shade.
  const short = withMeasuredHeights(data, [
    { id: "way/100", low_m: 2, high_m: 3 },
  ]);
  assert.equal(
    classifyAt(short, point, sun, true).exposure,
    "unshaded_estimate",
  );
});

test("measured heights draw their own shadow source and building colour", async () => {
  const data = withMeasuredHeights(await dataset([block]), [
    { id: "way/100", low_m: 20, high_m: 22 },
  ]);
  const bounds = [
    centre.longitude - 0.001,
    centre.latitude - 0.001,
    centre.longitude + 0.001,
    centre.latitude + 0.001,
  ];
  const layer = await localShadows(
    data,
    new Date(noon).toISOString(),
    bounds,
    signal(),
  );
  assert.ok(layer.polygons.some((poly) => poly.source === "measured"));
  assert.ok(layer.warnings.some((w) => w.includes("măsurate")));
  const buildings = parseBuildingFeatures(
    await visibleBuildings(data, bounds, signal()),
  );
  assert.equal(
    buildings.features[0].properties.height_source,
    "measured_shadow",
  );
  assert.equal(buildings.features[0].properties.height, 20);
});

test("elevated parts are never overridden by a ground shadow measurement", async () => {
  const data = await dataset([
    { ...block, tags: { building: "roof", height: "6" } },
  ]);
  const measured = withMeasuredHeights(data, [
    { id: "way/100", low_m: 20, high_m: 22 },
  ]);
  assert.equal(measured.buildings[0].height.source, "unsupported_elevated");
  const target = inspectBuilding(
    data,
    unproject({ x: p.x, y: p.y - 12 }),
    noon,
  );
  assert.equal(target.measurable, false);
  assert.equal(target.reason, "elevated");
});

test("inspection finds the tapped building and flags blocked corners", async () => {
  // A wider block 3 m north catches the first block's ~6 m noon shadow.
  const data = await dataset([
    { ...block, tags: { building: "yes", "building:levels": "4" } },
    {
      id: "way/200",
      tags: { building: "yes" },
      geometry: [box(-15, -2, 15, 20)],
    },
  ]);
  const target = parseMeasureTarget({
    building: inspectBuilding(data, unproject({ x: p.x, y: p.y - 12 }), noon),
  });
  assert.equal(target.id, "way/100");
  assert.equal(target.measurable, true);
  assert.equal(target.levels, 4);
  assert.equal(target.height.source, "estimated_from_levels");
  assert.equal(
    target.corners.length,
    2,
    "two northern corners cast tips at noon",
  );
  assert.ok(
    target.corners.every((c) => c.clear === false),
    "neighbour blocks both tips",
  );
  // A tap just outside the outline still selects it; far away selects nothing.
  assert.equal(
    inspectBuilding(data, unproject({ x: p.x, y: p.y - 22 }), noon).id,
    "way/100",
  );
  assert.equal(
    inspectBuilding(data, unproject({ x: p.x + 300, y: p.y }), noon),
    null,
  );
  const alone = inspectBuilding(
    await dataset([block]),
    unproject({ x: p.x, y: p.y - 12 }),
    noon,
  );
  assert.ok(alone.corners.every((c) => c.clear === true));
  const night = inspectBuilding(
    await dataset([block]),
    unproject({ x: p.x, y: p.y - 12 }),
    Date.parse("2026-06-21T22:00:00Z"),
  );
  assert.ok(night.corners.every((c) => c.clear === null));
  const tile = await dataset([{ ...block, id: "tile-osm:5" }]);
  assert.equal(
    inspectBuilding(tile, unproject({ x: p.x, y: p.y - 12 }), noon).reason,
    "not_osm",
  );
  assert.throws(() =>
    parseMeasureTarget({
      building: {
        ...target,
        corners: [{ index: 99, coordinate: centre, clear: true }],
      },
    }),
  );
});

test("the ruler starts at the chosen corner and points along the shadow", async () => {
  const data = await dataset([block]);
  const target = inspectBuilding(
    data,
    unproject({ x: p.x, y: p.y - 12 }),
    noon,
  );
  const overlay = buildMeasureOverlay(target, target.corners[0].index, noon);
  assert.deepEqual(overlay.corner, target.corners[0].coordinate);
  assert.equal(overlay.marks[0].label, "5 m");
  assert.equal(
    overlay.marks.at(-1).label,
    "30 m",
    "missing height uses a 15 m guess × 1.5",
  );
  const end = project(overlay.ruler[1]),
    start = project(overlay.ruler[0]);
  assert.ok(
    end.y - start.y > 0 && Math.abs(end.x - start.x) < 1,
    "north at noon",
  );
  const kinds = measureFeatures(overlay).features.map((f) => f.properties.kind);
  assert.ok(
    ["outline", "ruler", "mark", "corner"].every((k) => kinds.includes(k)),
  );
  assert.deepEqual(measureFeatures(null).features, []);
  assert.deepEqual(buildMeasureOverlay(target, null, noon).ruler, []);
});
