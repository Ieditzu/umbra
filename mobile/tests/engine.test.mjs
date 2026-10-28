import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  ATTRIBUTION,
  buildingHeight,
  initializeDataset,
  withCopernicusHeights,
  withMeasuredHeights,
} from "../src/engine/data.ts";
import {
  bounds,
  distance,
  firstInteriorDistance,
  polygonContains,
  project,
  rect,
  unproject,
} from "../src/engine/geometry.ts";
import { solarPosition, solarDirection } from "../src/engine/solar.ts";
import { classifyAt } from "../src/engine/exposure.ts";
import { castShadow, localShadows } from "../src/engine/overlay.ts";
import { compareLocalRoutes } from "../src/engine/routing.ts";
import { task } from "../src/engine/task.ts";
import { unpackDataset } from "../src/engine/packedData.ts";
import { parseShadowLayer } from "../src/domain/shadows.ts";

const centre = { latitude: 44.1733, longitude: 28.6383 },
  p = project(centre);
const at = Date.parse("2026-06-21T09:00:00Z");
const signal = () => new AbortController().signal;
function synthetic() {
  const pilot = {
    west: p.x - 1000,
    south: p.y - 1000,
    east: p.x + 1000,
    north: p.y + 1000,
  };
  const a = { ...p },
    b = { x: p.x + 100, y: p.y },
    c = { x: p.x, y: p.y + 50 },
    d = { x: p.x + 100, y: p.y + 50 };
  const edge = (from, to, geometry) => ({
    from,
    to,
    geometry,
    way_id: from * 10 + to,
    position_known: true,
    highway: "footway",
  });
  return {
    schema_version: 1,
    crs: "EPSG:32635",
    pilot_id: "synthetic-test-only",
    pilot_m: pilot,
    imported_m: pilot,
    nodes: [
      { id: 1, point: a },
      { id: 2, point: b },
      { id: 3, point: c },
      { id: 4, point: d },
    ],
    edges: [
      edge(1, 2, [a, b]),
      edge(1, 3, [a, c]),
      edge(3, 4, [c, d]),
      edge(4, 2, [d, b]),
    ],
    buildings: [],
    metadata: {
      osm_base_timestamp: "synthetic",
      attribution: ATTRIBUTION,
      field_validated: "false",
    },
  };
}
const initialize = (raw) => initializeDataset(raw, task(signal()));
const request = (extra = 5) => ({
  schema_version: 1,
  origin: unproject(p),
  destination: unproject({ x: p.x + 100, y: p.y }),
  departure_at: new Date(at).toISOString(),
  departure_timezone: "Europe/Bucharest",
  max_extra_minutes: extra,
  walking_speed_mps: 1.4,
});
const around = [
  centre.longitude - 0.002,
  centre.latitude - 0.002,
  centre.longitude + 0.002,
  centre.latitude + 0.002,
];
const roof = (tags = { height: "10" }) => ({
  id: "synthetic-building",
  tags,
  geometry: [
    rect({ west: p.x - 10, south: p.y + 5, east: p.x + 10, north: p.y + 15 }),
  ],
});

test("local projection and Sun match independent SPA reference across seasons and DST", () => {
  assert.ok(distance(project(unproject(p)), p) < 0.002);
  for (const [when, elevation, azimuth] of [
    ["2026-06-21T09:00:00Z", 65.10785, 140.921654],
    ["2026-10-25T00:30:00Z", -42.987458, 59.45832],
    ["2026-10-25T01:30:00Z", -33.143967, 73.334045],
    ["2026-12-21T10:00:00Z", 22.383078, 179.139205],
    ["2026-06-21T21:00:00Z", -20.654585, 343.501197],
  ]) {
    const sun = solarPosition(Date.parse(when), centre);
    assert.ok(Math.abs(sun.elevation - elevation) < 0.03, when);
    assert.ok(Math.abs(sun.azimuth - azimuth) < 0.05, when);
  }
  assert.deepEqual(
    solarPosition(Date.parse("2026-10-25T03:30:00+03:00"), centre),
    solarPosition(Date.parse("2026-10-25T00:30:00Z"), centre),
  );
});

