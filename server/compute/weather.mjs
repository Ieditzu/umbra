// City-scale forecast, not a street-level cloud shadow or UV measurement.
const HOUR = 3600000;
const TTL = 20 * 60000;
const TIMEOUT = 1800;
const BASE = "https://api.open-meteo.com/v1/forecast";

export function createWeatherService({ fetcher = fetch, now = Date.now } = {}) {
  const cache = new Map();
  return async function forecast(request) {
    const { origin, destination } = request;
    const departure = Date.parse(request.departure_at);
    if (
      !origin ||
      !destination ||
      !Number.isFinite(departure) ||
      ![
        origin.latitude,
        origin.longitude,
        destination.latitude,
        destination.longitude,
      ].every(Number.isFinite) ||
      Math.abs(origin.latitude) > 90 ||
      Math.abs(destination.latitude) > 90 ||
      Math.abs(origin.longitude) > 180 ||
      Math.abs(destination.longitude) > 180 ||
      departure < now() - 60000 ||
      departure > now() + 15 * 24 * HOUR
    )
      return null;
    const latitude = (
      Math.round(((origin.latitude + destination.latitude) / 2) * 50) / 50
    ).toFixed(2);
    const longitude = (
      Math.round(((origin.longitude + destination.longitude) / 2) * 50) / 50
    ).toFixed(2);
    const key = `${latitude},${longitude}`;
    let entry = cache.get(key);
    if (!entry || entry.expires <= now()) {
      const params = new URLSearchParams({
        latitude,
        longitude,
        hourly: "direct_radiation_instant,cloud_cover",
        timezone: "GMT",
        forecast_days: "16",
        timeformat: "unixtime",
      });
      try {
        const response = await fetcher(`${BASE}?${params}`, {
          signal: AbortSignal.timeout(TIMEOUT),
        });
        if (!response.ok) return null;
        const body = await response.json();
        const h = body?.hourly;
        if (
          !Array.isArray(h?.time) ||
          !Array.isArray(h.direct_radiation_instant) ||
          !Array.isArray(h.cloud_cover) ||
          h.time.length > 400
        )
          return null;
        const points = h.time
          .map((t, i) => ({
            at: t * 1000,
            direct: h.direct_radiation_instant[i],
            cloud: h.cloud_cover[i],
          }))
          .filter(
            (p) =>
              Number.isFinite(p.at) &&
              Number.isFinite(p.direct) &&
              p.direct >= 0 &&
              p.direct <= 1500 &&
              Number.isFinite(p.cloud) &&
              p.cloud >= 0 &&
              p.cloud <= 100,
          )
          .sort((a, b) => a.at - b.at);
        if (points.length < 2) return null;
        entry = { points, expires: now() + TTL, fetchedAt: now() };
        if (cache.size >= 100) cache.delete(cache.keys().next().value);
        cache.set(key, entry);
      } catch {
        return null;
      }
    }
    return {
      ...entry,
      latitude: Number(latitude),
      longitude: Number(longitude),
    };
  };
}

export function atTime(points, at) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    if (at >= a.at && at <= b.at && b.at - a.at <= HOUR * 1.01 && b.at > a.at) {
      const f = (at - a.at) / (b.at - a.at);
      return {
        direct: a.direct + (b.direct - a.direct) * f,
        cloud: a.cloud + (b.cloud - a.cloud) * f,
      };
    }
  }
  return null;
}

// Compare the existing bounded alternatives; do not interpret unknown shade as confirmed sun.
export function applyWeather(comparison, request, forecast) {
  const unavailable = { status: "unavailable" };
  if (
    !forecast ||
    !Array.isArray(comparison.routes) ||
    !comparison.routes.length
  )
    return { ...comparison, weather: unavailable };
  const departure = Date.parse(request.departure_at);
  const start = atTime(forecast.points, departure);
  if (!start) return { ...comparison, weather: unavailable };
  const scores = [];
  for (const route of comparison.routes) {
    let elapsed = 0,
      direct = 0;
    for (const segment of route.segments) {
      // Integrate at short intervals so forecasts changing across an hour boundary are applied.
      const parts = Math.ceil(segment.duration_s / 300);
      for (let i = 0; i < parts; i++) {
        const seconds = segment.duration_s / parts;
        const weather = atTime(
          forecast.points,
          departure + (elapsed + seconds / 2) * 1000,
        );
        if (!weather) return { ...comparison, weather: unavailable };
        const factor =
          segment.exposure === "shade"
            ? 0
            : segment.exposure === "estimated_shade"
              ? 0.5
              : 1;
        direct += weather.direct * factor * seconds;
        elapsed += seconds;
      }
    }
    // Experimental preference: 150 W/m² × one minute of modeled exposure equals one minute of walking.
    scores.push({ id: route.id, score: route.duration_s + direct / 150 });
  }
  scores.sort((a, b) => a.score - b.score);
  return {
    ...comparison,
    weather: {
      status: "available",
      recommended_id: scores[0].id,
      direct_wm2: Math.round(start.direct),
      cloud_percent: Math.round(start.cloud),
      fetched_at: new Date(forecast.fetchedAt).toISOString(),
      source: "Open-Meteo",
    },
    attribution: [
      ...comparison.attribution,
      "Weather data: Open-Meteo.com · CC BY 4.0",
    ],
  };
}
