import assert from "node:assert/strict";
import test from "node:test";
import {
  castingCorners,
  droneLength,
  expectedSigma,
  heightFromShadow,
  measuringWindows,
  penumbraWidth,
  rulerMarks,
  shadowAxis,
  shadowLength,
  snapGpsTip,
  sunAdvice,
} from "../src/engine/shadowMeasure.ts";
import { polygonContains, project, rect } from "../src/engine/geometry.ts";
import {
  combineMeasurements,
  initialStatus,
  measuredHeights,
  restoreMeasurements,
  restoreReferences,
  evaluateSubmission,
  isSubmission,
  studyCsv,
  studyExport,
} from "../src/domain/measurements.ts";
import { restoreMeasureSettings } from "../src/domain/measureSettings.ts";
import { compass, heightLabel, metres } from "../src/domain/measureText.ts";

const centre = project({ latitude: 44.1733, longitude: 28.6383 });
const near = (a, b, tolerance, label) =>
  assert.ok(Math.abs(a - b) <= tolerance, `${label}: ${a} vs ${b}`);

test("height follows h = L·tan(e) and the documented error table", () => {
  // docs/shadow-heights.md §3.2: a 15 m block at the equinox noon Sun (45.8°).
  const L = shadowLength(15, 45.8);
  near(L, 14.6, 0.05, "shadow length");
  near(heightFromShadow(L, 45.8, 0).height, 15, 1e-9, "inverse");
  // Height error per metre of length error is tan(e): ±5 m GPS at 69.3° ≈ ±13.2 m.
  const summer = heightFromShadow(shadowLength(15, 69.3), 69.3, 5);
  near(summer.sigma, 13.2, 0.2, "summer GPS");
  const december = heightFromShadow(shadowLength(15, 22.4), 22.4, 0.3);
  // Laser ±0.3 m plus a wide winter penumbra still stays well under a floor.
  assert.ok(december.sigma > 0.12 && december.sigma < 0.4, december.sigma);
  assert.ok(december.lengthSigma > 0.3, "penumbra widens the length error");
  assert.throws(() => heightFromShadow(-1, 30, 0.3));
  assert.throws(() => heightFromShadow(10, 0, 0.3));
});

test("penumbra width matches §3.3 for a 30 m block", () => {
  near(penumbraWidth(30, 69.3), 0.32, 0.03, "summer");
  near(penumbraWidth(30, 32.9), 0.94, 0.05, "October");
  near(penumbraWidth(30, 22.4), 1.9, 0.1, "December");
});

test("sun advice and expected error refuse a Sun below 10°", () => {
  assert.equal(sunAdvice(5), "too_low");
  assert.equal(sunAdvice(12), "low");
  assert.equal(sunAdvice(30), "good");
  assert.equal(sunAdvice(50), "high");
  assert.equal(sunAdvice(68), "too_high");
  assert.equal(expectedSigma(20, 8, "phone_gps"), null);
  assert.ok(
    expectedSigma(20, 30, "phone_gps") > expectedSigma(20, 30, "tape_laser"),
  );
});

test("shadow axis points away from the Sun and the ruler marks heights", () => {
  // Constanța solar noon is near 10:07 UTC: the shadow points north.
  const noon = shadowAxis(centre, Date.parse("2026-06-21T10:07:00Z"));
  assert.ok(noon.direction.y > 0.999, JSON.stringify(noon.direction));
  near(Math.hypot(noon.direction.x, noon.direction.y), 1, 1e-9, "unit");
  const morning = shadowAxis(centre, Date.parse("2026-06-21T05:00:00Z"));
  assert.ok(morning.direction.x < -0.5, "morning shadows point west");
  const marks = rulerMarks(centre, noon, 30, 5);
  assert.deepEqual(
    marks.map((m) => m.height),
    [5, 10, 15, 20, 25, 30],
  );
  const ten = marks[1].point;
  near(
    Math.hypot(ten.x - centre.x, ten.y - centre.y),
    shadowLength(10, noon.sun.elevation),
    1e-6,
    "10 m mark",
  );
  const night = shadowAxis(centre, Date.parse("2026-06-21T22:00:00Z"));
  assert.deepEqual(rulerMarks(centre, night, 30), []);
});

