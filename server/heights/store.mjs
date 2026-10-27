import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  combineMeasurements,
  heightRange,
} from "../../mobile/src/domain/measurements.ts";

// Shared measurement database (docs/shadow-heights.md §6.2, phase 3).
// Raw measurements stay private; only combined, confirmed heights are published.
const SCHEMA = `
create table if not exists measurements (
  id text primary key,
  osm_building text not null,
  contributor text not null,
  method text not null,
  height_m real not null,
  sigma_m real not null,
  length_m real not null,
  corner_x real not null,
  corner_y real not null,
  tip_x real not null,
  tip_y real not null,
  lateral_m real,
  gps_accuracy_m real,
  drone text,
  sun_elevation_deg real not null,
  sun_azimuth_deg real not null,
  measured_at text not null,
  received_at text not null,
  checklist text not null,
  levels integer,
  status text not null,
  reason text not null,
  reviewed integer not null default 0,
  effective_status text not null,
  effective_reason text not null,
  app_version text not null,
  engine_version text not null
);
create index if not exists measurements_building on measurements(osm_building);
create index if not exists measurements_contributor on measurements(contributor);
create index if not exists measurements_review on measurements(effective_status);
create table if not exists building_heights (
  osm_building text primary key,
  height_m real,
  sigma_m real,
  low_m real,
  high_m real,
  count integer not null,
  methods text not null,
  confirmed integer not null,
  updated_at text not null
);
create index if not exists building_heights_updated on building_heights(updated_at);
`;
const row = (r) => ({
  id: r.id,
  osm_building: r.osm_building,
  contributor: r.contributor,
  method: r.method,
  height_m: r.height_m,
  sigma_m: r.sigma_m,
  length_m: r.length_m,
  corner: { x: r.corner_x, y: r.corner_y },
  tip: { x: r.tip_x, y: r.tip_y },
  lateral_m: r.lateral_m,
  gps_accuracy_m: r.gps_accuracy_m,
  drone: r.drone ? JSON.parse(r.drone) : null,
  sun_elevation_deg: r.sun_elevation_deg,
  sun_azimuth_deg: r.sun_azimuth_deg,
  measured_at: r.measured_at,
  checklist: JSON.parse(r.checklist),
  levels: r.levels,
  status: r.status,
  reason: r.reason,
  reviewed: !!r.reviewed,
  observer: "",
  app_version: r.app_version,
  engine_version: r.engine_version,
});
/** Public view: no contributor id, no positions, day-level time. */
const publicRow = (r) => ({
  id: r.id,
  method: r.method,
  height_m: r.height_m,
  sigma_m: r.sigma_m,
  sun_elevation_deg: Math.round(r.sun_elevation_deg * 10) / 10,
  measured_on: r.measured_at.slice(0, 10),
  status: r.effective_status,
  reason: r.effective_reason,
});
export class HeightStore {
  constructor(path = ":memory:") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("pragma journal_mode = wal; pragma foreign_keys = on;");
    this.db.exec(SCHEMA);
    this.revision = 0;
    this.cache = null;
  }
  close() {
    this.db.close();
  }
  find(id) {
    const r = this.db
      .prepare("select * from measurements where id = ?")
      .get(id);
    return r ? { ...row(r), effective_status: r.effective_status } : null;
  }
  /** Insert an evaluated measurement; resubmitting the same id is idempotent for its owner. */
  add(m, contributor, receivedAt = new Date().toISOString()) {
    const existing = this.db
      .prepare("select contributor from measurements where id = ?")
      .get(m.id);
    if (existing)
      return existing.contributor === contributor ? "duplicate" : "conflict";
    this.db
      .prepare(
        `insert into measurements values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      )
      .run(
        m.id,
        m.osm_building,
        contributor,
        m.method,
        m.height_m,
        m.sigma_m,
        m.length_m,
        m.corner.x,
        m.corner.y,
        m.tip.x,
        m.tip.y,
        m.lateral_m,
        m.gps_accuracy_m,
        m.drone ? JSON.stringify(m.drone) : null,
        m.sun_elevation_deg,
        m.sun_azimuth_deg,
        m.measured_at,
        receivedAt,
        JSON.stringify(m.checklist),
        m.levels,
        m.status,
        m.reason,
        m.status,
        m.reason,
        m.app_version,
        m.engine_version,
      );
    this.recompute(m.osm_building, receivedAt);
    return "created";
  }
  remove(id, contributor, at = new Date().toISOString()) {
    const r = this.db
      .prepare(
        "select contributor, osm_building from measurements where id = ?",
      )
      .get(id);
    if (!r) return "not_found";
    if (r.contributor !== contributor) return "forbidden";
    this.db.prepare("delete from measurements where id = ?").run(id);
    this.recompute(r.osm_building, at);
    return "deleted";
  }
  /** "Delete my data": every measurement of one install id. */
  removeContributor(contributor, at = new Date().toISOString()) {
    const buildings = this.db
      .prepare(
        "select distinct osm_building from measurements where contributor = ?",
      )
      .all(contributor)
      .map((r) => r.osm_building);
    const { changes } = this.db
      .prepare("delete from measurements where contributor = ?")
      .run(contributor);
    for (const b of buildings) this.recompute(b, at);
    return Number(changes);
  }
  /** Moderator decision for a needs_review (or any) measurement (§6.8). */
  review(id, status, at = new Date().toISOString()) {
    if (!["accepted", "rejected"].includes(status))
      throw Error("Invalid status");
    const r = this.db
      .prepare("select osm_building from measurements where id = ?")
      .get(id);
    if (!r) return false;
    this.db
      .prepare(
        "update measurements set status = ?, reason = 'reviewed', reviewed = 1 where id = ?",
      )
      .run(status, id);
    this.recompute(r.osm_building, at);
    return true;
  }
  queue() {
    return this.db
      .prepare(
        "select * from measurements where effective_status = 'needs_review' order by received_at",
      )
      .all()
      .map((r) => ({
        ...publicRow(r),
        osm_building: r.osm_building,
        length_m: r.length_m,
        checklist: JSON.parse(r.checklist),
        levels: r.levels,
      }));
  }
  /** Re-run §6.3 for one building and publish the change. */
  recompute(osm, at) {
    const list = this.db
      .prepare(
        "select * from measurements where osm_building = ? order by measured_at",
      )
      .all(osm)
      .map(row);
    const levels = list.findLast((m) => m.levels)?.levels ?? null;
    const estimate = combineMeasurements(list, levels);
    const update = this.db.prepare(
      "update measurements set effective_status = ?, effective_reason = ? where id = ?",
    );
    for (const m of list) {
      const s = estimate?.statuses.get(m.id) ?? {
        status: m.status,
        reason: m.reason,
      };
      update.run(s.status, s.reason, m.id);
    }
    const before = this.db
      .prepare("select * from building_heights where osm_building = ?")
      .get(osm);
    if (!list.length && !before) return;
    const range = estimate ? heightRange(estimate) : null;
    const next = {
      height_m: estimate ? Math.round(estimate.height * 100) / 100 : null,
      sigma_m: estimate ? Math.round(estimate.sigma * 100) / 100 : null,
      low_m: range?.low_m ?? null,
      high_m: range?.high_m ?? null,
      count: estimate?.count ?? 0,
      methods: JSON.stringify(estimate?.methods ?? []),
      confirmed: estimate?.confirmed ? 1 : 0,
    };
    if (before && Object.entries(next).every(([k, v]) => before[k] === v))
      return;
    this.db
      .prepare(
        `insert into building_heights values (?, ?, ?, ?, ?, ?, ?, ?, ?)
         on conflict(osm_building) do update set height_m = excluded.height_m,
         sigma_m = excluded.sigma_m, low_m = excluded.low_m, high_m = excluded.high_m,
         count = excluded.count, methods = excluded.methods, confirmed = excluded.confirmed,
         updated_at = excluded.updated_at`,
      )
      .run(
        osm,
        next.height_m,
        next.sigma_m,
        next.low_m,
        next.high_m,
        next.count,
        next.methods,
        next.confirmed,
        at,
      );
    this.revision++;
    this.cache = null;
  }
  summary(osm) {
    const h = this.db
      .prepare("select * from building_heights where osm_building = ?")
      .get(osm);
    if (!h) return null;
    return {
      osm_building: osm,
      height_m: h.height_m,
      sigma_m: h.sigma_m,
      low_m: h.low_m,
      high_m: h.high_m,
      count: h.count,
      methods: JSON.parse(h.methods),
      confirmed: !!h.confirmed,
      updated_at: h.updated_at,
    };
  }
  building(osm) {
    return {
      summary: this.summary(osm),
      measurements: this.db
        .prepare(
          "select * from measurements where osm_building = ? order by measured_at",
        )
        .all(osm)
        .map(publicRow),
    };
  }
  /** Confirmed heights changed after `since`; unconfirmed entries tell clients to drop them. */
  changedSince(since = "") {
    return this.db
      .prepare(
        "select osm_building from building_heights where updated_at > ? order by updated_at",
      )
      .all(since)
      .map((r) => this.summary(r.osm_building))
      .map((s) =>
        s.confirmed
          ? s
          : {
              osm_building: s.osm_building,
              confirmed: false,
              updated_at: s.updated_at,
            },
      );
  }
  /** Engine input: confirmed ranges only. */
  confirmed() {
    if (!this.cache)
      this.cache = this.db
        .prepare(
          "select osm_building, low_m, high_m from building_heights where confirmed = 1",
        )
        .all()
        .map((r) => ({ id: r.osm_building, low_m: r.low_m, high_m: r.high_m }));
    return this.cache;
  }
  /** Public heights file (§6.6): derived from ODbL OSM footprints, so published under ODbL. */
  exportFile(at = new Date().toISOString()) {
    return {
      format: "umbra-heights-v1",
      generated_at: at,
      license: "ODbL-1.0",
      attribution:
        "Building ids © OpenStreetMap contributors (ODbL 1.0). Heights measured from shadows by Umbra users.",
      heights: this.changedSince("").filter((h) => h.confirmed),
    };
  }
}
