import type { Coordinate } from "./routes.ts";

export type DeviceHeading = { degrees: number; timestamp: number };

/** Device compass, never GPS course (which only describes travel). */
export function compassDegrees(sample: {
  trueHeading: number;
  magHeading: number;
  accuracy: number;
}): number | null {
  if (!Number.isFinite(sample.accuracy) || sample.accuracy < 1) return null;
  const valid = (v: number) => Number.isFinite(v) && v >= 0 && v <= 360;
  const value = valid(sample.trueHeading)
    ? sample.trueHeading
    : valid(sample.magHeading)
      ? sample.magHeading
      : null;
  return value === null ? null : value % 360;
}

export function smoothHeading(previous: number, next: number): number {
  // Shortest arc avoids a full turn when crossing north (359° → 1°).
  const delta = ((next - previous + 540) % 360) - 180;
  return (previous + delta * 0.35 + 360) % 360;
}

export function freshHeading(
  heading: DeviceHeading | null,
  now: number,
): boolean {
  return (
    !!heading &&
    Number.isFinite(heading.degrees) &&
    heading.degrees >= 0 &&
    heading.degrees < 360 &&
    heading.timestamp <= now + 1000 &&
    now - heading.timestamp <= 10000
  );
}

/** A ground-projected direction cue, not a camera field-of-view measurement. */
export function headingCone(origin: Coordinate, degrees: number): Coordinate[] {
  const latitude = (origin.latitude * Math.PI) / 180;
  const longitude = (origin.longitude * Math.PI) / 180;
  const angular = 35 / 6378137;
  const ring: Coordinate[] = [origin];
  for (let i = 0; i <= 16; i++) {
    const bearing = ((degrees - 25 + (i * 50) / 16) * Math.PI) / 180;
    const lat = Math.asin(
      Math.sin(latitude) * Math.cos(angular) +
        Math.cos(latitude) * Math.sin(angular) * Math.cos(bearing),
    );
    const lon =
      longitude +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(latitude),
        Math.cos(angular) - Math.sin(latitude) * Math.sin(lat),
      );
    ring.push({
      latitude: (lat * 180) / Math.PI,
      longitude: (lon * 180) / Math.PI,
    });
  }
  ring.push(origin);
  return ring;
}
