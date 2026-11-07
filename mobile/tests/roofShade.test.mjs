import test from "node:test";
import assert from "node:assert/strict";
import { roofShade } from "../src/engine/roofShade.ts";
import { project, rect } from "../src/engine/geometry.ts";
import { solarDirection } from "../src/engine/solar.ts";
const point = { latitude: 44.175, longitude: 28.636 };
const p = project(point), direction = solarDirection(p, 90);
const center = { x: p.x + direction.x * 20, y: p.y + direction.y * 20 };
const box = (x, y, radius) => ({ west: x-radius, east: x+radius, south: y-radius, north: y+radius });
const roof = { id: "way/1", geometry: [rect(box(p.x, p.y, 5))], height: { low_m: 8, high_m: 10, source: "osm_height_tag" } };
const obstacle = (height) => ({ id: "way/2", geometry: [rect(box(center.x, center.y, 4))], height });
const sun = { elevation: 45, azimuth: 90 };
const data = (buildings) => ({ buildings, index: { ray: () => buildings }, maxHeight: 50, imported_m: box(p.x, p.y, 2000) });
test("a taller building shades a selected roof point and the roof itself is ignored", () => {
  assert.equal(roofShade(data([roof, obstacle({ low_m: 40, high_m: 40, source: "osm_height_tag" })]), point, roof, sun), "blocked");
  assert.equal(roofShade(data([roof]), point, roof, sun), "clear");
  assert.equal(roofShade(data([roof, obstacle({ low_m: 5, high_m: 5, source: "osm_height_tag" })]), point, roof, sun), "clear");
});
test("missing and overlapping heights, coverage and a point outside the roof remain uncertain", () => {
  assert.equal(roofShade(data([roof, obstacle({ low_m: 0, high_m: 0, source: "missing" })]), point, roof, sun), "uncertain");
  assert.equal(roofShade(data([roof, obstacle({ low_m: 20, high_m: 40, source: "estimated_from_levels" })]), point, roof, sun), "uncertain");
  assert.equal(roofShade(data([roof]), { latitude: 44.18, longitude: 28.636 }, roof, sun), "uncertain");
  const missingRoof = { ...roof, height: { low_m: 0, high_m: 0, source: "missing" } };
  assert.equal(roofShade(data([missingRoof]), point, missingRoof, sun), "clear");
  assert.equal(roofShade(data([missingRoof, obstacle({ low_m: 40, high_m: 40, source: "osm_height_tag" })]), point, missingRoof, sun), "uncertain");
  assert.equal(roofShade(data([missingRoof, obstacle({ low_m: 5, high_m: 5, source: "osm_height_tag" })]), point, missingRoof, sun), "clear");
});
