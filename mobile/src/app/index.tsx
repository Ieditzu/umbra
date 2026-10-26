import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DeparturePicker } from "../components/DeparturePicker";
import { PlaceSearch } from "../components/PlaceSearch";
import { RouteCard } from "../components/RouteCard";
import { RouteMap } from "../components/RouteMap";
import { CONSTANȚA, isCoordinate } from "../domain/routes";
import type { Coordinate } from "../domain/routes";
import { shouldRefreshRoute } from "../domain/live";
import type { RouteAttempt } from "../domain/live";
import type { Bounds } from "../domain/shadows";
import { shadowInstant } from "../domain/shadows";
import { useLiveLocation } from "../hooks/useLiveLocation";
import { useShadowLayer } from "../hooks/useShadowLayer";
import { usePlanner } from "../state/PlannerProvider";
import { colors } from "../theme";
import type { MapStyle } from "../domain/mapDisplay";

const MAP_ACCENT = "#304DC5";

const INITIAL_BOUNDS: Bounds = [
  CONSTANȚA.longitude - 0.02,
  CONSTANȚA.latitude - 0.02,
  CONSTANȚA.longitude + 0.02,
  CONSTANȚA.latitude + 0.02,
];
const shadowStatus: Record<string, string> = {
  available: "Umbre estimate",
  night: "Noapte",
  low_sun: "Soare la orizont",
  loading: "Se actualizează",
  unavailable: "Temporar indisponibile",
  outside: "În afara acoperirii Constanța",
  paused: "În pauză",
  idle: "În așteptare",
  off: "Oprite",
};