test("height provenance never supplies a default for missing or unsupported buildings", () => {
  assert.equal(buildingHeight({}).source, "missing");
  assert.equal(buildingHeight({ height: "1e308" }).source, "missing");
  assert.equal(
    buildingHeight({ height: "10", min_height: "3" }).source,
    "unsupported_elevated",
  );
  assert.deepEqual(buildingHeight({ "building:levels": "2" }), {
    low_m: 5,
    high_m: 10,
    source: "estimated_from_levels",
  });
  assert.equal(buildingHeight({ height: "10 m" }).source, "osm_height_tag");
});

test("city ray index includes every intersected footprint across grid boundaries", async () => {
  const raw = synthetic();
  raw.buildings = Array.from({ length: 100 }, (_, i) => {
    const x = p.x - 900 + (i % 10) * 180,
      y = p.y - 900 + Math.floor(i / 10) * 180;
    return {
      id: `grid-${i}`,
      tags: { height: "20" },
      geometry: [rect({ west: x, south: y, east: x + 40, north: y + 60 })],
    };
  });
  const data = await initialize(raw);
  for (let i = 0; i < 40; i++) {
    const angle = (i * Math.PI) / 20;
    const a = {
      x: p.x - Math.cos(angle) * 990,
      y: p.y - Math.sin(angle) * 990,
    };
    const b = {
      x: p.x + Math.cos(angle) * 990,
      y: p.y + Math.sin(angle) * 990,
    };
    const indexed = new Set(
      data.index.ray(a, b).map((building) => building.id),
    );
    for (const building of data.buildings)
      if (
        building.geometry.some(
          (poly) => firstInteriorDistance(a, b, poly) !== null,
        )
      )
        assert.ok(indexed.has(building.id), building.id);
  }
});

test("city ray length still reaches tall buildings whose low-sun shadows exceed 500 metres", async () => {
  const raw = synthetic();
  raw.imported_m = {
    west: p.x - 5000,
    east: p.x + 5000,
    south: p.y - 5000,
    north: p.y + 5000,
  };
  raw.buildings = [
    {
      id: "synthetic-tall-building",
      tags: { height: "300" },
      geometry: [
        rect({
          west: p.x - 100,
          east: p.x + 100,
          south: p.y + 1000,
          north: p.y + 1100,
        }),
      ],
    },
  ];
  const data = await initialize(raw);
  assert.equal(
    classifyAt(data, p, { elevation: 10, azimuth: 0 }, true).exposure,
    "shade",
  );
  assert.equal(
    classifyAt(data, p, { elevation: 45, azimuth: 0 }, true).exposure,
    "unshaded_estimate",
  );
});

test("ray intersections preserve courtyards and ignore tangent boundary contact", () => {
  const outer = rect({
    west: p.x - 20,
    south: p.y - 20,
    east: p.x + 20,
    north: p.y + 20,
  })[0];
  const hole = rect({
    west: p.x - 5,
    south: p.y - 5,
    east: p.x + 5,
    north: p.y + 5,
  })[0];
  const poly = [outer, hole];
  assert.equal(polygonContains(poly, p), false);
  assert.ok(
    Math.abs(firstInteriorDistance(p, { x: p.x, y: p.y + 100 }, poly) - 5) <
      0.0001,
  );
  assert.equal(
    firstInteriorDistance(
      { x: p.x - 30, y: p.y + 20 },
      { x: p.x + 30, y: p.y + 20 },
      poly,
    ),
    null,
  );
  assert.equal(
    polygonContains([[outer[0], ...outer]], { x: p.x + 10, y: p.y }),
    true,
  );
});

