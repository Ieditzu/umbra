import type { ComponentProps } from "react";
import { RouteMap as NativeRouteMap } from "./NativeRouteMap";

export type RouteMapProps = ComponentProps<typeof NativeRouteMap>;

export function RouteMap(props: RouteMapProps) {
  return <NativeRouteMap {...props} />;
}
