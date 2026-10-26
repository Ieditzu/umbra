import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import MapView, { Circle, Marker, Polygon, Polyline } from "react-native-maps";
import type { Region } from "react-native-maps";
import { CONSTANȚA, routeCoordinates } from "../domain/routes";
import type { Coordinate, WalkingRoute } from "../domain/routes";
import type { Bounds, ShadowLayer } from "../domain/shadows";
import type { LocationFix } from "../domain/live";
import type { Place } from "../state/PlannerProvider";
import { colors } from "../theme";
import { nativeMapType } from "../domain/mapDisplay";
import type { MapStyle } from "../domain/mapDisplay";

export function RouteMap({
  fix,
  destination,
  route,
  shadows,
  following,
  recenter,
  onPan,
  onPick,
  onBounds,
  mapStyle,
  threeD,
}: {
  fix: LocationFix | null;
  destination: Place | null;
  route: WalkingRoute | null;
  shadows: ShadowLayer | null;
  following: boolean;
  recenter: number;
  onPan: () => void;
  onPick: (point: Coordinate) => void;
  onBounds: (bounds: Bounds) => void;
  mapStyle: MapStyle;
  threeD: boolean;
}) {
  const map = useRef<MapView>(null);
  const fitted = useRef("");
  const ready = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const positioned = useRef(false);
  const centered = useRef(recenter);
  const currentFix = useRef(fix);
  useEffect(() => {
    if (!mapReady) return;
    map.current?.animateCamera(
      {
        pitch: threeD ? 55 : 0,
        ...(threeD ? { zoom: 16, altitude: 900 } : {}),
      },
      { duration: 450 },
    );
  }, [threeD, mapReady]);
  useEffect(() => {
    currentFix.current = fix;
  }, [fix]);
  useEffect(() => {
    if (!destination || !ready.current) return;
    const points: Coordinate[] = [destination.coordinate];
    if (currentFix.current) points.unshift(currentFix.current);
    if (points.length > 1)
      map.current?.fitToCoordinates(points, {
        edgePadding: { top: 150, left: 65, right: 65, bottom: 260 },
        animated: true,
      });
    else
      map.current?.animateToRegion(
        {
          ...destination.coordinate,
          latitudeDelta: 0.008,
          longitudeDelta: 0.008,
        },
        500,
      );
  }, [destination]);
  useEffect(() => {
    if (following && fix && ready.current) {
      if (!positioned.current || centered.current !== recenter) {
        positioned.current = true;
        centered.current = recenter;
        map.current?.animateCamera(
          {
            center: { latitude: fix.latitude, longitude: fix.longitude },
            zoom: 16,
            altitude: 900,
            pitch: threeD ? 55 : 0,
          },
          { duration: 650 },
        );
      } else
        map.current?.animateCamera(
          { center: { latitude: fix.latitude, longitude: fix.longitude } },
          { duration: 650 },
        );
    }
  }, [fix, following, recenter, threeD]);
  useEffect(() => {
    const key =
      route && destination
        ? `${route.kind}|${destination.coordinate.latitude},${destination.coordinate.longitude}`
        : "";
    if (route && key !== fitted.current && ready.current) {
      fitted.current = key;
      map.current?.fitToCoordinates(routeCoordinates(route), {
        edgePadding: { top: 150, left: 55, right: 55, bottom: 280 },
        animated: true,
      });
    }
    if (!route) fitted.current = "";
  }, [route, destination]);
  function bounds(region: Region) {
    onBounds([
      region.longitude - region.longitudeDelta / 2,
      region.latitude - region.latitudeDelta / 2,
      region.longitude + region.longitudeDelta / 2,
      region.latitude + region.latitudeDelta / 2,
    ]);
  }
  return (
    <MapView
      ref={map}
      style={StyleSheet.absoluteFill}
      initialRegion={CONSTANȚA}
      onMapReady={() => {
        ready.current = true;
        setMapReady(true);
        const point = currentFix.current;
        if (point) {
          positioned.current = true;
          map.current?.animateToRegion(
            {
              latitude: point.latitude,
              longitude: point.longitude,
              latitudeDelta: 0.008,
              longitudeDelta: 0.008,
            },
            450,
          );
        }
      }}
      onRegionChangeComplete={bounds}
      onPanDrag={onPan}
      onLongPress={(event) => onPick(event.nativeEvent.coordinate)}
      mapType={nativeMapType(mapStyle, threeD, Platform.OS)}
      showsBuildings
      pitchEnabled={threeD}
      showsCompass={false}
      showsScale={false}
      showsMyLocationButton={false}
      toolbarEnabled={false}
      loadingEnabled
      rotateEnabled={false}
    >
      {shadows?.polygons.map((polygon) => (
        <Polygon
          key={`${shadows.at}-${polygon.id}`}
          coordinates={polygon.coordinates}
          holes={polygon.holes}
          fillColor={
            polygon.source === "unknown"
              ? "#8795940C"
              : polygon.source === "levels_estimate"
                ? "#2539493B"
                : "#1D2B3D70"
          }
          strokeColor={polygon.source === "unknown" ? "#8A94988A" : "#23374728"}
          strokeWidth={polygon.source === "unknown" ? 1 : 0.3}
          lineDashPattern={polygon.source === "unknown" ? [3, 4] : undefined}
          zIndex={1}
        />
      ))}
      {route?.segments.map((segment, index) => (
        <Polyline
          key={`${route.id}-${index}`}
          coordinates={segment.coordinates}
          strokeColor={
            segment.exposure === "shade"
              ? colors.green
              : segment.exposure === "sun"
                ? colors.sun
                : colors.unknown
          }
          strokeWidth={6}
          zIndex={4}
          lineDashPattern={segment.exposure === "unknown" ? [6, 5] : undefined}
        />
      ))}
      {fix && (
        <>
          <Circle
            center={fix}
            radius={Math.min(fix.accuracy, 250)}
            fillColor="#4285F414"
            strokeColor="#4285F42C"
            strokeWidth={1}
          />
          <Marker
            coordinate={fix}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            zIndex={9}
            identifier="live-location"
          >
            <View style={styles.dot}>
              <View style={styles.dotCenter} />
            </View>
          </Marker>
        </>
      )}
      {destination && (
        <Marker
          coordinate={destination.coordinate}
          title={destination.label}
          pinColor={colors.green}
          identifier="destination"
          zIndex={8}
        />
      )}
    </MapView>
  );
}
const styles = StyleSheet.create({
  dot: {
    padding: 4,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#C2D4EB",
  },
  dotCenter: {
    width: 15,
    height: 15,
    borderRadius: 10,
    backgroundColor: "#4285F4",
  },
});
