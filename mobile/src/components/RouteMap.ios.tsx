import { RouteMap as NativeRouteMap } from "./NativeRouteMap";
import { LocalRouteMap } from "./LocalRouteMap";
import type { RouteMapProps } from "./RouteMap";

export function RouteMap(props: RouteMapProps) {
  return props.mapStyle === "map" ? (
    <LocalRouteMap {...props} />
  ) : (
    <NativeRouteMap {...props} />
  );
}
