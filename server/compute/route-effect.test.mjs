import assert from "node:assert/strict";
import test from "node:test";
import { loadCity } from "./city.mjs";
import {
  edgeShift,
  readHeights,
  rng,
  routeEffect,
  scenarios,
  trips,
} from "./route-effect.mjs";

test(
  "route-effect compares height sources on reproducible real-city trips",
  { timeout: 120000 },
  async () => {
    const data = await loadCity().dataPromise;
    const a = rng(7),
      b = rng(7);
    assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
    const list = trips(data, 2, 11);
    assert.deepEqual(list, trips(data, 2, 11), "same seed, same trips");
    assert.equal(list.length, 2);
    const levels = data.buildings.find(
      (x) => x.height.source === "estimated_from_levels",
    );
    const missing = data.buildings.find((x) => x.height.source === "missing");
    const measured = [{ id: levels.id, low_m: 40, high_m: 42 }];
    const gba = new Map([[missing.id, 17]]);
    const sets = scenarios(data, { measured, gba });
    assert.deepEqual(Object.keys(sets), [
      "missing",
      "floors",
      "gba",
      "measured",
    ]);
    const find = (set, id) => set.buildings.find((x) => x.id === id).height;
    assert.equal(find(sets.missing, levels.id).source, "missing");
    assert.equal(find(sets.floors, levels.id).source, "estimated_from_levels");
    assert.equal(find(sets.gba, missing.id).low_m, 17);
    assert.equal(find(sets.measured, levels.id).source, "measured_shadow");
    assert.equal(
      data.buildings.find((x) => x.id === levels.id).height.source,
      "estimated_from_levels",
      "shared data untouched",
    );
    // Δh·cot(e): a 20 m change under the ~69° June noon Sun moves the edge ~7.7 m.
    const shift = edgeShift(
      {
        buildings: [
          {
            ...levels,
            height: { low_m: 10, high_m: 10, source: "osm_height_tag" },
          },
        ],
      },
      [{ id: levels.id, low_m: 30, high_m: 30 }],
      ["2026-06-21T10:07:00Z"],
    );
    assert.ok(
      shift.mean_shift_m > 7 && shift.mean_shift_m < 9,
      JSON.stringify(shift),
    );
    const result = await routeEffect(data, {
      trips: list.slice(0, 1),
      times: ["2026-10-27T08:00:00Z"],
      measured,
      gba,
    });
    for (const name of ["missing", "floors", "gba", "measured"]) {
      const s = result.summary[name];
      assert.equal(s.runs + s.failed, 1, name);
      if (s.runs) {
        assert.ok(
          s.fastest_route_shade_share >= 0 && s.fastest_route_shade_share <= 1,
        );
        assert.ok(
          s.fastest_route_unknown_share >= 0 &&
            s.fastest_route_unknown_share <= 1,
        );
      }
    }
    // Floor estimates can only add modelled shade compared with OSM tags alone.
    if (result.summary.floors.runs && result.summary.missing.runs)
      assert.ok(
        result.summary.floors.fastest_route_shade_share >=
          result.summary.missing.fastest_route_shade_share - 1e-9,
      );
    assert.deepEqual(
      readHeights({
        format: "umbra-heights-v1",
        heights: [
          { osm_building: "way/1", confirmed: true, low_m: 9, high_m: 11 },
          { osm_building: "way/2", confirmed: false },
        ],
      }),
      [{ id: "way/1", low_m: 9, high_m: 11 }],
    );
    assert.throws(() => readHeights({ format: "other" }));
  },
);