test("GPS tip snapping removes the sideways error and averages fixes", () => {
  const axis = {
    sun: { elevation: 30, azimuth: 180 },
    direction: { x: 0, y: 1 },
  };
  const fixes = [
    { point: { x: centre.x + 4, y: centre.y + 20 }, accuracy: 5 },
    { point: { x: centre.x - 2, y: centre.y + 22 }, accuracy: 7 },
    { point: { x: centre.x + 1, y: centre.y + 21 }, accuracy: 6 },
    { point: { x: centre.x + 900, y: centre.y }, accuracy: 120 },
  ];
  const gps = snapGpsTip(centre, axis, fixes);
  assert.equal(gps.samples, 3, "fixes worse than 30 m are dropped");
  near(gps.length, 21, 1e-9, "along the line");
  near(gps.lateral, 1, 1e-9, "sideways offset");
  near(gps.tip.x, centre.x, 1e-9, "snapped onto the line");
  near(gps.accuracy, 6, 1e-9, "mean accuracy, not divided by √n");
  assert.throws(() => snapGpsTip(centre, axis, [fixes[3]]), /GPS/);
});

test("only corners whose tip is on the shadow outline are offered", () => {
  const poly = rect({
    west: centre.x,
    south: centre.y,
    east: centre.x + 20,
    north: centre.y + 10,
  });
  const ring = poly[0];
  const inside = (p) => polygonContains(poly, p);
  // Shadow due north: only the two northern corners cast a visible tip.
  const north = castingCorners(ring, { x: 0, y: 1 }, inside).map(
    (i) => ring[i],
  );
  assert.equal(north.length, 2);
  assert.ok(north.every((p) => Math.abs(p.y - (centre.y + 10)) < 1e-6));
  // Shadow toward north-east: three silhouette corners.
  const diagonal = castingCorners(
    ring,
    { x: Math.SQRT1_2, y: Math.SQRT1_2 },
    inside,
  );
  assert.equal(diagonal.length, 3);
});

test("measuring windows follow the season", () => {
  const day = (iso) => Date.parse(iso);
  // Summer: high noon Sun splits the good band into morning and afternoon.
  assert.equal(
    measuringWindows(centre, day("2026-06-21T00:00:00+03:00")).length,
    2,
  );
  // Late October: the noon Sun (~33°) stays inside the band all middle of the day.
  const october = measuringWindows(centre, day("2026-10-27T00:00:00+02:00"));
  assert.equal(october.length, 1);
  assert.ok(october[0].end - october[0].start > 4 * 3600000);
});

const base = {
  osm_building: "way/42",
  method: "phone_gps",
  corner: { x: centre.x, y: centre.y },
  tip: { x: centre.x, y: centre.y + 20 },
  length_m: 20,
  sun_elevation_deg: 30,
  sun_azimuth_deg: 180,
  checklist: {
    clearGround: true,
    sharpShadow: true,
    roofCorner: true,
    flatGround: true,
  },
  status: "accepted",
  reason: "",
  levels: null,
  lateral_m: 1,
  gps_accuracy_m: 5,
  drone: null,
  observer: "",
  app_version: "0.1.0",
  engine_version: "shadow-measure-1",
};
const m = (id, height, sigma, minutes, extra = {}) => ({
  ...base,
  id,
  height_m: height,
  sigma_m: sigma,
  measured_at: new Date(
    Date.parse("2026-10-27T09:00:00Z") + minutes * 60000,
  ).toISOString(),
  ...extra,
});

test("single measurements are rejected by the §6.3 input rules", () => {
  const ok = base.checklist;
  assert.equal(initialStatus(ok, 8, null, 0).reason, "low_sun");
  assert.equal(
    initialStatus({ ...ok, sharpShadow: false }, 30, null, 0).reason,
    "no_sharp_shadow",
  );
  assert.equal(
    initialStatus({ ...ok, clearGround: false }, 30, null, 0).reason,
    "obstructed_tip",
  );
  assert.equal(
    initialStatus({ ...ok, roofCorner: false }, 30, null, 0).reason,
    "rooftop_structure",
  );
  assert.equal(initialStatus(ok, 30, 12, 8).reason, "off_ruler");
  assert.equal(
    initialStatus({ ...ok, flatGround: false }, 30, 2, 8).status,
    "needs_review",
  );
  assert.equal(initialStatus(ok, 30, 2, 8).status, "accepted");
});

