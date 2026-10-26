import type { Coordinate } from "../domain/routes.ts";

/** WGS84 / UTM 35N metres. The prepared pilot is near its central meridian. */
export type Point = { x: number; y: number };
export type Polygon = Point[][];
export type Box = { west: number; south: number; east: number; north: number };
export const rad = (degrees: number) => (degrees * Math.PI) / 180;
export const deg = (radians: number) => (radians * 180) / Math.PI;
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export const contains = (b: Box, p: Point) =>
  p.x >= b.west && p.x <= b.east && p.y >= b.south && p.y <= b.north;
export const intersects = (a: Box, b: Box) =>
  a.west <= b.east &&
  a.east >= b.west &&
  a.south <= b.north &&
  a.north >= b.south;
export const expand = (b: Box, m: number): Box => ({
  west: b.west - m,
  south: b.south - m,
  east: b.east + m,
  north: b.north + m,
});
export function bounds(points: Point[]): Box {
  const b = {
    west: Infinity,
    south: Infinity,
    east: -Infinity,
    north: -Infinity,
  };
  for (const p of points) {
    b.west = Math.min(b.west, p.x);
    b.east = Math.max(b.east, p.x);
    b.south = Math.min(b.south, p.y);
    b.north = Math.max(b.north, p.y);
  }
  return b;
}
export const rect = (b: Box): Polygon => [
  [
    { x: b.west, y: b.south },
    { x: b.east, y: b.south },
    { x: b.east, y: b.north },
    { x: b.west, y: b.north },
    { x: b.west, y: b.south },
  ],
];
export const length = (points: Point[]) =>
  points.slice(1).reduce((sum, p, i) => sum + distance(points[i], p), 0);
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
function ringContains(ring: Point[], p: Point): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
export function polygonContains(poly: Polygon, p: Point): boolean {
  for (const ring of poly)
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1],
        b = ring[i],
        v = sub(b, a),
        w = sub(p, a);
      if (distance(a, b) < 1e-10) continue;
      if (
        Math.abs(cross(v, w)) < 1e-7 * Math.max(1, distance(a, b)) &&
        w.x * v.x + w.y * v.y >= 0 &&
        w.x * v.x + w.y * v.y <= v.x * v.x + v.y * v.y
      )
        return false;
    }
  return (
    poly.length > 0 &&
    ringContains(poly[0], p) &&
    !poly.slice(1).some((hole) => ringContains(hole, p))
  );
}
function parameters(a: Point, b: Point, poly: Polygon): number[] {
  const out = [0, 1],
    r = sub(b, a);
  for (const ring of poly)
    for (let i = 1; i < ring.length; i++) {
      const c = ring[i - 1],
        s = sub(ring[i], c),
        den = cross(r, s);
      if (Math.abs(den) < 1e-10) continue;
      const t = cross(sub(c, a), s) / den,
        u = cross(sub(c, a), r) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) out.push(t);
    }
  return out.sort((a, b) => a - b);
}
export function firstInteriorDistance(
  a: Point,
  b: Point,
  poly: Polygon,
): number | null {
  const ts = parameters(a, b, poly);
  for (let i = 1; i < ts.length; i++)
    if (
      ts[i] - ts[i - 1] > 1e-9 &&
      polygonContains(poly, lerp(a, b, (ts[i] + ts[i - 1]) / 2))
    )
      return ts[i - 1] * distance(a, b);
  return null;
}

export function project(c: Coordinate): Point {
  const a = 6378137,
    e2 = 0.0066943799901413165,
    k = 0.9996;
  const lat = rad(c.latitude),
    lon = rad(c.longitude - 27),
    ep = e2 / (1 - e2);
  const n = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2),
    t = Math.tan(lat) ** 2,
    cc = ep * Math.cos(lat) ** 2,
    aa = Math.cos(lat) * lon;
  const m =
    a *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * lat -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) *
        Math.sin(2 * lat) +
      ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * lat) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * lat));
  return {
    x:
      500000 +
      k *
        n *
        (aa +
          ((1 - t + cc) * aa ** 3) / 6 +
          ((5 - 18 * t + t * t + 72 * cc - 58 * ep) * aa ** 5) / 120),
    y:
      k *
      (m +
        n *
          Math.tan(lat) *
          (aa ** 2 / 2 +
            ((5 - t + 9 * cc + 4 * cc ** 2) * aa ** 4) / 24 +
            ((61 - 58 * t + t * t + 600 * cc - 330 * ep) * aa ** 6) / 720)),
  };
}
export function unproject(p: Point): Coordinate {
  const a = 6378137,
    e2 = 0.0066943799901413165,
    k = 0.9996,
    ep = e2 / (1 - e2);
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const mu =
    p.y / k / (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));
  const f =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const n = a / Math.sqrt(1 - e2 * Math.sin(f) ** 2),
    r = (a * (1 - e2)) / (1 - e2 * Math.sin(f) ** 2) ** 1.5,
    t = Math.tan(f) ** 2,
    c = ep * Math.cos(f) ** 2,
    d = (p.x - 500000) / (n * k);
  const lat =
    f -
    ((n * Math.tan(f)) / r) *
      ((d * d) / 2 -
        ((5 + 3 * t + 10 * c - 4 * c * c - 9 * ep) * d ** 4) / 24 +
        ((61 + 90 * t + 298 * c + 45 * t * t - 252 * ep - 3 * c * c) * d ** 6) /
          720);
  const lon =
    (d -
      ((1 + 2 * t + c) * d ** 3) / 6 +
      ((5 - 2 * c + 28 * t - 3 * c * c + 8 * ep + 24 * t * t) * d ** 5) / 120) /
    Math.cos(f);
  return { latitude: deg(lat), longitude: 27 + deg(lon) };
}
