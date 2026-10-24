import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { CONSTANȚA, routeCoordinates } from "../domain/routes";
import type { Coordinate, WalkingRoute } from "../domain/routes";
import type { Place } from "../state/PlannerProvider";
import { colors } from "../theme";

export function RouteMap({
  origin,
  destination,
  route,
  onPick,
}: {
  origin: Place | null;
  destination: Place | null;
  route: WalkingRoute | null;
  onPick: (point: Coordinate) => void;
}) {
  const map = useRef<MapView>(null);
  useEffect(() => {
    if (route)
      map.current?.fitToCoordinates(routeCoordinates(route), {
        edgePadding: { top: 75, right: 45, bottom: 75, left: 45 },
        animated: true,
      });
    else if (origin && destination)
      map.current?.fitToCoordinates(
        [origin.coordinate, destination.coordinate],
        {
          edgePadding: { top: 80, right: 60, bottom: 80, left: 60 },
          animated: true,
        },
      );
    else if (origin)
      map.current?.animateToRegion(
        { ...origin.coordinate, latitudeDelta: 0.012, longitudeDelta: 0.012 },
        500,
      );
  }, [origin, destination, route]);
  return (
    <View
      style={styles.container}
      accessibilityLabel="Hartă interactivă pentru alegerea punctelor"
    >
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={CONSTANȚA}
        onPress={(event) => onPick(event.nativeEvent.coordinate)}
        showsCompass
        showsScale
        showsBuildings
        loadingEnabled
        rotateEnabled={false}
        toolbarEnabled={false}
      >
        {origin && (
          <Marker
            coordinate={origin.coordinate}
            title="Plecare"
            description={origin.label}
            pinColor={colors.green}
            identifier="origin"
          />
        )}
        {destination && (
          <Marker
            coordinate={destination.coordinate}
            title="Destinație"
            description={destination.label}
            pinColor={colors.sun}
            identifier="destination"
          />
        )}
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
            lineDashPattern={
              segment.exposure === "unknown" ? [6, 5] : undefined
            }
          />
        ))}
      </MapView>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 230, backgroundColor: colors.greenLight },
});
