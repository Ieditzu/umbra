import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { SolarPanel } from "../components/SolarPanel";
import { RouteCard } from "../components/RouteCard";
import { WeatherSummary } from "../components/WeatherSummary";
import { solarPosition } from "../engine/solar";
import { MeasurePanel } from "../components/MeasurePanel";
import { buildMeasureOverlay } from "../domain/measureOverlay";
import type { MeasureTarget } from "../engine/measureTarget";
import type { Point } from "../engine/geometry";
import { inspectBuilding } from "../services/calculations";
import { CalculationError } from "../services/calculationClient";
import { useMeasurements } from "../state/MeasurementProvider";
import { RouteMap } from "../components/RouteMap";
import {
  CONSTANȚA,
  distanceBetween,
  distanceLabel,
  minutes,
  isCoordinate,
} from "../domain/routes";
import type { Coordinate } from "../domain/routes";
import { shouldRefreshRoute } from "../domain/live";
import type { RouteAttempt } from "../domain/live";
import type { Bounds } from "../domain/shadows";
import { mapShadowVisibility, shadowInstant } from "../domain/shadows";
import { useDeviceHeading } from "../hooks/useDeviceHeading";
import { useLiveLocation } from "../hooks/useLiveLocation";
import { useShadowLayer } from "../hooks/useShadowLayer";
import { usePlanner } from "../state/PlannerProvider";
import { colors } from "../theme";
import type { MapStyle } from "../domain/mapDisplay";
import { routeProgress } from "../domain/navigation";

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
  server_restart: "Repornește serverul de pe PC",
  outside: "Apropie harta de România",
  paused: "În pauză",
  idle: "În așteptare",
  off: "Oprite",
};

