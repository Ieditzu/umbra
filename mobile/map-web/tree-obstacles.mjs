// Visual clearance only; walking-graph geometry remains untouched.
const R = 6378137;
const project = ([lon, lat]) => [
  (R * lon * Math.PI) / 180,
  R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
];
const cellSize = 100;
function inside(point, ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      hit = !hit;
  }
  return hit;
}
function segmentDistance(p, a, b) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    length = dx * dx + dy * dy;
  const t = length
    ? Math.max(
        0,
        Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length),
      )
    : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function roadHalfWidth(feature) {
  const p = feature.properties ?? {},
    cls = p.class;
  if (p.brunnel === "tunnel" || p.layer < 0) return 0;
  return (
    {
      motorway: 9,
      busway: 4,
      trunk: 7,
      primary: 6,
      secondary: 5,
      tertiary: 4.5,
      minor: 3.5,
      street: 3.5,
      street_limited: 3,
      service: 2.5,
      track: 2,
      path: 1.2,
      pedestrian: 1.5,
      rail: 2,
      transit: 2,
    }[cls] ?? 0
  );
}
export function createObstacleIndex(buildings, roads) {
  const grid = new Map();
  const add = (item, west, south, east, north) => {
    const x0 = Math.floor(west / cellSize),
      x1 = Math.floor(east / cellSize),
      y0 = Math.floor(south / cellSize),
      y1 = Math.floor(north / cellSize);
    if (
      ![x0, x1, y0, y1].every(Number.isFinite) ||
      (x1 - x0 + 1) * (y1 - y0 + 1) > 4000
    )
      return;
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const k = `${x}:${y}`,
          list = grid.get(k) ?? [];
        list.push(item);
        grid.set(k, list);
      }
  };
  for (const feature of buildings ?? []) {
    if (feature.geometry?.type !== "Polygon") continue;
    const rings = feature.geometry.coordinates;
    if (
      !Array.isArray(rings) ||
      !rings.length ||
      !rings.every((r) => Array.isArray(r) && r.length >= 4)
    )
      continue;
    const shape = rings.map((r) => r.map(project));
    const outer = shape[0];
    let w = Infinity,
      s = Infinity,
      e = -Infinity,
      n = -Infinity;
    for (const [x, y] of outer) {
      w = Math.min(w, x);
      s = Math.min(s, y);
      e = Math.max(e, x);
      n = Math.max(n, y);
    }
    add({ kind: "building", shape }, w, s, e, n);
  }
  for (const feature of roads ?? []) {
    const halfWidth = roadHalfWidth(feature);
    if (!halfWidth) continue;
    const geom = feature.geometry;
    const lines =
      geom?.type === "LineString"
        ? [geom.coordinates]
        : geom?.type === "MultiLineString"
          ? geom.coordinates
          : [];
    for (const line of lines) {
      if (!Array.isArray(line)) continue;
      for (let i = 1; i < line.length; i++) {
        const a = project(line[i - 1]),
          b = project(line[i]);
        // Put only neighboring cells around each segment; the query adds the tree radius.
        const buffer = halfWidth / 0.6;
        add(
          {
            kind: "road",
            a,
            b,
            halfWidth,
            pedestrian: ["path", "pedestrian"].includes(
              feature.properties?.class,
            ),
          },
          Math.min(a[0], b[0]) - buffer,
          Math.min(a[1], b[1]) - buffer,
          Math.max(a[0], b[0]) + buffer,
          Math.max(a[1], b[1]) + buffer,
        );
      }
    }
  }
  return {
    blocked(tree) {
      const p = project(tree.center),
        cosine = Math.max(0.1, Math.cos((tree.center[1] * Math.PI) / 180));
      const clearance = (tree.radius * 1.12 + 0.5) / cosine;
      const ids = new Set();
      const x0 = Math.floor((p[0] - clearance) / cellSize),
        x1 = Math.floor((p[0] + clearance) / cellSize),
        y0 = Math.floor((p[1] - clearance) / cellSize),
        y1 = Math.floor((p[1] + clearance) / cellSize);
      for (let x = x0; x <= x1; x++)
        for (let y = y0; y <= y1; y++)
          for (const item of grid.get(`${x}:${y}`) ?? []) ids.add(item);
      for (const item of ids) {
        if (item.kind === "road") {
          if (
            segmentDistance(p, item.a, item.b) <
            (item.pedestrian ? 0.4 / cosine : clearance) +
              item.halfWidth / cosine
          )
            return true;
        } else {
          const [outer, ...holes] = item.shape;
          if (inside(p, outer) && !holes.some((r) => inside(p, r))) return true;
          for (const ring of item.shape)
            for (let i = 1; i < ring.length; i++)
              if (segmentDistance(p, ring[i - 1], ring[i]) < clearance)
                return true;
        }
      }
      return false;
    },
  };
}
