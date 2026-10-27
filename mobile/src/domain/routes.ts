export type Coordinate = { latitude: number; longitude: number };
export type Exposure = "shade" | "estimated_shade" | "sun" | "unknown";
export type RouteKind = "fastest" | "balanced" | "shadiest";
export type RouteSegment = {
  coordinates: Coordinate[];
  duration_s: number;
  exposure: Exposure;
};
export type WalkingRoute = {
  id: string;
  kind: RouteKind;
  distance_m: number;
  duration_s: number;
  segments: RouteSegment[];
};
export type RouteRequest = {
  schema_version: 1;
  origin: Coordinate;
  destination: Coordinate;
  departure_at: string;
  departure_timezone: string;
  max_extra_minutes: number;
  walking_speed_mps: number;
};
export type RouteComparison = {
  schema_version: 1;
  departure_at: string;
  generated_at: string;
  method: string;
  routes: WalkingRoute[];
  warnings: string[];
  attribution: string[];
};

export const CONSTANȚA = {
  latitude: 44.1733,
  longitude: 28.6383,
  latitudeDelta: 0.035,
  longitudeDelta: 0.035,
};

export function isCoordinate(value: unknown): value is Coordinate {
  if (!value || typeof value !== "object") return false;
  const point = value as Coordinate;
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180
  );
}

export function distanceBetween(a: Coordinate, b: Coordinate): number {
  const radians = Math.PI / 180;
  const dlat = (b.latitude - a.latitude) * radians;
  const dlon = (b.longitude - a.longitude) * radians;
  const value =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a.latitude * radians) *
      Math.cos(b.latitude * radians) *
      Math.sin(dlon / 2) ** 2;
  return (
    6371000 *
    2 *
    Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)))
  );
}

export function makeRouteRequest(
  origin: Coordinate | null,
  destination: Coordinate | null,
  departure: Date,
  now: Date,
  extra: number,
  timezone: string,
): RouteRequest {
  if (!isCoordinate(origin) || !isCoordinate(destination))
    throw new Error("Alege punctul de plecare și destinația pe hartă.");
  const distance = distanceBetween(origin, destination);
  if (distance < 25)
    throw new Error(
      "Alege două puncte aflate la cel puțin 25 m unul de altul.",
    );
  if (distance > 20000)
    throw new Error(
      "Pentru prima versiune, alege un traseu pietonal mai scurt de 20 km în linie dreaptă.",
    );
  if (
    !Number.isFinite(departure.getTime()) ||
    departure.getTime() < now.getTime() - 60000
  )
    throw new Error("Alege o oră de plecare din prezent sau viitor.");
  if (![0, 5, 10, 15].includes(extra))
    throw new Error("Ocolul maxim trebuie să fie 0, 5, 10 sau 15 minute.");
  return {
    schema_version: 1,
    origin,
    destination,
    departure_at: departure.toISOString(),
    departure_timezone: timezone,
    max_extra_minutes: extra,
    walking_speed_mps: 1.4,
  };
}

