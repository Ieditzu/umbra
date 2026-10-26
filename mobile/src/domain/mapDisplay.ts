export type MapStyle = "map" | "satellite" | "terrain";

// Apple Maps uses Flyover for tilted satellite imagery where available.
// Google Maps' terrain basemap has no equivalent MapKit map type.
export function nativeMapType(
  style: MapStyle,
  threeD: boolean,
  platform: string,
): "standard" | "hybrid" | "hybridFlyover" | "terrain" {
  if (style === "satellite")
    return platform === "ios" && threeD ? "hybridFlyover" : "hybrid";
  return style === "terrain" && platform === "android" ? "terrain" : "standard";
}