test("ray exposure respects roofs, uncertainty, night and unknown road position", async () => {
  const raw = synthetic();
  raw.buildings = [roof()];
  const data = await initialize(raw),
    sun = { elevation: 45, azimuth: 0 };
  assert.equal(classifyAt(data, p, sun, true).exposure, "shade");
  assert.equal(
    classifyAt(data, { ...p, y: p.y - 30 }, sun, true).exposure,
    "unshaded_estimate",
  );
  assert.equal(
    classifyAt(data, p, { ...sun, elevation: -10 }, true).reason,
    "night",
  );
  assert.equal(
    classifyAt(data, p, { ...sun, elevation: 2 }, true).reason,
    "low_sun",
  );
  assert.equal(
    classifyAt(data, p, sun, false).reason,
    "road_or_grade_position",
  );
  raw.buildings = [roof({})];
  const missing = await initialize(raw);
  assert.equal(classifyAt(missing, p, sun, true).reason, "height_uncertainty");
  assert.equal(classifyAt(missing, p, sun, true).exposure, "unknown");
  assert.equal(
    classifyAt(missing, { ...p, y: p.y - 10 }, sun, true).reason,
    "height_uncertainty",
  );
});

test("Copernicus heights fill missing values as uncertain satellite estimates", async () => {
  const raw = synthetic();
  raw.buildings = [roof({})];
  const original = await initialize(raw);
  const data = withCopernicusHeights(original, { "synthetic-building": 20 });
  const result = classifyAt(data, p, { elevation: 45, azimuth: 0 }, true);
  assert.deepEqual(result, {
    exposure: "estimated_shade",
    reason: "copernicus_2012",
  });
  assert.equal(original.buildings[0].height.source, "missing");
  assert.equal(
    withMeasuredHeights(data, [
      { id: "synthetic-building", low_m: 30, high_m: 32 },
    ]).buildings[0].height.source,
    "measured_shadow",
  );
  const tagged = await initialize({ ...raw, buildings: [roof()] });
  assert.equal(
    withCopernicusHeights(tagged, { "synthetic-building": 20 }).buildings[0]
      .height.source,
    "osm_height_tag",
  );
});

test("swept shadow goes away from the sun and excludes the building itself", () => {
  const poly = roof().geometry[0],
    sun = { elevation: 45, azimuth: 0 },
    direction = solarDirection(p, 0);
  const shapes = castShadow(poly, 10, sun).map((shape) =>
    shape.map((ring) => ring.map(([x, y]) => ({ x, y }))),
  );
  assert.ok(shapes.some((shape) => polygonContains(shape, p)));
  assert.ok(
    !shapes.some((shape) => polygonContains(shape, { ...p, y: p.y + 10 })),
  );
  const points = shapes.flat(2),
    box = bounds(points);
  assert.ok(Math.abs(box.south - (p.y + 5 - direction.y * 10)) < 0.01);
  assert.throws(() => castShadow(poly, NaN, sun));
  assert.throws(() => castShadow(poly, 10, { elevation: 1, azimuth: 0 }));
});

test("shadow sweeps preserve courtyard gaps and concave building notches", () => {
  const outer = rect({
    west: p.x - 20,
    south: p.y - 20,
    east: p.x + 20,
    north: p.y + 20,
  })[0];
  const hole = rect({
    west: p.x - 15,
    south: p.y - 15,
    east: p.x + 15,
    north: p.y + 15,
  })[0];
  const shapes = castShadow([outer, hole], 10, {
    elevation: 45,
    azimuth: 180,
  }).map((shape) => shape.map((ring) => ring.map(([x, y]) => ({ x, y }))));
  assert.ok(
    shapes.some((shape) => polygonContains(shape, { x: p.x, y: p.y - 10 })),
  );
  assert.ok(!shapes.some((shape) => polygonContains(shape, p)));
  const concave = [
    [
      [-20, -20],
      [20, -20],
      [20, -10],
      [-10, -10],
      [-10, 20],
      [-20, 20],
      [-20, -20],
    ].map(([x, y]) => ({ x: p.x + x, y: p.y + y })),
  ];
  const notches = castShadow(concave, 10, { elevation: 45, azimuth: 0 }).map(
    (shape) => shape.map((ring) => ring.map(([x, y]) => ({ x, y }))),
  );
  assert.ok(!notches.some((shape) => polygonContains(shape, p)));
});

