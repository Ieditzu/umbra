import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { loadCity } from "./city.mjs";
import { withMeasuredHeights } from "../../mobile/src/engine/data.ts";
import { compareLocalRoutes } from "../../mobile/src/engine/routing.ts";
import { rad, unproject } from "../../mobile/src/engine/geometry.ts";
import { solarPosition } from "../../mobile/src/engine/solar.ts";
import { exposureTotals } from "../../mobile/src/domain/routes.ts";
import { measuredHeights } from "../../mobile/src/domain/measurements.ts";

// Route-effect analysis (docs/shadow-heights.md §7.5, phase 5).
// Re-runs the routing engine on a fixed, seeded set of trips with each height source and
// reports modelled shade versus unknown, how often the recommended route changes, and how
// far measured heights move shadow edges.
//
//   node --experimental-strip-types server/compute/route-effect.mjs \
//     [--heights heights.json] [--gba e025_n45_e030_n40.json] [--trips 20] [--seed 7] \
//     [--at 2026-06-21T07:00:00Z,2026-06-21T13:00:00Z] [--out route-effect.json]
//
// --heights takes the shared export (server/heights/admin.mjs export) or an app study
// export. GBA (CC BY-NC 4.0) is read locally and only aggregates are written.

const GBA_KEY =
  /"osm(\d+)ROU": \{"height": ([-0-9.eE]+|null), "var": ([-0-9.eE]+|null)\}/g;

