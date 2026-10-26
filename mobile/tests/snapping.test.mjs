import assert from "node:assert/strict";
import test from "node:test";
import { initializeDataset } from "../src/engine/data.ts";
import { project, unproject, rect } from "../src/engine/geometry.ts";
import { compareLocalRoutes } from "../src/engine/routing.ts";
import { task } from "../src/engine/task.ts";
const signal = () => new AbortController().signal;
const p = project({ latitude: 44.1733, longitude: 28.6383 });
const at = Date.parse("2026-06-21T09:00:00Z");
const point = (x, y) => ({ x: p.x + x, y: p.y + y });
function raw(reverse = true, curve = false) {
  const a = point(0, 0),
    b = curve ? point(100, 100) : point(400, 0);
  const geometry = curve ? [a, point(100, 0), b] : [a, b];
  const edge = {
    from: 1,
    to: 2,
    way_id: 1,
    highway: "footway",
    position_known: true,
    geometry,
  };
  const area = {
    west: p.x - 1000,
    east: p.x + 1000,
    south: p.y - 1000,
    north: p.y + 1000,
  };
  return {
    schema_version: 1,
    crs: "EPSG:32635",
    pilot_id: "synthetic-only",
    pilot_m: area,
    imported_m: area,
    nodes: [
      { id: 1, point: a },
      { id: 2, point: b },
    ],
    edges: [
      edge,
      ...(reverse
        ? [{ ...edge, from: 2, to: 1, geometry: [...geometry].reverse() }]
        : []),
    ],
    buildings: [],
    metadata: {},
  };
}
async function run(data, a, b) {
  return compareLocalRoutes(
    data,
    {
      schema_version: 1,
      origin: unproject(a),
      destination: unproject(b),
      departure_at: new Date(at).toISOString(),
      departure_timezone: "Europe/Bucharest",
      max_extra_minutes: 0,
      walking_speed_mps: 1.4,
    },
    signal(),
    { now: at },
  );
}
const init = (data) => initializeDataset(data, task(signal()));

test("points beside a long street attach to its middle in both directions without mutating shared data", async () => {
  const data = await init(raw());
  const edges = data.edges.length,
    positions = data.positions.size,
    adjacency = [...data.adjacency.entries()].map(([id, list]) => [
      id,
      [...list],
    ]);
  for (const [a, b] of [
    [point(100, 2), point(350, 2)],
    [point(350, 2), point(100, 2)],
  ]) {
    const result = await run(data, a, b);
    assert.ok(Math.abs(result.routes[0].distance_m - 250) < 0.02);
  }
  assert.equal(data.edges.length, edges);
  assert.equal(data.positions.size, positions);
  assert.deepEqual([...data.adjacency.entries()], adjacency);
});

test("interior attachment preserves one-way access and polyline bends", async () => {
  const directed = await init(raw(false));
  await assert.rejects(run(directed, point(350, 0), point(100, 0)), /conectat/);
  const curved = await run(
    await init(raw(true, true)),
    point(80, 4),
    point(104, 80),
  );
  assert.ok(Math.abs(curved.routes[0].distance_m - 100) < 0.02);
});

test("an address or GPS fix inside a building can reach the street without counting an invented entrance", async () => {
  const input = raw();
  input.buildings = [
    {
      id: "home",
      tags: {},
      geometry: [
        rect({
          west: p.x + 90,
          east: p.x + 110,
          south: p.y + 10,
          north: p.y + 30,
        }),
      ],
    },
  ];
  const result = await run(await init(input), point(100, 20), point(350, 2));
  assert.ok(Math.abs(result.routes[0].distance_m - 250) < 0.02);
  assert.ok(result.warnings.some((s) => s.includes("intrare verificată")));
});

test("a blocked nearest street is skipped for an accessible nearby street and distant points still fail", async () => {
  const input = raw();
  const a = point(0, 50),
    b = point(400, 50);
  input.nodes.push({ id: 3, point: a }, { id: 4, point: b });
  input.edges.push({
    from: 3,
    to: 4,
    way_id: 2,
    highway: "footway",
    position_known: true,
    geometry: [a, b],
  });
  input.buildings = [
    {
      id: "wall",
      tags: {},
      geometry: [
        rect({
          west: p.x + 80,
          east: p.x + 120,
          south: p.y + 5,
          north: p.y + 15,
        }),
      ],
    },
  ];
  const data = await init(input);
  const result = await run(data, point(100, 20), point(350, 50));
  assert.ok(Math.abs(result.routes[0].distance_m - 250) < 0.02);
  await assert.rejects(
    run(data, point(100, 150), point(350, 50)),
    /Locația ta.*75 m/,
  );
});