test("running overlay work yields to timers and stops when the viewport is cancelled", async () => {
  const raw = synthetic();
  raw.buildings = Array.from({ length: 400 }, (_, i) => ({
    ...roof(),
    id: `synthetic-${i}`,
  }));
  const data = await initialize(raw),
    controller = new AbortController();
  let timerRan = false;
  const timer = setTimeout(() => {
    timerRan = true;
    controller.abort();
  }, 0);
  try {
    await assert.rejects(
      localShadows(data, new Date(at).toISOString(), around, controller.signal),
      /oprit/,
    );
    assert.ok(timerRan);
  } finally {
    clearTimeout(timer);
  }
});

test("local overlays change with time and preserve neutral missing-height footprints", async () => {
  const raw = synthetic();
  raw.buildings = [
    roof(),
    {
      ...roof({}),
      id: "unknown",
      geometry: [
        rect({
          west: p.x + 40,
          south: p.y + 5,
          east: p.x + 60,
          north: p.y + 15,
        }),
      ],
    },
  ];
  const data = await initialize(raw);
  const first = await localShadows(
    data,
    new Date(at).toISOString(),
    around,
    signal(),
  );
  const later = await localShadows(
    data,
    "2026-06-21T14:00:00Z",
    around,
    signal(),
  );
  assert.equal(first.state, "available");
  assert.ok(first.polygons.some((poly) => poly.source === "unknown"));
  assert.ok(first.polygons.some((poly) => poly.source === "osm_height"));
  assert.notDeepEqual(first.polygons, later.polygons);
  const night = await localShadows(
    data,
    "2026-06-21T21:00:00Z",
    around,
    signal(),
  );
  assert.equal(night.state, "night");
  assert.equal(night.polygons.length, 0);
  await assert.rejects(localShadows(data, "bad date", around, signal()));
  await assert.rejects(
    localShadows(
      data,
      new Date(at).toISOString(),
      [20, 40, 20.01, 40.01],
      signal(),
    ),
  );
});

test("local route search returns fastest and a useful shade detour within budget", async () => {
  const data = await initialize(synthetic());
  const samples = [];
  const classify = (point, when, known) => {
    samples.push({ when, known });
    return {
      exposure: point.y > p.y + 1 ? "shade" : "unknown",
      reason: "synthetic",
    };
  };
  const result = await compareLocalRoutes(data, request(), signal(), {
    now: at,
    classify,
  });
  assert.equal(result.routes[0].kind, "fastest");
  assert.ok(Math.abs(result.routes[0].distance_m - 100) < 0.001);
  assert.equal(result.routes[1].kind, "shadiest");
  assert.ok(Math.abs(result.routes[1].distance_m - 200) < 0.001);
  assert.ok(samples.some(({ when }) => when > at + 50000));
  const noDetour = await compareLocalRoutes(data, request(0), signal(), {
    now: at,
    classify,
  });
  assert.equal(noDetour.routes.length, 1);
  const unknown = await compareLocalRoutes(data, request(), signal(), {
    now: at,
  });
  assert.equal(unknown.routes.length, 1);
  assert.ok(
    unknown.routes[0].segments.every((s) => s.exposure === "unshaded_estimate"),
  );
});

