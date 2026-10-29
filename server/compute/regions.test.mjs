import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { RegionTiles, regionalSelection, tileBounds } from "./regions.mjs";
import { decodeRegion } from "./tile-buildings.mjs";
import { visibleBuildings } from "../../mobile/src/engine/buildings.ts";
import { localShadows } from "../../mobile/src/engine/overlay.ts";
const require = createRequire(
  new URL("../../mobile/package.json", import.meta.url),
);
const { PbfWriter } = await import(pathToFileURL(require.resolve("pbf")).href);
const signal = () => new AbortController().signal;
function geometry(rings) {
  let x = 0,
    y = 0;
  const out = [];
  const zig = (v) => (v < 0 ? -v * 2 - 1 : v * 2);
  for (const ring of rings) {
    out.push(9, zig(ring[0][0] - x), zig(ring[0][1] - y));
    x = ring[0][0];
    y = ring[0][1];
    out.push(((ring.length - 1) << 3) | 2);
    for (let i = 1; i < ring.length; i++) {
      out.push(zig(ring[i][0] - x), zig(ring[i][1] - y));
      x = ring[i][0];
      y = ring[i][1];
    }
    out.push(15);
  }
  return out;
}
function fixture(
  rings = [
    [
      [1000, 1000],
      [3000, 1000],
      [3000, 3000],
      [1000, 3000],
    ],
    [
      [1500, 1500],
      [1500, 2500],
      [2500, 2500],
      [2500, 1500],
    ],
  ],
) {
  const tile = new PbfWriter();
  tile.writeMessage(
    3,
    (_, layer) => {
      layer.writeStringField(1, "building");
      layer.writeVarintField(15, 2);
      layer.writeVarintField(5, 4096);
      layer.writeStringField(3, "render_height");
      layer.writeMessage(4, (_, value) => value.writeDoubleField(3, 24), null);
      layer.writeMessage(
        2,
        (_, f) => {
          f.writeVarintField(1, 7);
          f.writePackedVarint(2, [0, 0]);
          f.writeVarintField(3, 3);
          f.writePackedVarint(4, geometry(rings));
        },
        null,
      );
    },
    null,
  );
  return tile.finish();
}

test("Bucharest Cluj Timisoara and Iasi select bounded regional tiles while Constanta keeps its snapshot", () => {
  assert.equal(
    regionalSelection({ bounds: [26.24, 47.64, 26.28, 47.66] }),
    null,
  );
  for (const [longitude, latitude] of [
    [26.102, 44.435],
    [23.59, 46.77],
    [21.23, 45.75],
    [27.59, 47.16],
  ]) {
    const selection = regionalSelection({
      bounds: [
        longitude - 0.005,
        latitude - 0.005,
        longitude + 0.005,
        latitude + 0.005,
      ],
      focus: { longitude, latitude },
    });
    assert.equal(selection.z, 14);
    const b = tileBounds(selection.x, selection.y);
    assert.ok(
      longitude >= b[0] &&
        longitude <= b[2] &&
        latitude >= b[1] &&
        latitude <= b[3],
    );
  }
  assert.equal(
    regionalSelection({ bounds: [28.63, 44.17, 28.64, 44.18] }),
    null,
  );
  assert.throws(
    () => regionalSelection({ bounds: [0, 0, 1, 1] }),
    (e) => e.code === "outside",
  );
});

test("tile downloads use one shared metadata request at most four connections and a cache", async () => {
  let active = 0,
    max = 0,
    calls = 0;
  const tile = fixture();
  const loader = new RegionTiles(async (url) => {
    calls++;
    active++;
    max = Math.max(max, active);
    await new Promise((r) => setTimeout(r, 2));
    active--;
    return new Response(
      url.endsWith("/planet")
        ? JSON.stringify({
            tiles: [
              "https://tiles.openfreemap.org/planet/test/{z}/{x}/{y}.pbf",
            ],
          })
        : tile,
    );
  });
  const selection = regionalSelection({ bounds: [26.1, 44.43, 26.11, 44.44] });
  const [a, b] = await Promise.all([
    loader.load(selection),
    loader.load(selection),
  ]);
  assert.equal(a, b);
  assert.equal(a.tiles.length, 9);
  assert.ok(max <= 4);
  assert.equal(calls, 10);
  await loader.load(selection);
  assert.equal(calls, 10);
});

test("regional polygons retain courtyards and map heights stay separate from source height evidence", async () => {
  const x = 9380,
    y = 5920,
    z = 14,
    b = tileBounds(x, y, z);
  const region = {
    key: "synthetic-only",
    bounds: b,
    tiles: [{ x, y, z, bytes: fixture() }],
  };
  const data = await decodeRegion(region, signal());
  assert.equal(data.nodes.length, 0);
  assert.equal(data.edges.length, 0);
  assert.equal(data.buildings.length, 1);
  assert.equal(data.buildings[0].geometry[0].length, 2);
  assert.equal(data.buildings[0].height.low_m, 0);
  assert.equal(data.buildings[0].height.source, "missing");
  const focus = { longitude: (b[0] + b[2]) / 2, latitude: (b[1] + b[3]) / 2 };
  const shown = await visibleBuildings(data, b, signal(), focus);
  assert.equal(shown.features[0].properties.display_height, 24);
  const layer = await localShadows(data, "2026-06-21T09:00:00Z", b, signal(), {
    displayEstimates: true,
    includeNeutralFootprints: false,
    focus,
  });
  assert.ok(layer.polygons.length > 0);
  assert.ok(layer.polygons.every((p) => p.source === "display_estimate"));
  const noEstimates = await localShadows(
    data,
    "2026-06-21T09:00:00Z",
    b,
    signal(),
    { includeNeutralFootprints: false, focus },
  );
  assert.equal(noEstimates.polygons.length, 0);
});

test("building pieces crossing a tile edge rejoin without losing a side", async () => {
  const x = 9380,
    y = 5920,
    z = 14,
    a = tileBounds(x, y, z),
    b = tileBounds(x + 1, y, z);
  const region = {
    key: "seam-only",
    bounds: [a[0], a[1], b[2], a[3]],
    tiles: [
      {
        x,
        y,
        z,
        bytes: fixture([
          [
            [3500, 1000],
            [4500, 1000],
            [4500, 2000],
            [3500, 2000],
          ],
        ]),
      },
      {
        x: x + 1,
        y,
        z,
        bytes: fixture([
          [
            [-596, 1000],
            [404, 1000],
            [404, 2000],
            [-596, 2000],
          ],
        ]),
      },
    ],
  };
  const data = await decodeRegion(region, signal());
  assert.equal(data.buildings.length, 1);
  const shown = await visibleBuildings(data, region.bounds, signal());
  const ring = shown.features[0].geometry.coordinates[0];
  assert.ok(Math.min(...ring.map((p) => p[0])) < a[2]);
  assert.ok(Math.max(...ring.map((p) => p[0])) > a[2]);
});