test("measurements combine by inverse variance and need confirmation", () => {
  const single = combineMeasurements([m("a", 20, 3, 0)]);
  assert.equal(single.confirmed, false, "one GPS measurement is not enough");
  const tooClose = combineMeasurements([m("a", 20, 3, 0), m("b", 21, 3, 5)]);
  assert.equal(tooClose.confirmed, false, "5 minutes apart is not independent");
  const pair = combineMeasurements([m("a", 20, 3, 0), m("b", 22, 1, 30)]);
  assert.equal(pair.confirmed, true);
  near(pair.height, (20 / 9 + 22) / (1 / 9 + 1), 1e-9, "weighted mean");
  near(pair.sigma, 1 / Math.sqrt(1 / 9 + 1), 1e-9, "combined sigma");
  const laser = combineMeasurements([
    m("l", 18, 0.3, 0, { method: "tape_laser" }),
  ]);
  assert.equal(laser.confirmed, true, "one laser measurement confirms");
  const outlier = combineMeasurements([
    m("a", 20, 1, 0),
    m("b", 20.5, 1, 30),
    m("c", 40, 1, 60),
  ]);
  assert.equal(outlier.statuses.get("c").reason, "outlier");
  assert.equal(outlier.count, 2);
  // 10 floors cannot be 12 m tall.
  const floors = combineMeasurements(
    [m("a", 12, 0.5, 0, { method: "tape_laser" })],
    10,
  );
  assert.equal(floors, null);
  const rejected = combineMeasurements([
    m("r", 20, 1, 0, { status: "rejected", reason: "low_sun" }),
  ]);
  assert.equal(rejected, null);
});

test("only confirmed buildings become ±2σ height ranges", () => {
  const list = [
    m("a", 20, 3, 0),
    m("l", 31, 0.4, 0, { osm_building: "way/7", method: "tape_laser" }),
  ];
  assert.deepEqual(measuredHeights(list), [
    { id: "way/7", low_m: 30.2, high_m: 31.8 },
  ]);
  const wide = measuredHeights([m("w", 2, 3, 0, { method: "tape_laser" })]);
  assert.equal(wide[0].low_m, 0.5, "lower bound never reaches zero");
});

test("stored measurements survive one corrupt entry and older formats", () => {
  const good = m("good-0001", 20, 3, 0);
  const restored = restoreMeasurements(
    JSON.stringify([
      good,
      { ...good, id: "bad-00001", osm_building: "tile-osm:5" },
      { ...good, id: "x" },
      null,
    ]),
  );
  assert.deepEqual(restored, [{ ...good, upload: "local" }]);
  // Phase-1 entries had no submission fields; they are upgraded, not dropped.
  const old = { ...good, id: "old-00001" };
  for (const k of ["lateral_m", "gps_accuracy_m", "drone", "observer"])
    delete old[k];
  const upgraded = restoreMeasurements(JSON.stringify([old]))[0];
  assert.equal(upgraded.lateral_m, 0);
  assert.equal(upgraded.gps_accuracy_m, 5);
  assert.equal(upgraded.observer, "");
  assert.deepEqual(restoreMeasurements("not json"), []);
  assert.deepEqual(restoreMeasurements(null), []);
});

test("labels use Romanian formatting and the documented source wording", () => {
  assert.equal(metres(30.44), "30,4 m");
  assert.equal(compass(225), "SV");
  assert.equal(compass(-10), "N");
  assert.match(
    heightLabel(
      { low_m: 25, high_m: 38, source: "estimated_from_levels" },
      10,
      null,
    ),
    /10 etaje → 25–38 m/,
  );
  const estimate = combineMeasurements([
    m("l", 30.4, 0.8, 0, { method: "tape_laser" }),
  ]);
  assert.match(
    heightLabel({ low_m: 0, high_m: 0, source: "missing" }, null, estimate),
    /Măsurată: 30,4 m ± 0,8 · 1 măsurătoare · ruletă\/laser/,
  );
});

test("drone photos and different observers confirm buildings", () => {
  const drone = combineMeasurements([
    m("drone-001", 25, 0.6, 0, { method: "drone_nadir" }),
  ]);
  assert.equal(drone.confirmed, true, "a drone photo confirms on its own");
  const sameMinute = [
    m("obs-a-001", 20, 3, 0, { observer: "AP" }),
    m("obs-b-001", 21, 3, 1, { observer: "MI" }),
  ];
  assert.equal(combineMeasurements(sameMinute).confirmed, true);
  const sameObserver = sameMinute.map((x) => ({ ...x, observer: "AP" }));
  assert.equal(combineMeasurements(sameObserver).confirmed, false);
  const reviewed = combineMeasurements(
    [m("rev-00001", 40, 0.5, 0, { method: "tape_laser", reviewed: true })],
    4,
  );
  assert.equal(
    reviewed.confirmed,
    true,
    "moderated values skip the floor check",
  );
});

