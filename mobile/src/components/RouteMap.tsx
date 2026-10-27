import type { ComponentProps } from "react";
import { RouteMap as NativeRouteMap } from "./NativeRouteMap";
import { LocalRouteMap } from "./LocalRouteMap";

export type RouteMapProps = ComponentProps<typeof NativeRouteMap>;

export function RouteMap(props: RouteMapProps) {
  return props.mapStyle === "map" ? (
    <LocalRouteMap {...props} />
  ) : (
    <NativeRouteMap {...props} />
  );
}