/** Small deterministic generator so the trip set is reproducible. */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
/** Swap building heights while keeping the spatial index (boxes are unchanged). */
export function withHeights(data, height) {
  let changed = false;
  const buildings = data.buildings.map((b) => {
    const next = height(b);
    if (!next) return b;
    changed = true;
    return { ...b, height: next };
  });
  if (!changed) return data;
  return {
    ...data,
    buildings,
    index: data.index.withItems(buildings),
    maxHeight: buildings.reduce((h, b) => Math.max(h, b.height.high_m), 0),
  };
}
export function scenarios(data, { measured = [], gba = null } = {}) {
  const osmOnly = withHeights(data, (b) =>
    b.height.source === "estimated_from_levels"
      ? { low_m: 0, high_m: 0, source: "missing" }
      : null,
  );
  const result = { missing: osmOnly, floors: data };
  if (gba?.size)
    // GBA replaces floor estimates and fills missing heights; OSM height tags stay first.
    result.gba = withHeights(osmOnly, (b) => {
      const h = gba.get(b.id);
      return b.height.source === "missing" && h > 0 && h <= 1000
        ? { low_m: h, high_m: h, source: "gba_research" }
        : null;
    });
  if (measured.length) result.measured = withMeasuredHeights(data, measured);
  return result;
}
/** Seeded origin/destination pairs 300–1500 m apart along the walking graph. */
export function trips(data, count, seed) {
  const random = rng(seed),
    ids = [...data.positions.keys()],
    result = [];
  for (
    let attempt = 0;
    result.length < count && attempt < count * 50;
    attempt++
  ) {
    const a = ids[Math.floor(random() * ids.length)],
      b = ids[Math.floor(random() * ids.length)];
    const p = data.positions.get(a),
      q = data.positions.get(b);
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d >= 300 && d <= 1500)
      result.push({ origin: unproject(p), destination: unproject(q) });
  }
  return result;
}
const share = (totals, total) => (total > 0 ? totals / total : 0);
export async function routeEffect(data, options) {
  const { trips: list, times, measured = [], gba = null } = options;
  const sets = scenarios(data, { measured, gba });
  const rows = [];
  for (const [i, trip] of list.entries())
    for (const at of times) {
      const q = {
        schema_version: 1,
        ...trip,
        departure_at: at,
        departure_timezone: "Europe/Bucharest",
        max_extra_minutes: 5,
        walking_speed_mps: 1.4,
      };
      const row = { trip: i, at };
      for (const [name, set] of Object.entries(sets)) {
        try {
          const result = await compareLocalRoutes(
            set,
            q,
            new AbortController().signal,
            {
              now: Date.parse(at) - 1000,
              budgetMs: 60000,
            },
          );
          const fastest =
            result.routes.find((r) => r.kind === "fastest") ?? result.routes[0];
          const chosen =
            result.routes.find((r) => r.kind === "balanced") ?? fastest;
          const t = exposureTotals(fastest);
          const c = exposureTotals(chosen);
          row[name] = {
            fastest_shade: share(t.shade, fastest.duration_s),
            fastest_unknown: share(
              t.unknown + t.unshaded_estimate,
              fastest.duration_s,
            ),
            chosen_shade: share(c.shade + c.estimated_shade, chosen.duration_s),
            chosen_unknown: share(
              c.unknown + c.unshaded_estimate,
              chosen.duration_s,
            ),
            // Geometry signature: same coordinates means the same recommendation.
            chosen_signature: chosen.segments
              .flatMap((s) => s.coordinates)
              .map((p) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`)
              .join(";"),
          };
        } catch (error) {
          row[name] = { error: error.message };
        }
      }
      rows.push(row);
    }
  const summary = {};
  for (const name of Object.keys(sets)) {
    const ok = rows.filter((r) => r[name] && !r[name].error);
    const mean = (k) =>
      ok.length ? ok.reduce((s, r) => s + r[name][k], 0) / ok.length : null;
    summary[name] = {
      runs: ok.length,
      failed: rows.length - ok.length,
      fastest_route_shade_share: mean("fastest_shade"),
      fastest_route_unknown_share: mean("fastest_unknown"),
      recommended_route_shade_share: mean("chosen_shade"),
      recommended_route_unknown_share: mean("chosen_unknown"),
      recommended_route_changed_vs_floors: ok.filter(
        (r) =>
          r.floors &&
          !r.floors.error &&
          r[name].chosen_signature !== r.floors.chosen_signature,
      ).length,
    };
  }
  return { summary, rows, edges: edgeShift(data, measured, times) };
}
/** A height change of Δh moves a shadow edge by Δh·cot(e) on flat ground (§7.5). */
export function edgeShift(data, measured, times) {
  const byId = new Map(data.buildings.map((b) => [b.id, b]));
  const shifts = [];
  for (const m of measured) {
    const b = byId.get(m.id);
    if (!b) continue;
    const before =
      b.height.low_m > 0 ? (b.height.low_m + b.height.high_m) / 2 : 0;
    const after = (m.low_m + m.high_m) / 2;
    const c = unproject(b.geometry[0][0][0]);
    for (const at of times) {
      const e = solarPosition(Date.parse(at), c).elevation;
      if (e >= 5) shifts.push(Math.abs(after - before) / Math.tan(rad(e)));
    }
  }
  if (!shifts.length) return { buildings: 0 };
  shifts.sort((a, b) => a - b);
  return {
    buildings: measured.filter((m) => byId.has(m.id)).length,
    mean_shift_m: shifts.reduce((s, v) => s + v, 0) / shifts.length,
    median_shift_m: shifts[shifts.length >> 1],
  };
}
/** Accepts the shared heights export or an app study export. */
export function readHeights(json) {
  if (json.format === "umbra-heights-v1")
    return json.heights
      .filter((h) => h.confirmed && h.low_m > 0)
      .map((h) => ({ id: h.osm_building, low_m: h.low_m, high_m: h.high_m }));
  if (json.format === "umbra-shadow-study-v1")
    return measuredHeights(json.measurements);
  throw Error("Unknown heights file format");
}
async function main() {
  const { values } = parseArgs({
    options: {
      heights: { type: "string" },
      gba: { type: "string" },
      trips: { type: "string", default: "20" },
      seed: { type: "string", default: "7" },
      at: {
        type: "string",
        default:
          "2026-06-21T06:00:00Z,2026-06-21T13:00:00Z,2026-10-27T08:00:00Z",
      },
      out: { type: "string" },
    },
  });
  const data = await loadCity({ copernicus: false }).dataPromise;
  const measured = values.heights
    ? readHeights(JSON.parse(await readFile(values.heights, "utf8")))
    : [];
  let gba = null;
  if (values.gba) {
    gba = new Map();
    const text = await readFile(values.gba, "latin1");
    for (const m of text.matchAll(GBA_KEY))
      if (m[2] !== "null") gba.set(`way/${m[1]}`, Number(m[2]));
  }
  const list = trips(data, Number(values.trips), Number(values.seed));
  const times = values.at.split(",").map((t) => new Date(t).toISOString());
  console.error(
    `${list.length} trips × ${times.length} times; measured buildings: ${measured.length}`,
  );
  const result = await routeEffect(data, { trips: list, times, measured, gba });
  const output = {
    generated_at: new Date().toISOString(),
    trips: list.length,
    times,
    seed: Number(values.seed),
    note: "Modelled exposure only; shade shares are geometric estimates, not field measurements.",
    summary: result.summary,
    edge_shift: result.edges,
  };
  console.log(JSON.stringify(output, null, 2));
  if (values.out)
    await writeFile(
      values.out,
      JSON.stringify({ ...output, rows: result.rows }, null, 2),
    );
}
if (import.meta.url === `file://${process.argv[1]}`) await main();