test("submissions are evaluated identically on phone and server", () => {
  const at = Date.parse("2026-10-27T08:00:00Z");
  const e = shadowAxis(centre, at).sun.elevation;
  const s = {
    id: "eval-0001",
    osm_building: "way/42",
    method: "tape_laser",
    corner: centre,
    length_m: shadowLength(20, e),
    lateral_m: null,
    gps_accuracy_m: null,
    drone: null,
    measured_at: new Date(at).toISOString(),
    checklist: base.checklist,
    app_version: "t",
    engine_version: "t",
  };
  assert.equal(isSubmission(s), true);
  assert.equal(
    isSubmission({ ...s, method: "phone_gps" }),
    false,
    "GPS needs accuracy",
  );
  assert.equal(
    isSubmission({ ...s, method: "drone_nadir" }),
    false,
    "drone needs a photo",
  );
  const result = evaluateSubmission(s, 6);
  near(result.height_m, 20, 0.01, "height");
  assert.equal(result.status, "accepted");
  assert.equal(result.levels, 6);
  near(
    Math.hypot(result.tip.x - centre.x, result.tip.y - centre.y),
    s.length_m,
    0.01,
    "tip",
  );
  const gps = evaluateSubmission(
    { ...s, method: "phone_gps", lateral_m: 2, gps_accuracy_m: 8 },
    null,
  );
  assert.ok(gps.sigma_m > result.sigma_m * 5, "GPS uses max(3 m, accuracy)");
  const photo = {
    altitude_m: 60,
    focal_mm: 8.8,
    sensor_mm: 13.2,
    image_px: 5472,
    shadow_px: 1000,
  };
  near(droneLength(photo).length, 16.45, 0.01, "ground sample distance");
  assert.throws(() => droneLength({ ...photo, altitude_m: 0 }));
});

test("study export keeps rejected attempts and strips install ids", () => {
  const list = [
    m("exp-00001", 20, 3, 0, {
      contributor: "a".repeat(32),
      upload: "sent",
      observer: "AP",
    }),
    m("exp-00002", 0.1, 1000, 5, {
      status: "rejected",
      reason: "low_sun",
      note: 'a "b", c',
    }),
  ];
  const file = studyExport(list, [], "2026-10-27T10:00:00Z");
  assert.equal(file.measurements.length, 2);
  assert.equal(file.measurements[0].contributor, undefined);
  assert.equal(file.measurements[0].upload, undefined);
  assert.equal(file.measurements[0].observer, "AP");
  const csv = studyCsv(list).split("\n");
  assert.equal(csv[0].split(",")[0], "id");
  assert.equal(csv.length, 3);
  assert.match(csv[2], /rejected,low_sun$/);
  const refs = restoreReferences(
    JSON.stringify([
      {
        id: "ref-00001",
        osm_building: "way/42",
        method: "laser_indirect",
        height_m: 21,
        sigma_m: 0.5,
        measured_at: "2026-10-27T10:00:00Z",
        note: "",
        observer: "",
      },
      {
        id: "ref-00002",
        osm_building: "way/42",
        method: "guess",
        height_m: 21,
        sigma_m: 0.5,
        measured_at: "2026-10-27T10:00:00Z",
        note: "",
        observer: "",
      },
    ]),
  );
  assert.deepEqual(
    refs.map((r) => r.id),
    ["ref-00001"],
  );
});

test("measuring settings never enable sharing without a valid install id", () => {
  assert.equal(restoreMeasureSettings(null).contribute, false);
  assert.equal(restoreMeasureSettings('{"contribute":true}').contribute, false);
  const id = "c".repeat(32);
  const s = restoreMeasureSettings(
    JSON.stringify({
      contribute: true,
      contributor: id,
      observer: " AP ",
      pendingDeletes: ["ok-000001", "../x"],
    }),
  );
  assert.equal(s.contribute, true);
  assert.equal(s.observer, "AP");
  assert.deepEqual(s.pendingDeletes, ["ok-000001"]);
  assert.equal(restoreMeasureSettings("{bad").contribute, false);
});
