import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import MapView, { Circle, Marker, Polygon, Polyline } from "react-native-maps";
import type { Region } from "react-native-maps";
import { CONSTANȚA, distanceBetween, routeCoordinates } from "../domain/routes";
import type { Coordinate, WalkingRoute } from "../domain/routes";
import type { Bounds, ShadowLayer } from "../domain/shadows";
import { headingCone } from "../domain/heading";
import type { DeviceHeading } from "../domain/heading";
import type { LocationFix } from "../domain/live";
import type { Place } from "../state/PlannerProvider";
import { colors } from "../theme";
import { nativeMapType } from "../domain/mapDisplay";
import type { MapStyle } from "../domain/mapDisplay";

function shadowElements(shadows: ShadowLayer | null) {
  return shadows?.polygons.map((polygon) => (
    <Polygon
      key={polygon.id}
      coordinates={polygon.coordinates}
      holes={polygon.holes}
      fillColor={
        polygon.source === "tree_canopy" ||
        polygon.source === "satellite_canopy"
          ? "#5B9C6666"
          : polygon.source === "tree_estimate" ||
              polygon.source === "satellite_estimate"
            ? "#456D8833"
            : polygon.source === "unknown"
              ? "#8795940C"
              : polygon.source === "display_estimate"
                ? "#456D8833"
                : polygon.source === "levels_estimate"
                  ? "#2539493B"
                  : "#1D2B3D70"
      }
      strokeColor={polygon.source === "unknown" ? "#8A94988A" : "#23374728"}
      strokeWidth={polygon.source === "unknown" ? 1 : 0.3}
      lineDashPattern={
        polygon.source === "unknown" || polygon.source === "display_estimate"
          ? [3, 4]
          : undefined
      }
      zIndex={1}
    />
  ));
}

