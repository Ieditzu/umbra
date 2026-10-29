import type { Coordinate } from "../domain/routes";

export type SearchPlace = {
  coordinate: Coordinate;
  label: string;
  detail: string;
};

export function parsePlaces(data: unknown): SearchPlace[] {
  if (!data || typeof data !== "object" || !Array.isArray((data as { features?: unknown }).features)) return [];
  return (data as { features: unknown[] }).features.flatMap((feature): SearchPlace[] => {
    if (!feature || typeof feature !== "object") return [];
    const item = feature as { geometry?: { coordinates?: unknown }; properties?: Record<string, unknown> };
    const coordinates = item.geometry?.coordinates;
    const p = item.properties;
    if (!Array.isArray(coordinates) || !p || typeof p.countrycode !== "string" || p.countrycode.toUpperCase() !== "RO" || typeof coordinates[0] !== "number" || typeof coordinates[1] !== "number" || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1]) || Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[1]) > 90) return [];
    const field = (key: string) => typeof p[key] === "string" ? (p[key] as string).trim() : "";
    const street = [field("street"), field("housenumber")].filter(Boolean).join(" ");
    const label = field("name") || street || field("city") || field("country");
    if (!label) return [];
    const detail = [...new Set([street, field("district") || field("locality"), field("city"), field("county"), field("country")].filter((part) => part && part !== label))].join(", ");
    return [{ coordinate: { latitude: coordinates[1], longitude: coordinates[0] }, label, detail }];
  });
}

export async function searchPlaces(query: string, near: Coordinate | null, signal: AbortSignal): Promise<SearchPlace[]> {
  const params = new URLSearchParams({ q: query, limit: "8", countrycode: "RO", location_bias_scale: "0.1" });
  if (near) {
    params.set("lat", String(near.latitude));
    params.set("lon", String(near.longitude));
  }
  const response = await fetch(`https://photon.komoot.io/api/?${params}`, { signal });
  if (!response.ok) throw new Error("Căutarea este momentan indisponibilă.");
  const places = parsePlaces(await response.json());
  if (near) {
    const scale = Math.cos(near.latitude * Math.PI / 180);
    const distance = (place: SearchPlace) => Math.hypot(place.coordinate.latitude - near.latitude, (place.coordinate.longitude - near.longitude) * scale);
    places.sort((a, b) => distance(a) - distance(b));
  }
  return places;
}