test("offline routing rejects disconnected graphs, building-crossing snaps and stale requests", async () => {
  let raw = synthetic();
  raw.edges = raw.edges.filter(
    (e) => (e.from === 1 && e.to === 3) || (e.from === 4 && e.to === 2),
  );
  await assert.rejects(
    compareLocalRoutes(await initialize(raw), request(), signal(), { now: at }),
    /conectat/,
  );
  raw = synthetic();
  raw.buildings = [
    {
      id: "blocking",
      tags: {},
      geometry: [
        rect({
          west: p.x - 10,
          south: p.y + 5,
          east: p.x + 10,
          north: p.y + 15,
        }),
      ],
    },
  ];
  raw.edges = [raw.edges[0]];
  const data = await initialize(raw),
    q = request();
  q.origin = unproject({ x: p.x, y: p.y + 20 });
  await assert.rejects(
    compareLocalRoutes(data, q, signal(), { now: at }),
    /clădire/,
  );
  await assert.rejects(
    compareLocalRoutes(data, request(), signal(), { now: at + 120000 }),
    /prezent/,
  );
  const outside = request();
  outside.destination = { latitude: 45, longitude: 29 };
  await assert.rejects(
    compareLocalRoutes(data, outside, signal(), { now: at }),
    /afara/,
  );
});

test("cancellation and computation budgets interrupt local calculations", async () => {
  const data = await initialize(synthetic()),
    controller = new AbortController();
  controller.abort();
  await assert.rejects(
    compareLocalRoutes(data, request(), controller.signal, { now: at }),
    /oprit/,
  );
  await assert.rejects(
    localShadows(data, new Date(at).toISOString(), around, controller.signal),
    /oprit/,
  );
  await assert.rejects(
    compareLocalRoutes(data, request(), signal(), { now: at, budgetMs: -1 }),
    /mult/,
  );
  const raw = synthetic();
  raw.edges[0].geometry[1] = { x: NaN, y: 1 };
  await assert.rejects(initialize(raw));
});