export default function MapScreen() {
  const planner = usePlanner();
  const live = useLiveLocation();
  const heading = useDeviceHeading(live.fix !== null);
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState(false);
  const [navigation, setNavigation] = useState<string | null>(null);
  const [timeOpen, setTimeOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const measurements = useMeasurements();
  const [measuring, setMeasuring] = useState(false);
  const [solarMode, setSolarMode] = useState(false);
  const [solarPoint, setSolarPoint] = useState<Coordinate | null>(null);
  const [solarRoof, setSolarRoof] = useState<MeasureTarget | null>(null);
  const [solarLoading, setSolarLoading] = useState(false);
  const [solarError, setSolarError] = useState("");
  const [target, setTarget] = useState<MeasureTarget | null>(null);
  const [targetLoading, setTargetLoading] = useState(false);
  const [targetError, setTargetError] = useState("");
  const [cornerIndex, setCornerIndex] = useState<number | null>(null);
  const [tip, setTip] = useState<Point | null>(null);
  const inspecting = useRef<AbortController | null>(null);
  const { showShadows, estimatedShadows, mapStyle, threeD } = planner.settings;
  const setShowShadows = (value: boolean | ((previous: boolean) => boolean)) =>
    planner.changePreferences((previous) => ({
      showShadows:
        typeof value === "function" ? value(previous.showShadows) : value,
    }));
  const setThreeD = (value: boolean | ((previous: boolean) => boolean)) =>
    planner.changePreferences((previous) => ({
      threeD: typeof value === "function" ? value(previous.threeD) : value,
    }));
  const setMapStyle = (value: MapStyle) =>
    planner.changePreferences({ mapStyle: value });
  const [tilted, setTilted] = useState(false);
  const [following, setFollowing] = useState(true);
  // Second tap on the locate button: rotate the map with the phone (Google Maps compass mode).
  const [compassMode, setCompassMode] = useState(false);
  const compass = following && compassMode;
  /** Off → follow north-up → follow heading-up → follow north-up. */
  function locate() {
    if (!live.fix) live.retry();
    if (following) {
      setCompassMode((value) => !value);
      return;
    }
    setCompassMode(false);
    setFollowing(true);
    setRecenter((value) => value + 1);
  }
  const [recenter, setRecenter] = useState(0);
  const [overview, setOverview] = useState(0);
  const [bottomHeight, setBottomHeight] = useState(125);
  const [clock, setClock] = useState(() => Date.now());
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const [view, setView] = useState<{ bounds: Bounds; focus: Coordinate }>({
    bounds: INITIAL_BOUNDS,
    focus: CONSTANȚA,
  });
  const bounds = view.bounds;
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
  const shadow = useShadowLayer(
    snapshotAt,
    bounds,
    showShadows || threeD,
    estimatedShadows || threeD,
    view.focus,
    measurements.heightsKey,
  );
  const measureOverlay = useMemo(
    () =>
      measuring && target
        ? buildMeasureOverlay(
            target,
            cornerIndex,
            clock,
            tip,
            measurements.settings.blind,
          )
        : null,
    [measuring, target, cornerIndex, clock, tip, measurements.settings.blind],
  );
  // New confirmed heights change modelled shade, so shown routes are recalculated.
  const heightsSeen = useRef(measurements.heightsKey);
  useEffect(() => {
    if (heightsSeen.current === measurements.heightsKey) return;
    heightsSeen.current = measurements.heightsKey;
    lastAttempt.current = null;
    if (planner.comparison) void callbacks.current.calculate();
  }, [measurements.heightsKey, planner.comparison]);
  const mapShadows = useMemo(
    () =>
      mapShadowVisibility(shadow.layer, showShadows, estimatedShadows, threeD),
    [shadow.layer, showShadows, estimatedShadows, threeD],
  );
  const route =
    planner.comparison?.routes.find((item) => item.id === planner.selectedId) ??
    null;
  const destination = planner.destination;
  const destinationKey = destination
    ? `${destination.coordinate.latitude},${destination.coordinate.longitude}`
    : "";
  const navigating = !!destinationKey && navigation === destinationKey;
  const progress = useMemo(
    () => (route && live.fix ? routeProgress(route, live.fix) : null),
    [route, live.fix],
  );
  const arrived = !!(
    navigating &&
    live.fix &&
    live.fix.accuracy <= 35 &&
    destination &&
    distanceBetween(live.fix, destination.coordinate) <= 20
  );
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

  function selectBuilding(point: Coordinate) {
    if (!isCoordinate(point)) return;
    inspecting.current?.abort();
    const controller = new AbortController();
    inspecting.current = controller;
    setTargetLoading(true);
    setTargetError("");
    inspectBuilding(point, new Date().toISOString(), controller.signal)
      .then((found) => {
        if (controller.signal.aborted) return;
        if (!found) {
          setTargetError(
            "Nu am găsit o clădire măsurabilă aici.",
          );
          return;
        }
        setTarget(found);
        setTip(null);
        setCornerIndex(found.corners[0]?.index ?? null);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setTargetError(
          error instanceof CalculationError && error.status === 404
            ? "Repornește serverul de pe PC: Ctrl+C apoi npm start."
            : error instanceof Error
              ? error.message
              : "Clădirea nu a putut fi încărcată.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setTargetLoading(false);
      });
  }
  function stopMeasuring() {
    inspecting.current?.abort();
    setMeasuring(false);
    setTarget(null);
    setTip(null);
    setCornerIndex(null);
    setTargetError("");
    setTargetLoading(false);
  }
  function selectSolarRoof(point: Coordinate) {
    if (!isCoordinate(point)) return;
    inspecting.current?.abort();
    const controller = new AbortController();
    inspecting.current = controller;
    setSolarLoading(true);
    setSolarError("");
    setSolarPoint(null);
    setSolarRoof(null);
    inspectBuilding(point, new Date().toISOString(), controller.signal)
      .then((roof) => {
        if (controller.signal.aborted) return;
        if (!roof) { setSolarError("Nu am găsit o clădire aici. Apasă pe conturul ei."); return; }
        setSolarPoint(point);
        setSolarRoof(roof);
      })
      .catch((error) => { if (!controller.signal.aborted) setSolarError(error instanceof Error ? error.message : "Clădirea nu a putut fi încărcată."); })
      .finally(() => { if (!controller.signal.aborted) setSolarLoading(false); });
  }
  function stopSolar() {
    inspecting.current?.abort();
    setSolarMode(false);
    setSolarPoint(null);
    setSolarRoof(null);
    setSolarLoading(false);
    setSolarError("");
  }
  function pick(point: Coordinate) {
    if (!isCoordinate(point)) return;
    if (solarMode) {
      selectSolarRoof(point);
      return;
    }
    if (measuring) {
      selectBuilding(point);
      return;
    }
    setNavigation(null);
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
      {planner.hydrated && (
        <RouteMap
          fix={live.fix}
          heading={heading}
          destination={destination}
          route={route}
          shadows={mapShadows}
          following={following}
          compass={compass}
          recenter={recenter}
          navigating={navigating}
          overview={overview}
          onPan={() => setFollowing(false)}
          onPick={pick}
          onTap={(point) => {
            if (solarMode) selectSolarRoof(point);
            else if (measuring) selectBuilding(point);
          }}
          measure={solarMode && solarRoof && solarPoint ? { outline: solarRoof.footprint, corner: solarPoint, ruler: [], marks: [], tip: null } : measureOverlay}
          measuring={measuring}
          heightsKey={measurements.heightsKey}
          onBounds={(bounds, focus) =>
            setView({ bounds, focus: focus ?? view.focus })
          }
          mapStyle={mapStyle}
          threeD={threeD}
          tilted={tilted}
          treesEnabled={threeD || (showShadows && estimatedShadows)}
          onTiltChange={setTilted}
        />
      )}
      {!navigating && (
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
      )}
      {navigating && (
        <View style={[styles.navigationHeader, { top: insets.top + 12 }]}>
          <View style={styles.navigationIcon}>
            <Ionicons
              name={arrived ? "checkmark" : "walk"}
              size={28}
              color={colors.white}
            />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.navigationHeading}>
              {arrived ? "Ai ajuns" : "Spre destinație"}
            </Text>
            <Text numberOfLines={1} style={styles.navigationDestination}>
              {destination?.label}
            </Text>
          </View>
        </View>
      )}
      <View
        style={[
          styles.mapButtons,
          {
            bottom: bottomHeight + 12,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Stratul de umbre"
          onPress={() => setLayersOpen((value) => !value)}
          accessibilityState={{ expanded: layersOpen }}
          style={[
            navigating ? styles.navigationMapControl : styles.round,
            layersOpen && styles.controlSelected,
          ]}
        >
          <Ionicons name="layers" size={23} color={MAP_ACCENT} />
        </Pressable>
        {navigating && (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Vezi întregul traseu"
              onPress={() => {
                setFollowing(false);
                setOverview((value) => value + 1);
              }}
              style={styles.navigationMapControl}
            >
              <Ionicons name="expand-outline" size={23} color={colors.ink} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                compass
                  ? "Orientează harta spre nord"
                  : following
                    ? "Rotește harta după direcția ta"
                    : "Centrează pe locația mea"
              }
              accessibilityState={{ selected: following }}
              onPress={locate}
              style={styles.navigationMapControl}
            >
              {live.status === "locating" ? (
                <ActivityIndicator size="small" color={MAP_ACCENT} />
              ) : (
                <Ionicons
                  name={
                    compass
                      ? "compass"
                      : following
                        ? "navigate"
                        : "locate-outline"
                  }
                  size={23}
                  color={following ? MAP_ACCENT : colors.ink}
                />
              )}
            </Pressable>
          </>
        )}
        {!navigating && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Măsoară înălțimea unei clădiri din umbra ei"
            accessibilityState={{ selected: measuring }}
            onPress={() => {
              if (measuring) stopMeasuring();
              else {
                stopSolar();
                setMeasuring(true);
                setLayersOpen(false);
                setFollowing(false);
              }
            }}
            style={[styles.round, measuring && styles.controlSelected]}
          >
            <MaterialCommunityIcons name="ruler" size={23} color={MAP_ACCENT} />
          </Pressable>
        )}
        {!navigating && (
          <Pressable accessibilityRole="button" accessibilityLabel="Estimează energia unui panou solar" accessibilityState={{ selected: solarMode }} onPress={() => {
            if (solarMode) stopSolar();
            else { stopMeasuring(); setSolarMode(true); setLayersOpen(false); setFollowing(false); }
          }} style={[styles.round, solarMode && styles.controlSelected]}>
            <MaterialCommunityIcons name="solar-power" size={23} color={MAP_ACCENT} />
          </Pressable>
        )}
        {!navigating && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Caută o destinație"
            onPress={() => setSearch(true)}
            style={styles.round}
          >
            <Ionicons name="search" size={23} color={MAP_ACCENT} />
          </Pressable>
        )}
        {!navigating && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              compass
                ? "Orientează harta spre nord"
                : following
                  ? "Rotește harta după direcția ta"
                  : "Urmărește locația mea"
            }
            onPress={locate}
            style={[styles.round, following && styles.followSelected]}
          >
            {live.status === "locating" ? (
              <ActivityIndicator color={colors.green} />
            ) : (
              <Ionicons
                name={
                  compass
                    ? "compass"
                    : following
                      ? "navigate"
                      : "locate-outline"
                }
                size={22}
                color={following ? colors.white : MAP_ACCENT}
              />
            )}
          </Pressable>
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tilted ? "Vedere de sus" : "Înclină harta"}
        accessibilityState={{ selected: tilted }}
        onPress={() => setTilted((value) => !value)}
        style={[
          styles.dimensionButton,
          {
            bottom: bottomHeight + 12,
          },
          tilted && styles.controlSelected,
        ]}
      >
        <Ionicons name="cube" size={24} color={MAP_ACCENT} />
        <Text style={styles.dimensionText}>{tilted ? "Sus" : "Înclină"}</Text>
      </Pressable>
      {layersOpen && (
        <ScrollView
          style={[
            styles.layerPanel,
            { top: insets.top + (navigating ? 125 : 75), maxHeight: "65%" },
          ]}
          contentContainerStyle={styles.layerContent}
        >
          <View style={styles.layerHeader}>
            <Text style={styles.panelTitle}>Straturi</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Închide straturile"
              hitSlop={8}
              onPress={() => setLayersOpen(false)}
              style={[styles.close, { marginRight: -10, marginVertical: -8 }]}
            >
              <Ionicons name="close" size={22} color={colors.ink} />
            </Pressable>
          </View>
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
          <View style={styles.layerHeader}>
            <Text style={styles.panelTitle}>Pictogramă meteo</Text>
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel="Afișează pictograma meteo"
              accessibilityState={{ checked: planner.settings.showWeatherIcon }}
              onPress={() =>
                planner.changePreferences((p) => ({
                  showWeatherIcon: !p.showWeatherIcon,
                }))
              }
              style={[
                styles.toggle,
                planner.settings.showWeatherIcon && styles.toggleOn,
              ]}
            >
              <View
                style={[
                  styles.toggleDot,
                  planner.settings.showWeatherIcon && { alignSelf: "flex-end" },
                ]}
              />
            </Pressable>
          </View>
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
            {showShadows
              ? (shadowStatus[shadow.status] ?? "Indisponibile")
              : "Oprite"}
          </Text>
          <View style={styles.layerHeader}>
            <Text style={styles.panelTitle}>Estimări și copaci</Text>
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel="Afișează umbrele orientative și copacii"
              accessibilityState={{ checked: estimatedShadows }}
              onPress={() =>
                planner.changePreferences((p) => ({
                  estimatedShadows: !p.estimatedShadows,
                }))
              }
              style={[styles.toggle, estimatedShadows && styles.toggleOn]}
            >
              <View
                style={[
                  styles.toggleDot,
                  estimatedShadows && { alignSelf: "flex-end" },
                ]}
              />
            </Pressable>
          </View>
          {shadow.layer?.partialCoverage && (
            <Text style={styles.subtle}>
              Acoperire parțială · apropie harta
            </Text>
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
        onLayout={(event) => setBottomHeight(event.nativeEvent.layout.height)}
        style={[
          styles.bottom,
          {
            paddingBottom: navigating ? 0 : Math.max(insets.bottom, 16),
            paddingHorizontal: navigating ? 0 : 16,
          },
        ]}
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
        {solarMode && !navigating ? (
          <SolarPanel key={solarPoint ? `${solarPoint.latitude},${solarPoint.longitude}` : "select"} point={solarPoint} roofId={solarRoof?.id ?? null} loading={solarLoading} error={solarError} onClose={stopSolar} />
        ) : measuring && !navigating ? (
          <MeasurePanel
            target={target}
            loading={targetLoading}
            error={targetError}
            cornerIndex={cornerIndex}
            onCorner={(index) => {
              setCornerIndex(index);
              setTip(null);
            }}
            onTip={setTip}
            fix={live.fix}
            now={clock}
            onClose={stopMeasuring}
          />
        ) : !destination ? (
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
          <View
            style={[
              styles.routePanel,
              navigating && styles.activeRoutePanel,
              navigating && { paddingBottom: Math.max(insets.bottom, 16) },
            ]}
          >
            {!navigating && (
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
                    setNavigation(null);
                    planner.clearDestination();
                    lastAttempt.current = null;
                  }}
                  style={styles.close}
                >
                  <Ionicons name="close" size={22} color={colors.ink} />
                </Pressable>
              </View>
            )}
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
            {navigating ? (
              <View style={styles.navigationContent}>
                <View style={styles.navigationSummary}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.remainingTime}>
                      {arrived
                        ? "Ai ajuns"
                        : progress
                          ? minutes(progress.remainingSeconds)
                          : "Pe traseu"}
                    </Text>
                    <Text style={styles.navigationDetail}>
                      {!live.fix
                        ? "Se așteaptă GPS-ul"
                        : !progress
                          ? "Se actualizează traseul"
                          : progress.distanceFromRoute >
                              Math.max(50, live.fix.accuracy)
                            ? "În afara traseului"
                            : `${distanceLabel(progress.remainingMetres)} · Sosire ${new Date(clock + progress.remainingSeconds * 1000).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" })}`}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Oprește urmărirea traseului"
                    style={styles.stopRoute}
                    onPress={() => {
                      setNavigation(null);
                      setFollowing(false);
                      setOverview((value) => value + 1);
                    }}
                  >
                    <Ionicons name="close" size={18} color={colors.error} />
                    <Text style={styles.stopRouteText}>Ieși</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <>
                {planner.comparison?.weather && (
                  <WeatherSummary
                    weather={planner.comparison.weather}
                    showIcon={planner.settings.showWeatherIcon}
                    night={
                      !!planner.origin &&
                      solarPosition(
                        Date.parse(planner.comparison.departure_at),
                        planner.origin.coordinate,
                      ).elevation < -0.833
                    }
                  />
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
                      recommended={
                        planner.comparison?.weather?.status === "available" &&
                        planner.comparison.weather.recommended_id === item.id
                      }
                      onPress={() => {
                        planner.setSelectedId(item.id);
                        setFollowing(false);
                      }}
                    />
                  ))}
                  {planner.comparison?.attribution
                    .filter((item) =>
                      item.includes("Copernicus Land Monitoring"),
                    )
                    .map((item) => (
                      <Text key={item} style={styles.attribution}>
                        {item}
                      </Text>
                    ))}
                </ScrollView>
                {route && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Pornește traseul"
                    disabled={planner.loading}
                    style={[
                      styles.startRoute,
                      planner.loading && { opacity: 0.5 },
                    ]}
                    onPress={() => {
                      setNavigation(destinationKey);
                      setFollowing(true);
                      setRecenter((value) => value + 1);
                      setLayersOpen(false);
                      if (!live.fix) live.retry();
                    }}
                  >
                    <Ionicons name="navigate" size={19} color={colors.white} />
                    <Text style={styles.startRouteText}>Pornește traseul</Text>
                  </Pressable>
                )}
              </>
            )}
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
          near={live.fix ?? view.focus}
          onClose={() => setSearch(false)}
          onChoose={(place) => {
            setNavigation(null);
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
  routeList: { maxHeight: 180, marginTop: 8 },
  startRoute: {
    minHeight: 48,
    borderRadius: 15,
    backgroundColor: MAP_ACCENT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 3,
  },
  startRouteText: { color: colors.white, fontSize: 16, fontWeight: "700" },
  navigationSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
  },
  navigationHeader: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 18,
    borderRadius: 24,
    backgroundColor: "#18845A",
    boxShadow: "0 3px 10px #183E2F33",
  },
  navigationIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "#FFFFFF20",
    alignItems: "center",
    justifyContent: "center",
  },
  navigationHeading: { fontSize: 20, fontWeight: "700", color: colors.white },
  navigationDestination: { fontSize: 14, color: "#E2E8FF" },
  navigationContent: { gap: 0 },
  remainingTime: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.6,
    color: "#18845A",
  },
  navigationDetail: { fontSize: 14, lineHeight: 20, color: colors.muted },
  navigationMapControl: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    boxShadow: "0 2px 8px #182B2429",
  },
  activeRoutePanel: {
    backgroundColor: colors.white,
    borderWidth: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
    boxShadow: "0 -2px 12px #182B241A",
  },
  stopRoute: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 44,
    paddingHorizontal: 12,
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#FBEFEC",
  },
  stopRouteText: { color: colors.error, fontWeight: "600" },
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
