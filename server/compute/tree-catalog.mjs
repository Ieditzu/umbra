import { unproject } from "../../mobile/src/engine/geometry.ts";

// Geographic bins keep regional requests bounded without duplicating the country data.
export class TreeCatalog {
  constructor(raw) {
    if (
      raw?.schema_version !== 1 ||
      !Array.isArray(raw.trees) ||
      !Array.isArray(raw.rows)
    )
      throw Error("Invalid tree snapshot");
    this.cells = new Map();
    this.timestamp = raw.timestamp;
    const put = (record, a, b = a) => {
      if (![...a, ...b].every(Number.isFinite)) return;
      const west = Math.floor(Math.min(a[0], b[0]) * 20),
        east = Math.floor(Math.max(a[0], b[0]) * 20);
      const south = Math.floor(Math.min(a[1], b[1]) * 20),
        north = Math.floor(Math.max(a[1], b[1]) * 20);
      if (east - west > 2 || north - south > 2) return;
      for (let x = west; x <= east; x++)
        for (let y = south; y <= north; y++) {
          const key = `${x}:${y}`,
            cell = this.cells.get(key) ?? [];
          cell.push(record);
          this.cells.set(key, cell);
        }
    };
    for (const [id, lon, lat, height, crown, cycle, leafType] of raw.trees) {
      const record = {
        id: `tree-${id}`,
        start: { longitude: lon, latitude: lat },
        height,
        crown,
        cycle,
        leafType,
      };
      put(record, [lon, lat]);
    }
    for (const [id, points, height, crown, cycle, leafType] of raw.rows) {
      if (!Array.isArray(points)) continue;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i];
        if (!Array.isArray(a) || !Array.isArray(b)) continue;
        // Split long mapped segments so spatial queries and rendered shadows stay local.
        const metres = Math.hypot(
          (a[0] - b[0]) * 80000,
          (a[1] - b[1]) * 111000,
        );
        if (!Number.isFinite(metres) || metres > 2000) continue;
        const count = Math.max(1, Math.ceil(metres / 40));
        for (let part = 0; part < count; part++) {
          const interpolate = (t) => [
            a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
          ];
          const p = interpolate(part / count),
            q = interpolate((part + 1) / count);
          put(
            {
              id: `row-${id}-${i}-${part}`,
              start: { longitude: p[0], latitude: p[1] },
              end: { longitude: q[0], latitude: q[1] },
              height,
              crown,
              cycle,
              leafType,
            },
            p,
            q,
          );
        }
      }
    }
  }
  forArea(box) {
    const corners = [
      unproject({ x: box.west, y: box.south }),
      unproject({ x: box.west, y: box.north }),
      unproject({ x: box.east, y: box.south }),
      unproject({ x: box.east, y: box.north }),
    ];
    const west = Math.floor(
        (Math.min(...corners.map((p) => p.longitude)) - 0.01) * 20,
      ),
      east = Math.floor(
        (Math.max(...corners.map((p) => p.longitude)) + 0.01) * 20,
      ),
      south = Math.floor(
        (Math.min(...corners.map((p) => p.latitude)) - 0.01) * 20,
      ),
      north = Math.floor(
        (Math.max(...corners.map((p) => p.latitude)) + 0.01) * 20,
      );
    const records = new Set();
    for (let x = west; x <= east; x++)
      for (let y = south; y <= north; y++)
        for (const item of this.cells.get(`${x}:${y}`) ?? []) records.add(item);
    return [...records];
  }
}