export function exposureTotals(route: WalkingRoute): Record<Exposure, number> {
  return route.segments.reduce(
    (totals, segment) => ({
      ...totals,
      [segment.exposure]: totals[segment.exposure] + segment.duration_s,
    }),
    { shade: 0, estimated_shade: 0, sun: 0, unknown: 0 },
  );
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Răspuns invalid de la serviciul de trasee.");
  return value as Record<string, unknown>;
}

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function parseComparison(
  raw: unknown,
  request: RouteRequest,
): RouteComparison {
  const result = object(raw);
  if (
    result.schema_version !== 1 ||
    result.departure_at !== request.departure_at ||
    typeof result.method !== "string" ||
    !result.method.trim() ||
    typeof result.generated_at !== "string" ||
    !Number.isFinite(Date.parse(result.generated_at))
  )
    throw new Error("Răspunsul nu corespunde cererii curente.");
  if (
    !Array.isArray(result.routes) ||
    !result.routes.length ||
    result.routes.length > 3
  )
    throw new Error("Serviciul nu a returnat trasee valide.");
  const ids = new Set<string>(),
    kinds = new Set<string>();
  const routes = result.routes.map((value) => {
    const route = object(value);
    if (
      typeof route.id !== "string" ||
      !route.id ||
      ids.has(route.id) ||
      typeof route.kind !== "string" ||
      !["fastest", "balanced", "shadiest"].includes(route.kind) ||
      kinds.has(route.kind) ||
      !positive(route.distance_m) ||
      !positive(route.duration_s) ||
      !Array.isArray(route.segments) ||
      !route.segments.length ||
      route.segments.length > 5000
    )
      throw new Error("Un traseu conține date invalide.");
    ids.add(route.id);
    kinds.add(route.kind);
    const segments = route.segments.map((rawSegment) => {
      const segment = object(rawSegment);
      if (
        !["shade", "estimated_shade", "sun", "unknown"].includes(
          segment.exposure as string,
        ) ||
        !positive(segment.duration_s) ||
        !Array.isArray(segment.coordinates) ||
        segment.coordinates.length < 2 ||
        segment.coordinates.length > 10000 ||
        !segment.coordinates.every(isCoordinate)
      )
        throw new Error("Geometria sau expunerea traseului este invalidă.");
      return {
        coordinates: segment.coordinates,
        duration_s: segment.duration_s,
        exposure: segment.exposure,
      } as RouteSegment;
    });
    for (let i = 1; i < segments.length; i++) {
      if (
        distanceBetween(
          segments[i - 1].coordinates.at(-1)!,
          segments[i].coordinates[0],
        ) > 5
      )
        throw new Error("Traseul are segmente neconectate.");
    }
    const total = segments.reduce(
      (sum, segment) => sum + segment.duration_s,
      0,
    );
    if (
      Math.abs(total - route.duration_s) > 1 ||
      distanceBetween(request.origin, segments[0].coordinates[0]) > 150 ||
      distanceBetween(
        request.destination,
        segments.at(-1)!.coordinates.at(-1)!,
      ) > 150
    )
      throw new Error("Traseul nu corespunde punctelor sau duratei cerute.");
    return {
      id: route.id,
      kind: route.kind,
      distance_m: route.distance_m,
      duration_s: route.duration_s,
      segments,
    } as WalkingRoute;
  });
  const fastest = routes.find((route) => route.kind === "fastest");
  if (!fastest) throw new Error("Lipsește traseul rapid pentru comparație.");
  if (
    routes.some(
      (route) =>
        route.duration_s >
          fastest.duration_s + request.max_extra_minutes * 60 + 1 ||
        route.duration_s < fastest.duration_s - 1,
    )
  )
    throw new Error(
      "Alternativele nu respectă limita de ocol sau traseul rapid.",
    );
  const stringList = (value: unknown): string[] => {
    if (
      !Array.isArray(value) ||
      !value.every((item) => typeof item === "string") ||
      value.length > 100
    )
      throw new Error("Lipsesc informațiile despre sursele datelor.");
    return value as string[];
  };
  const attribution = stringList(result.attribution);
  if (!attribution.length)
    throw new Error("Lipsește atribuirea datelor cartografice.");
  return {
    schema_version: 1,
    departure_at: result.departure_at as string,
    generated_at: result.generated_at as string,
    method: result.method as string,
    routes,
    warnings: stringList(result.warnings),
    attribution,
  };
}

export function routeCoordinates(route: WalkingRoute): Coordinate[] {
  return route.segments.flatMap((segment) => segment.coordinates);
}
export function minutes(seconds: number): string {
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}
export function distanceLabel(meters: number): string {
  return meters < 1000
    ? `${Math.round(meters)} m`
    : `${(meters / 1000).toFixed(1)} km`;
}
