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
import type { MeasureOverlay } from "../domain/measureOverlay";

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
                  : polygon.source === "measured"
                    ? "#1E4A3570"
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
  compass = false,
  recenter,
  navigating,
  overview,
  onPan,
  onPick,
  onBounds,
  mapStyle,
  threeD,
  tilted,
  onTiltChange,
  measure = null,
  onTap,
}: {
  fix: LocationFix | null;
  heading: DeviceHeading | null;
  destination: Place | null;
  route: WalkingRoute | null;
  shadows: ShadowLayer | null;
  following: boolean;
  /** Following with the map rotated to the phone's heading. */
  compass?: boolean;
  recenter: number;
  navigating: boolean;
  overview: number;
  onPan: () => void;
  onPick: (point: Coordinate) => void;
  onBounds: (bounds: Bounds, focus?: Coordinate) => void;
  mapStyle: MapStyle;
  threeD: boolean;
  tilted: boolean;
  treesEnabled: boolean;
  onTiltChange: (value: boolean) => void;
  /** Shadow ruler shown while measuring a building. */
  measure?: MeasureOverlay | null;
  measuring?: boolean;
  /** Single tap; used to choose a building while measuring. */
  onTap?: (point: Coordinate) => void;
  /** Changes when confirmed measured heights change, to refetch building geometry. */
  heightsKey?: string;
}) {
  const map = useRef<MapView>(null);
  const fitted = useRef("");
  const ready = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const appliedTilt = useRef(tilted);
  const pitch = useRef(tilted ? 55 : 0);
  const manualGesture = useRef(false);
  const cameraRead = useRef(0);
  const restorePitch = useRef<number | null>(null);
  const positioned = useRef(false);
  const centered = useRef(-1);
  const overviewed = useRef(overview);
  const currentFix = useRef(fix);
  const polygons = useMemo(() => shadowElements(shadows), [shadows]);
  useEffect(() => {
    if (!mapReady || appliedTilt.current === tilted) return;
    appliedTilt.current = tilted;
    cameraRead.current++;
    manualGesture.current = false;
    restorePitch.current = null;
    pitch.current = tilted ? 55 : 0;
    map.current?.animateCamera(
      {
        pitch: tilted ? 55 : 0,
        ...(!tilted ? { heading: 0 } : {}),
        ...(tilted
          ? { zoom: navigating ? 18 : 16, altitude: navigating ? 220 : 900 }
          : {}),
      },
      { duration: 450 },
    );
  }, [tilted, mapReady, navigating]);
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
  // Compass mode turns the camera with the phone; leaving it by tap returns to north-up.
  const lastBearing = useRef<number | null>(null);
  useEffect(() => {
    if (!mapReady) return;
    if (compass && heading) {
      const previous = lastBearing.current;
      const delta =
        previous === null
          ? 360
          : Math.abs(((heading.degrees - previous + 540) % 360) - 180);
      if (delta < 2) return;
      lastBearing.current = heading.degrees;
      map.current?.animateCamera(
        {
          heading: heading.degrees,
          ...(currentFix.current
            ? {
                center: {
                  latitude: currentFix.current.latitude,
                  longitude: currentFix.current.longitude,
                },
              }
            : {}),
        },
        { duration: 250 },
      );
    } else if (!compass && lastBearing.current !== null) {
      lastBearing.current = null;
      if (following)
        map.current?.animateCamera({ heading: 0 }, { duration: 350 });
    }
  }, [compass, heading, following, mapReady]);
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
          appliedTilt.current = tilted;
          onTiltChange(tilted);
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
          pitch.current = tilted ? 55 : 0;
          appliedTilt.current = tilted;
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
          } else if (tilted) {
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
        onPress={(event) => {
          // Marker presses also arrive here; only plain map taps select buildings.
          if (event.nativeEvent.action === "marker-press") return;
          onTap?.(event.nativeEvent.coordinate);
        }}
        mapType={nativeMapType(mapStyle, Platform.OS)}
        showsBuildings={threeD}
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
                  : segment.exposure === "sun" ||
                      segment.exposure === "unshaded_estimate"
                    ? colors.sun
                    : colors.unknown
            }
            strokeWidth={6}
            zIndex={4}
            lineDashPattern={
              segment.exposure === "unknown" ||
              segment.exposure === "unshaded_estimate"
                ? [6, 5]
                : undefined
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
        {measure && measure.outline.length >= 4 && (
          <Polyline
            coordinates={measure.outline}
            strokeColor="#C2410C"
            strokeWidth={3.5}
            zIndex={5}
          />
        )}
        {measure && measure.ruler.length === 2 && (
          <Polyline
            coordinates={measure.ruler}
            strokeColor="#C2410C"
            strokeWidth={3}
            lineDashPattern={[8, 6]}
            zIndex={5}
          />
        )}
        {measure?.marks.map((mark) => (
          <Marker
            key={`mark-${mark.label}`}
            coordinate={mark.coordinate}
            anchor={{ x: 0, y: 0.5 }}
            tracksViewChanges={false}
            zIndex={6}
          >
            <View style={styles.markRow}>
              <View style={styles.markDot} />
              <Text style={styles.markText}>{mark.label}</Text>
            </View>
          </Marker>
        ))}
        {measure?.corner && (
          <Circle
            center={measure.corner}
            radius={1.5}
            fillColor="#C2410C"
            strokeColor="#FFFFFF"
            strokeWidth={2}
            zIndex={6}
          />
        )}
        {measure?.tip && (
          <Circle
            center={measure.tip}
            radius={2}
            fillColor="#2F8F4E"
            strokeColor="#FFFFFF"
            strokeWidth={2}
            zIndex={6}
          />
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
  markRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  markDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#C2410C",
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  markText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#7C2D12",
    backgroundColor: "#FFFFFFD9",
    paddingHorizontal: 3,
    borderRadius: 3,
  },
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
