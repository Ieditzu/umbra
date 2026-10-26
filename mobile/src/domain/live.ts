import { distanceBetween, isCoordinate } from "./routes.ts";
import type { Coordinate } from "./routes.ts";

export type LocationFix = Coordinate & { timestamp: number; accuracy: number };
export function freshFix(fix: LocationFix | null, now: number): boolean {
  return (
    !!fix &&
    isCoordinate(fix) &&
    Number.isFinite(fix.accuracy) &&
    fix.accuracy >= 0 &&
    fix.timestamp <= now + 5000 &&
    now - fix.timestamp <= 30000
  );
}

export type RouteAttempt = { origin: Coordinate; key: string; at: number };
export function shouldRefreshRoute(
  previous: RouteAttempt | null,
  origin: Coordinate,
  key: string,
  now: number,
): boolean {
  if (!previous || previous.key !== key) return true;
  if (now - previous.at < 10000) return false;
  return (
    distanceBetween(previous.origin, origin) >= 25 || now - previous.at >= 60000
  );
}