export function RouteMap({
  fix,
  heading,
  destination,
  route,
  shadows,
  following,
  recenter,
  navigating,
  overview,
  onPan,
  onPick,
  onBounds,
  mapStyle,
  threeD,
  onThreeDChange,
}: {
  fix: LocationFix | null;
  heading: DeviceHeading | null;
  destination: Place | null;
  route: WalkingRoute | null;
  shadows: ShadowLayer | null;
  following: boolean;
  recenter: number;
  navigating: boolean;
  overview: number;
  onPan: () => void;
  onPick: (point: Coordinate) => void;
  onBounds: (bounds: Bounds, focus?: Coordinate) => void;
  mapStyle: MapStyle;
  threeD: boolean;
  onThreeDChange: (value: boolean) => void;
}) {
  const map = useRef<MapView>(null);
  const fitted = useRef("");
  const ready = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const appliedThreeD = useRef(threeD);
  const pitch = useRef(threeD ? 55 : 0);
  const manualGesture = useRef(false);
  const cameraRead = useRef(0);
  const restorePitch = useRef<number | null>(null);
  const positioned = useRef(false);
  const centered = useRef(-1);
  const overviewed = useRef(overview);
  const currentFix = useRef(fix);
  const polygons = useMemo(() => shadowElements(shadows), [shadows]);
  useEffect(() => {
    if (!mapReady || appliedThreeD.current === threeD) return;
    appliedThreeD.current = threeD;
    cameraRead.current++;
    manualGesture.current = false;
    restorePitch.current = null;
    pitch.current = threeD ? 55 : 0;
    map.current?.animateCamera(
      {
        pitch: threeD ? 55 : 0,
        ...(!threeD ? { heading: 0 } : {}),
        ...(threeD
          ? { zoom: navigating ? 18 : 16, altitude: navigating ? 220 : 900 }
          : {}),
      },
      { duration: 450 },
    );
  }, [threeD, mapReady, navigating]);
  useEffect(
    () => () => {
      cameraRead.current++;
    },
    [],
  );
  useEffect(() => {
    currentFix.current = fix;
  }, [fix]);
  useEffect(() => {
    if (!destination || !mapReady || navigating) return;
    const points: Coordinate[] = [destination.coordinate];
    if (
      currentFix.current &&
      distanceBetween(currentFix.current, destination.coordinate) <= 20000
    )
      points.unshift(currentFix.current);
    if (points.length > 1) {
      restorePitch.current = pitch.current;
      map.current?.fitToCoordinates(points, {
        edgePadding: { top: 150, left: 65, right: 65, bottom: 260 },
        animated: true,
      });
    } else
      map.current?.animateCamera(
        {
          center: destination.coordinate,
          zoom: 16,
          altitude: 900,
          pitch: pitch.current,
        },
        { duration: 500 },
      );
  }, [destination, mapReady, navigating]);
  useEffect(() => {
    if (following && fix && mapReady) {
      if (!positioned.current || centered.current !== recenter) {
        positioned.current = true;
        centered.current = recenter;
        map.current?.animateCamera(
          {
            center: { latitude: fix.latitude, longitude: fix.longitude },
            zoom: navigating ? 18 : 16,
            altitude: navigating ? 220 : 900,
            pitch: pitch.current,
          },
          { duration: 650 },
        );
      } else
        map.current?.animateCamera(
          {
            center: { latitude: fix.latitude, longitude: fix.longitude },
            pitch: pitch.current,
          },
          { duration: 650 },
        );
    }
  }, [fix, following, recenter, navigating, mapReady]);
  useEffect(() => {
    const key =
      route && destination
        ? `${route.kind}|${destination.coordinate.latitude},${destination.coordinate.longitude}`
        : "";
    const requested = overviewed.current !== overview;
    if (!mapReady || (navigating && !requested)) return;
    overviewed.current = overview;
    if (route && (key !== fitted.current || requested)) {
      fitted.current = key;
      restorePitch.current = pitch.current;
      map.current?.fitToCoordinates(routeCoordinates(route), {
        edgePadding: {
          top: 150,
          left: 55,
          right: 55,
          bottom: navigating ? 240 : 380,
        },
        animated: true,
      });
    }
    if (!route) fitted.current = "";
  }, [route, destination, overview, navigating, mapReady]);
  function bounds(region: Region) {
    onBounds(
      [
        region.longitude - region.longitudeDelta / 2,
        region.latitude - region.latitudeDelta / 2,
        region.longitude + region.longitudeDelta / 2,
        region.latitude + region.latitudeDelta / 2,
      ],
      { latitude: region.latitude, longitude: region.longitude },
    );
    if (!manualGesture.current && restorePitch.current === null) return;
    const fromGesture = manualGesture.current;
    const wantedPitch = restorePitch.current;
    manualGesture.current = false;
    restorePitch.current = null;
    const ticket = ++cameraRead.current;
    void map.current
      ?.getCamera()
      .then((camera) => {
        if (ticket !== cameraRead.current) return;
        if (fromGesture) {
          pitch.current = camera.pitch;
          const tilted = camera.pitch > 2;
          appliedThreeD.current = tilted;
          onThreeDChange(tilted);
        } else if (
          wantedPitch !== null &&
          Math.abs(camera.pitch - wantedPitch) > 1
        ) {
          map.current?.animateCamera({ pitch: wantedPitch }, { duration: 200 });
        }
      })
      .catch(() => {
        /* Keep the existing camera if native readback is unavailable. */
      });
  }
  function beginGesture() {
    cameraRead.current++;
    restorePitch.current = null;
    manualGesture.current = true;
    onPan();
  }
  return (
    <>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={CONSTANȚA}
        onMapReady={() => {
          if (ready.current) return;
          ready.current = true;
          pitch.current = threeD ? 55 : 0;
          appliedThreeD.current = threeD;
          setMapReady(true);
          const point = currentFix.current;
          if (point) {
            positioned.current = true;
            map.current?.animateCamera(
              {
                center: {
                  latitude: point.latitude,
                  longitude: point.longitude,
                },
                zoom: 16,
                altitude: 900,
                pitch: pitch.current,
              },
              { duration: 450 },
            );
          } else if (threeD) {
            map.current?.animateCamera(
              { pitch: 55, zoom: 16, altitude: 900 },
              { duration: 450 },
            );
          }
        }}
        onRegionChangeComplete={bounds}
        onPanDrag={beginGesture}
        onTouchStart={(event) => {
          if (event.nativeEvent.touches.length >= 2) beginGesture();
        }}
        onLongPress={(event) => onPick(event.nativeEvent.coordinate)}
        mapType={nativeMapType(mapStyle, Platform.OS)}
        showsBuildings
        pitchEnabled
        showsCompass={false}
        showsScale={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        loadingEnabled
        rotateEnabled
      >
        {polygons}
        {route?.segments.map((segment, index) => (
          <Polyline
            key={`${route.id}-${index}`}
            coordinates={segment.coordinates}
            strokeColor={
              segment.exposure === "shade"
                ? colors.green
                : segment.exposure === "estimated_shade"
                  ? "#8CAE71"
                  : segment.exposure === "sun"
                    ? colors.sun
                    : colors.unknown
            }
            strokeWidth={6}
            zIndex={4}
            lineDashPattern={
              segment.exposure === "unknown" ? [6, 5] : undefined
            }
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
            {heading && (
              <Polygon
                coordinates={headingCone(fix, heading.degrees)}
                fillColor="#4285F445"
                strokeColor="#4285F47A"
                strokeWidth={1}
                zIndex={7}
              />
            )}
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
      {shadows?.attribution.some((a) => a.includes("OpenMapTiles")) && (
        <Text
          pointerEvents="none"
          style={[styles.dataCredit, { bottom: destination ? 375 : 105 }]}
        >
          © OpenStreetMap · © OpenMapTiles
        </Text>
      )}
    </>
  );
}
const styles = StyleSheet.create({
  dataCredit: {
    position: "absolute",
    left: 8,
    fontSize: 10,
    color: "#4c5660",
    backgroundColor: "#FFFFFFD9",
    padding: 3,
    borderRadius: 4,
  },
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
