import type { Coordinate } from "../domain/routes.ts";
import { deg, rad, project, unproject } from "./geometry.ts";
import type { Point } from "./geometry.ts";

export type Sun = { elevation: number; azimuth: number };
const norm = (v: number) => ((v % 360) + 360) % 360;
/** NOAA/Meeus geometric Sun position; azimuth clockwise from true north. */
export function solarPosition(at: number, c: Coordinate): Sun {
  const date = new Date(at),
    jd = at / 86400000 + 2440587.5,
    tt = (jd - 2451545) / 36525;
  const l = norm(280.46646 + tt * (36000.76983 + tt * 0.0003032)),
    m = 357.52911 + tt * (35999.05029 - 0.0001537 * tt),
    ecc = 0.016708634 - tt * (0.000042037 + 0.0000001267 * tt);
  const center =
    Math.sin(rad(m)) * (1.914602 - tt * (0.004817 + 0.000014 * tt)) +
    Math.sin(2 * rad(m)) * (0.019993 - 0.000101 * tt) +
    Math.sin(3 * rad(m)) * 0.000289;
  const omega = 125.04 - 1934.136 * tt,
    lambda = l + center - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const eps =
    23 +
    (26 + (21.448 - tt * (46.815 + tt * (0.00059 - tt * 0.001813))) / 60) / 60 +
    0.00256 * Math.cos(rad(omega));
  const decl = Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lambda))),
    y = Math.tan(rad(eps) / 2) ** 2;
  const eq =
    4 *
    deg(
      y * Math.sin(2 * rad(l)) -
        2 * ecc * Math.sin(rad(m)) +
        4 * ecc * y * Math.sin(rad(m)) * Math.cos(2 * rad(l)) -
        0.5 * y * y * Math.sin(4 * rad(l)) -
        1.25 * ecc * ecc * Math.sin(2 * rad(m)),
    );
  const mins =
    date.getUTCHours() * 60 +
    date.getUTCMinutes() +
    date.getUTCSeconds() / 60 +
    date.getUTCMilliseconds() / 60000;
  const ha = rad(norm((mins + eq + 4 * c.longitude) / 4) - 180),
    lat = rad(c.latitude);
  const cosz =
    Math.sin(lat) * Math.sin(decl) +
    Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
  return {
    elevation: 90 - deg(Math.acos(Math.max(-1, Math.min(1, cosz)))),
    azimuth: norm(
      deg(
        Math.atan2(
          Math.sin(ha),
          Math.cos(ha) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat),
        ),
      ) + 180,
    ),
  };
}
/** Include meridian convergence instead of confusing UTM north with true north. */
export function solarDirection(p: Point, azimuth: number): Point {
  const c = unproject(p),
    d = 100 / 6378137,
    lat = rad(c.latitude),
    lon = rad(c.longitude),
    a = rad(azimuth);
  const lat2 = Math.asin(
    Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(a),
  );
  const lon2 =
    lon +
    Math.atan2(
      Math.sin(a) * Math.sin(d) * Math.cos(lat),
      Math.cos(d) - Math.sin(lat) * Math.sin(lat2),
    );
  const q = project({ latitude: deg(lat2), longitude: deg(lon2) }),
    n = Math.hypot(q.x - p.x, q.y - p.y);
  return { x: (q.x - p.x) / n, y: (q.y - p.y) / n };
}