export default function MapScreen() {
  const planner = usePlanner();
  const live = useLiveLocation();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [showShadows, setShowShadows] = useState(true);
  const [mapStyle, setMapStyle] = useState<MapStyle>("map");
  const [threeD, setThreeD] = useState(false);
  const [following, setFollowing] = useState(true);
  const [recenter, setRecenter] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const [bounds, setBounds] = useState<Bounds>(INITIAL_BOUNDS);
  const callbacks = useRef({
    updateOrigin: planner.updateOrigin,
    calculate: planner.calculate,
  });
  const lastAttempt = useRef<RouteAttempt | null>(null);
  useEffect(() => {
    callbacks.current = {
      updateOrigin: planner.updateOrigin,
      calculate: planner.calculate,
    };
  }, [planner.updateOrigin, planner.calculate]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 5000);
    const sub = AppState.addEventListener("change", (state) => {
      setForeground(state === "active");
      setClock(Date.now());
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
  useEffect(() => {
    callbacks.current.updateOrigin(
      live.fix
        ? {
            coordinate: {
              latitude: live.fix.latitude,
              longitude: live.fix.longitude,
            },
            label: "Locația mea",
          }
        : null,
    );
  }, [live.fix]);
  const departureKey = planner.departure?.toISOString() ?? "now";
  const snapshotAt = shadowInstant(planner.departure, clock);
  const shadow = useShadowLayer(snapshotAt, bounds, showShadows);
  const route =
    planner.comparison?.routes.find((item) => item.id === planner.selectedId) ??
    null;
  const destination = planner.destination;
  const destinationKey = destination
    ? `${destination.coordinate.latitude},${destination.coordinate.longitude}`
    : "";
  const routeKey = `${destinationKey}|${departureKey}|${planner.settings.maxExtraMinutes}`;
  useEffect(() => {
    if (
      !destinationKey ||
      !live.fix ||
      live.fix.accuracy > 100 ||
      !planner.hydrated ||
      planner.loading ||
      !foreground ||
      planner.origin?.coordinate.latitude !== live.fix.latitude ||
      planner.origin?.coordinate.longitude !== live.fix.longitude
    )
      return;
    if (!shouldRefreshRoute(lastAttempt.current, live.fix, routeKey, clock))
      return;
    lastAttempt.current = { origin: live.fix, key: routeKey, at: clock };
    void callbacks.current.calculate();
  }, [
    clock,
    destinationKey,
    live.fix,
    planner.origin?.coordinate.latitude,
    planner.origin?.coordinate.longitude,
    planner.hydrated,
    planner.loading,
    foreground,
    routeKey,
  ]);

  function pick(point: Coordinate) {
    if (!isCoordinate(point)) return;
    planner.choosePlace("destination", {
      coordinate: point,
      label: "Loc ales pe hartă",
    });
    setFollowing(false);
  }
  const timeLabel = planner.departure
    ? planner.departure.toLocaleTimeString("ro-RO", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Acum";
  const locationLabel =
    live.status === "denied"
      ? "Permite localizarea"
      : live.status === "disabled"
        ? "Activează GPS"
        : live.status === "stale"
          ? "Semnal GPS slab"
          : live.status === "unavailable"
            ? "GPS indisponibil"
            : live.fix && live.fix.accuracy > 100
              ? "Locație aproximativă"
              : "";
  return (
    <View style={styles.screen}>
      <RouteMap
        fix={live.fix}
        destination={destination}
        route={route}
        shadows={shadow.layer}
        following={following}
        recenter={recenter}
        onPan={() => setFollowing(false)}
        onPick={pick}
        onBounds={setBounds}
        mapStyle={mapStyle}
        threeD={threeD}
        onThreeDChange={setThreeD}
      />
      <View
        pointerEvents="box-none"
        style={[styles.top, { top: insets.top + 12 }]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Setări"
          disabled={!planner.hydrated}
          style={styles.round}
          onPress={() => router.push("/settings")}
        >
          <Ionicons name="menu-outline" size={24} color={MAP_ACCENT} />
        </Pressable>
        <View style={styles.wordmark}>
          <Text style={styles.brand}>umbra</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ora umbrelor"
          onPress={() => setTimeOpen(true)}
          style={styles.time}
        >
          <Ionicons name="time-outline" size={17} color={colors.ink} />
          <Text style={styles.timeText}>{timeLabel}</Text>
        </Pressable>
      </View>
      <View
        style={[
          styles.mapButtons,
          { bottom: destination ? 295 + insets.bottom : 125 + insets.bottom },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Stratul de umbre"
          onPress={() => setLayersOpen((value) => !value)}
          accessibilityState={{ expanded: layersOpen }}
          style={[styles.round, layersOpen && styles.controlSelected]}
        >
          <Ionicons name="layers" size={23} color={MAP_ACCENT} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Caută o destinație"
          onPress={() => setSearch(true)}
          style={styles.round}
        >
          <Ionicons name="search" size={23} color={MAP_ACCENT} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Urmărește locația mea"
          onPress={() => {
            setFollowing(true);
            setRecenter((value) => value + 1);
            if (!live.fix) live.retry();
          }}
          style={[styles.round, following && styles.followSelected]}
        >
          {live.status === "locating" ? (
            <ActivityIndicator color={colors.green} />
          ) : (
            <Ionicons
              name={following ? "navigate" : "locate-outline"}
              size={22}
              color={following ? colors.white : MAP_ACCENT}
            />
          )}
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={threeD ? "Afișează harta 2D" : "Afișează clădirile 3D"}
        accessibilityState={{ selected: threeD }}
        onPress={() => setThreeD((value) => !value)}
        style={[
          styles.dimensionButton,
          { bottom: destination ? 295 + insets.bottom : 125 + insets.bottom },
          threeD && styles.controlSelected,
        ]}
      >
        <Ionicons name="cube" size={24} color={MAP_ACCENT} />
        <Text style={styles.dimensionText}>{threeD ? "2D" : "3D"}</Text>
      </Pressable>
      {layersOpen && (
        <ScrollView
          style={[
            styles.layerPanel,
            { top: insets.top + 75, maxHeight: "65%" },
          ]}
          contentContainerStyle={styles.layerContent}
        >
          <Text style={styles.panelTitle}>Straturi</Text>
          <View style={styles.mapChoices}>
            {(
              [
                "map",
                "satellite",
                ...(Platform.OS === "android" ? ["terrain"] : []),
              ] as MapStyle[]
            ).map((value) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: mapStyle === value }}
                onPress={() => setMapStyle(value)}
                style={[
                  styles.mapChoice,
                  mapStyle === value && styles.mapChoiceSelected,
                ]}
              >
                <Ionicons
                  name={
                    value === "satellite"
                      ? "globe-outline"
                      : value === "terrain"
                        ? "trail-sign-outline"
                        : "map-outline"
                  }
                  size={20}
                  color={colors.ink}
                />
                <Text style={styles.subtle}>
                  {value === "map"
                    ? "Hartă"
                    : value === "satellite"
                      ? "Satelit"
                      : "Teren"}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.layerHeader}>
            <Text style={styles.panelTitle}>Clădiri 3D</Text>
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel="Clădiri 3D"
              accessibilityState={{ checked: threeD }}
              onPress={() => setThreeD((value) => !value)}
              style={[styles.toggle, threeD && styles.toggleOn]}
            >
              <View
                style={[styles.toggleDot, threeD && { alignSelf: "flex-end" }]}
              />
            </Pressable>
          </View>
          {threeD && (
            <Text style={styles.subtle}>
              {Platform.OS === "ios" && mapStyle === "map"
                ? "Clădiri OSM. Înălțimile lipsă sunt orientative doar în 3D; nu produc umbre."
                : `Detaliile 3D depind de acoperirea ${Platform.OS === "ios" ? "Apple Maps" : "Google Maps"}.`}
            </Text>
          )}
          <View style={styles.layerHeader}>
            <Text style={styles.panelTitle}>Umbre</Text>
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel="Afișează umbrele"
              accessibilityState={{ checked: showShadows }}
              onPress={() => setShowShadows((value) => !value)}
              style={[styles.toggle, showShadows && styles.toggleOn]}
            >
              <View
                style={[
                  styles.toggleDot,
                  showShadows && { alignSelf: "flex-end" },
                ]}
              />
            </Pressable>
          </View>
          <Text style={styles.subtle}>
            {shadowStatus[shadow.status] ?? "Indisponibile"}
          </Text>
          {shadow.layer?.partialCoverage && (
            <Text style={styles.subtle}>Acoperire parțială · Constanța</Text>
          )}
          {shadow.layer?.truncated && (
            <Text style={styles.subtle}>
              Apropie harta pentru mai multe detalii
            </Text>
          )}
          <View style={styles.legend}>
            <View style={[styles.swatch, { backgroundColor: "#1D2B3D70" }]} />
            <Text style={styles.subtle}>Înălțime OSM</Text>
          </View>
          <View style={styles.legend}>
            <View style={[styles.swatch, { backgroundColor: "#2539493B" }]} />
            <Text style={styles.subtle}>Înălțime estimată</Text>
          </View>
          <View style={styles.legend}>
            <View
              style={[
                styles.swatch,
                { borderColor: colors.unknown, borderWidth: 1 },
              ]}
            />
            <Text style={styles.subtle}>Înălțime necunoscută</Text>
          </View>
          {!!shadow.layer?.attribution.length && (
            <Text style={styles.attribution}>
              {shadow.layer.attribution.join(" · ")}
            </Text>
          )}
        </ScrollView>
      )}
      <View
        style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 16) }]}
      >
        {!!locationLabel && (
          <Pressable
            accessibilityRole="button"
            onPress={live.retry}
            style={styles.locationNotice}
          >
            <Ionicons name="location-outline" size={15} color={colors.muted} />
            <Text style={styles.subtle}>{locationLabel}</Text>
          </Pressable>
        )}
        {!destination ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Unde mergi?"
            onPress={() => setSearch(true)}
            style={styles.search}
          >
            <View style={styles.destinationIcon}>
              <Ionicons name="search" size={22} color={colors.ink} />
            </View>
            <Text style={styles.searchText}>Unde mergi?</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </Pressable>
        ) : (
          <View style={styles.routePanel}>
            <View style={styles.destinationRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setSearch(true)}
                style={styles.destinationName}
              >
                <Ionicons name="location" size={20} color={colors.green} />
                <Text numberOfLines={1} style={styles.panelTitle}>
                  {destination.label}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Elimină destinația"
                onPress={() => {
                  planner.clearDestination();
                  lastAttempt.current = null;
                }}
                style={styles.close}
              >
                <Ionicons name="close" size={22} color={colors.ink} />
              </Pressable>
            </View>
            {planner.loading && (
              <View style={styles.inline}>
                <ActivityIndicator size="small" color={colors.green} />
                <Text style={styles.subtle}>Se actualizează traseele</Text>
              </View>
            )}
            {!!planner.message && (
              <Pressable
                onPress={() => {
                  lastAttempt.current = null;
                  void planner.calculate();
                }}
                accessibilityRole="button"
              >
                <Text
                  accessibilityRole="alert"
                  numberOfLines={2}
                  style={styles.error}
                >
                  {planner.message}
                </Text>
              </Pressable>
            )}
            <ScrollView
              style={styles.routeList}
              showsVerticalScrollIndicator={false}
            >
              {planner.comparison?.routes.map((item) => (
                <RouteCard
                  key={item.id}
                  route={item}
                  selected={item.id === planner.selectedId}
                  onPress={() => {
                    planner.setSelectedId(item.id);
                    setFollowing(false);
                  }}
                />
              ))}
            </ScrollView>
          </View>
        )}
      </View>
      {timeOpen && (
        <Modal
          transparent
          animationType="slide"
          visible
          onRequestClose={() => setTimeOpen(false)}
        >
          <Pressable style={styles.backdrop} onPress={() => setTimeOpen(false)}>
            <Pressable
              onPress={() => {}}
              style={[styles.timeSheet, { paddingBottom: insets.bottom + 24 }]}
            >
              <View style={styles.layerHeader}>
                <Text style={styles.panelTitle}>Ora umbrelor</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Închide ora umbrelor"
                  style={styles.close}
                  onPress={() => setTimeOpen(false)}
                >
                  <Ionicons name="close" size={22} color={colors.ink} />
                </Pressable>
              </View>
              <DeparturePicker
                value={planner.departure}
                onChange={planner.changeDeparture}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}
      {search && (
        <PlaceSearch
          target="destination"
          onClose={() => setSearch(false)}
          onChoose={(place) => {
            planner.choosePlace("destination", place);
            setFollowing(false);
            setSearch(false);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  top: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  round: {
    width: 48,
    height: 48,
    borderRadius: 17,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: "#ECECF7",
    justifyContent: "center",
    alignItems: "center",
    elevation: 3,
    boxShadow: "0 3px 0 #CCD1E6",
  },
  controlSelected: { borderColor: "#B9C5F6", backgroundColor: "#F0F3FF" },
  followSelected: { backgroundColor: MAP_ACCENT, borderColor: "#2944B0" },
  dimensionButton: {
    position: "absolute",
    left: 16,
    width: 54,
    minHeight: 62,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: "#ECECF7",
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    boxShadow: "0 3px 0 #CCD1E6",
    elevation: 3,
  },
  dimensionText: { color: MAP_ACCENT, fontWeight: "700", fontSize: 11 },
  wordmark: { flex: 1, alignItems: "flex-start" },
  brand: {
    fontSize: 25,
    fontWeight: "700",
    letterSpacing: -1.3,
    color: MAP_ACCENT,
    backgroundColor: "#FFFFFFED",
    paddingHorizontal: 13,
    paddingVertical: 5,
    borderRadius: 16,
    overflow: "hidden",
  },
  time: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 15,
    height: 44,
    backgroundColor: colors.white,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: "#ECECF7",
    elevation: 3,
    boxShadow: "0 3px 0 #CCD1E6",
  },
  timeText: { color: colors.ink, fontWeight: "600", fontSize: 13 },
  mapButtons: { position: "absolute", right: 16, gap: 8 },
  bottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    gap: 9,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 72,
    backgroundColor: colors.white,
    borderRadius: 24,
    paddingHorizontal: 18,
    gap: 13,
    elevation: 5,
    borderWidth: 2,
    borderColor: "#ECECF7",
    boxShadow: "0 4px 0 #CCD1E6",
  },
  destinationIcon: {
    width: 39,
    height: 39,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#EDF1FF",
  },
  searchText: {
    flex: 1,
    fontSize: 21,
    fontWeight: "600",
    letterSpacing: -0.6,
    color: colors.ink,
  },
  routePanel: {
    backgroundColor: colors.paper,
    borderRadius: 24,
    padding: 16,
    elevation: 5,
    borderWidth: 2,
    borderColor: "#ECECF7",
    boxShadow: "0 4px 0 #CCD1E6",
  },
  destinationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  destinationName: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
  },
  panelTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "600",
    flexShrink: 1,
  },
  close: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  subtle: { fontSize: 12, lineHeight: 18, color: colors.muted },
  error: {
    color: colors.error,
    fontSize: 12,
    lineHeight: 18,
    paddingVertical: 8,
  },
  routeList: { maxHeight: 220, marginTop: 8 },
  inline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
  },
  connect: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  locationNotice: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.white,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 13,
    gap: 5,
  },
  layerPanel: {
    position: "absolute",
    right: 16,
    width: 255,
    backgroundColor: colors.white,
    borderRadius: 20,
    elevation: 5,
    borderWidth: 2,
    borderColor: "#ECECF7",
    boxShadow: "0 4px 0 #CCD1E6",
  },
  layerContent: { padding: 18, gap: 12 },
  mapChoices: { flexDirection: "row", gap: 8 },
  mapChoice: {
    flex: 1,
    minHeight: 64,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
  },
  mapChoiceSelected: {
    borderColor: colors.green,
    backgroundColor: colors.greenLight,
  },
  layerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 5,
  },
  legend: { flexDirection: "row", alignItems: "center", gap: 8 },
  swatch: { width: 22, height: 14, borderRadius: 4 },
  toggle: {
    width: 46,
    height: 28,
    borderRadius: 20,
    backgroundColor: colors.line,
    padding: 3,
    justifyContent: "center",
  },
  toggleOn: { backgroundColor: colors.green },
  toggleDot: {
    width: 22,
    height: 22,
    borderRadius: 12,
    backgroundColor: colors.white,
  },
  attribution: { fontSize: 9, lineHeight: 14, color: colors.muted },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "#0005" },
  timeSheet: {
    backgroundColor: colors.paper,
    padding: 24,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
  },
});