test("bundled real OSM city works offline across neighbourhoods without any fetch calls", async () => {
  const source = await readFile(
    new URL("../assets/data/constanta-city.json", import.meta.url),
    "utf8",
  );
  const manifest = JSON.parse(
    await readFile(
      new URL("../assets/data/manifest.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(
    createHash("sha256").update(source).digest("hex"),
    manifest.sha256,
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("Unexpected network call");
  };
  try {
    const raw = await unpackDataset(JSON.parse(source), task(signal()));
    assert.equal(
      createHash("sha256").update(JSON.stringify(raw)).digest("hex"),
      manifest.raw_sha256,
    );
    const data = await initialize(raw);
    assert.equal(data.pilot_id, "constanta-city-v1");
    assert.equal(data.nodes.length, manifest.nodes);
    const start = data.nodes[0],
      queue = [start.id],
      seen = new Set(queue);
    let end;
    while (queue.length) {
      const id = queue.shift();
      if (distance(start.point, data.positions.get(id)) > 200) {
        end = id;
        break;
      }
      for (const i of data.adjacency.get(id) ?? [])
        if (!seen.has(data.edges[i].to)) {
          seen.add(data.edges[i].to);
          queue.push(data.edges[i].to);
        }
    }
    assert.ok(end);
    const q = {
      ...request(),
      origin: unproject(start.point),
      destination: unproject(data.positions.get(end)),
    };
    const result = await compareLocalRoutes(data, q, signal(), { now: at });
    assert.ok(result.routes[0].distance_m > 200);
    const view = [28.63, 44.17, 28.64, 44.18];
    const layer = await localShadows(
      data,
      "2026-10-24T09:00:00Z",
      view,
      signal(),
    );
    assert.ok(layer.polygons.length > 100);
    assert.equal(layer.partialCoverage, false);
    for (const [name, latitude, longitude] of [
      ["Inel II", 44.181, 28.609],
      ["Tomis Nord", 44.207, 28.626],
      ["Mamaia", 44.25, 28.621],
      ["Palazu Mare", 44.232, 28.607],
      ["Poarta 6", 44.132, 28.615],
    ]) {
      const local = await localShadows(
        data,
        layer.at,
        [
          longitude - 0.004,
          latitude - 0.004,
          longitude + 0.004,
          latitude + 0.004,
        ],
        signal(),
      );
      assert.equal(local.state, "available", name);
      assert.equal(local.partialCoverage, false, name);
      assert.ok(
        local.polygons.length > 0,
        `${name}: no mapped footprints or shadows`,
      );
      console.log(
        `${name}: ${local.polygons.filter((p) => p.source !== "unknown").length} shadow parts; ${local.polygons.length} total parts.`,
      );
    }
    // Exercise the same geometry validator as the reference API implementation.
    parseShadowLayer(
      {
        type: "FeatureCollection",
        at: layer.at,
        state: layer.state,
        attribution: layer.attribution,
        warnings: layer.warnings,
        features: layer.polygons.map((p) => ({
          properties: { height_source: p.source, building_id: p.id },
          geometry: {
            type: "Polygon",
            coordinates: [p.coordinates, ...p.holes].map((ring) =>
              ring.map((p) => [p.longitude, p.latitude]),
            ),
          },
        })),
      },
      layer.at,
    );
    console.log(
      `Real OSM offline check: ${result.routes[0].distance_m.toFixed(2)} m walk; ${layer.polygons.length} map polygons.`,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("optional map-only shadows use 6 m missing-height volumes and report Sun at the camera without changing source heights", async () => {
  const raw = synthetic();
  raw.buildings = [roof({})];
  const data = await initialize(raw);
  const focus = unproject({ x: p.x + 10, y: p.y + 10 });
  const plain = await localShadows(
    data,
    new Date(at).toISOString(),
    around,
    signal(),
    { includeNeutralFootprints: false, focus },
  );
  const estimated = await localShadows(
    data,
    new Date(at).toISOString(),
    around,
    signal(),
    { displayEstimates: true, includeNeutralFootprints: false, focus },
  );
  assert.equal(plain.polygons.length, 0);
  assert.ok(estimated.polygons.some((p) => p.source === "display_estimate"));
  assert.deepEqual(estimated.sun.location, focus);
  assert.ok(estimated.sun.elevation > 0);
  assert.equal(data.buildings[0].height.low_m, 0);
  const later = await localShadows(
    data,
    "2026-06-21T14:00:00Z",
    around,
    signal(),
    { displayEstimates: true, focus },
  );
  assert.notDeepEqual(estimated.polygons, later.polygons);
  assert.notEqual(estimated.sun.azimuth, later.sun.azimuth);
  const night = await localShadows(
    data,
    "2026-06-21T21:00:00Z",
    around,
    signal(),
    { displayEstimates: true, focus },
  );
  assert.equal(night.polygons.length, 0);
  assert.ok(night.sun.elevation < 0);
});

test("tree estimates can improve route selection without being reported as measured shade", async () => {
  const raw = synthetic();
  for (const node of raw.nodes)
    if (node.point.y > p.y + 1) node.point.y = p.y + 20;
  for (const edge of raw.edges)
    for (const point of edge.geometry)
      if (point.y > p.y + 1) point.y = p.y + 20;
  const data = await initialize(raw);
  const result = await compareLocalRoutes(data, request(), signal(), {
    now: at,
    classify: (point) => ({
      exposure: point.y > p.y + 1 ? "estimated_shade" : "unknown",
      reason: "estimated_tree_canopy",
    }),
  });
  assert.equal(result.routes[0].kind, "fastest");
  assert.equal(result.routes[1].kind, "shadiest");
  assert.ok(
    result.routes[1].segments.some(
      (segment) => segment.exposure === "estimated_shade",
    ),
  );
  assert.ok(
    result.routes[1].segments.every((segment) => segment.exposure !== "shade"),
  );
});
