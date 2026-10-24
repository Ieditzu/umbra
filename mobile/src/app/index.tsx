import Ionicons from "@expo/vector-icons/Ionicons";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DeparturePicker } from "../components/DeparturePicker";
import { PlaceSearch } from "../components/PlaceSearch";
import { RouteCard } from "../components/RouteCard";
import { RouteMap } from "../components/RouteMap";
import type { Coordinate } from "../domain/routes";
import { isCoordinate } from "../domain/routes";
import { usePlanner } from "../state/PlannerProvider";
import type { Selection } from "../state/PlannerProvider";
import { colors } from "../theme";

export default function PlannerScreen() {
  const planner = usePlanner();
  const [search, setSearch] = useState<Selection | null>(null);
  const [locating, setLocating] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const gpsOperation = useRef(0);
  useEffect(
    () => () => {
      gpsOperation.current++;
    },
    [],
  );
  const selectedRoute =
    planner.comparison?.routes.find(
      (route) => route.id === planner.selectedId,
    ) ?? null;

  function pick(point: Coordinate) {
    if (!isCoordinate(point)) return;
    gpsOperation.current++;
    setLocating(false);
    planner.choosePlace(planner.selection, {
      coordinate: point,
      label: `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`,
    });
  }
  async function locate() {
    const ticket = ++gpsOperation.current;
    setLocating(true);
    planner.setMessage("");
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (ticket !== gpsOperation.current) return;
      if (permission.status !== "granted")
        throw new Error(
          "Localizarea nu este permisă. Poți alege punctul de plecare direct pe hartă.",
        );
      const position = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new Error(
                  "Localizarea durează prea mult. Încearcă din nou sau alege punctul pe hartă.",
                ),
              ),
            12000,
          );
        }),
      ]);
      if (ticket !== gpsOperation.current) return;
      planner.choosePlace("origin", {
        coordinate: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        },
        label: "Locația mea",
      });
      if (position.coords.accuracy && position.coords.accuracy > 100)
        planner.setMessage(
          "Localizarea este aproximativă. Verifică punctul de plecare pe hartă.",
        );
    } catch (error) {
      if (ticket === gpsOperation.current)
        planner.setMessage(
          error instanceof Error
            ? error.message
            : "Localizarea nu este disponibilă.",
        );
    } finally {
      clearTimeout(timeout);
      if (ticket === gpsOperation.current) setLocating(false);
    }
  }

  return (
    <SafeAreaView style={styles.page} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <View style={styles.brand}>
          <View style={styles.mark}>
            <Ionicons name="leaf-outline" size={20} color={colors.white} />
          </View>
          <Text style={styles.wordmark}>umbra</Text>
        </View>
        <Pressable
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Deschide preferințele"
          onPress={() => router.push("/settings")}
        >
          <Ionicons name="options-outline" size={23} color={colors.ink} />
        </Pressable>
      </View>
      <View style={styles.mapArea}>
        <RouteMap
          origin={planner.origin}
          destination={planner.destination}
          route={selectedRoute}
          onPick={pick}
        />
        <View pointerEvents="box-none" style={styles.mapTop}>
          <View style={styles.mapHint}>
            <Ionicons
              name="finger-print-outline"
              size={16}
              color={colors.green}
            />
            <Text style={styles.mapHintText}>
              Atinge harta pentru{" "}
              {planner.selection === "origin" ? "plecare" : "destinație"}
            </Text>
          </View>
        </View>
        <Pressable
          style={styles.locate}
          accessibilityRole="button"
          accessibilityLabel="Folosește locația mea ca punct de plecare"
          disabled={locating}
          onPress={() => void locate()}
        >
          {locating ? (
            <ActivityIndicator color={colors.green} />
          ) : (
            <Ionicons name="locate-outline" size={24} color={colors.green} />
          )}
        </Pressable>
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: colors.green }]} />
            <Text style={styles.legendText}>Umbră</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: colors.sun }]} />
            <Text style={styles.legendText}>Soare</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: colors.unknown }]} />
            <Text style={styles.legendText}>Necunoscut</Text>
          </View>
        </View>
      </View>
      <View style={[styles.panel, { flex: expanded ? 1.55 : 1 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? "Micșorează panoul" : "Extinde panoul"}
          onPress={() => setExpanded((value) => !value)}
          style={styles.handleButton}
        >
          <View style={styles.handle} />
        </Pressable>
        <ScrollView
          contentContainerStyle={styles.panelContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.titleRow}>
            <View>
              <Text style={styles.eyebrow}>
                MAI PUȚIN SOARE. MAI MULT CONFORT.
              </Text>
              <Text style={styles.title}>Pe unde mergem?</Text>
            </View>
            <Ionicons name="walk-outline" size={28} color={colors.green} />
          </View>
          <View style={styles.places}>
            {(["origin", "destination"] as Selection[]).map((target, index) => (
              <View style={styles.placeRow} key={target}>
                <Pressable
                  style={[
                    styles.targetButton,
                    planner.selection === target && styles.targetSelected,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Alege ${target === "origin" ? "plecarea" : "destinația"} pe hartă`}
                  accessibilityState={{
                    selected: planner.selection === target,
                  }}
                  onPress={() => planner.setSelection(target)}
                >
                  <Text style={styles.targetText}>{index ? "B" : "A"}</Text>
                </Pressable>
                <Pressable
                  style={styles.placeText}
                  accessibilityRole="button"
                  accessibilityLabel={`Caută ${target === "origin" ? "punctul de plecare" : "destinația"}`}
                  onPress={() => setSearch(target)}
                >
                  <Text style={styles.placeLabel}>
                    {target === "origin" ? "Plecare" : "Destinație"}
                  </Text>
                  <Text numberOfLines={1} style={styles.placeValue}>
                    {(target === "origin"
                      ? planner.origin
                      : planner.destination
                    )?.label ??
                      (target === "origin"
                        ? "Locația mea sau un punct pe hartă"
                        : "Caută o adresă sau atinge harta")}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Caută adresa pentru ${target === "origin" ? "plecare" : "destinație"}`}
                  onPress={() => setSearch(target)}
                  style={styles.iconButton}
                >
                  <Ionicons
                    name="search-outline"
                    size={18}
                    color={colors.muted}
                  />
                </Pressable>
              </View>
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Inversează plecarea și destinația"
              disabled={!planner.origin && !planner.destination}
              onPress={planner.swap}
              style={styles.swap}
            >
              <Ionicons
                name="swap-vertical-outline"
                size={19}
                color={colors.green}
              />
            </Pressable>
          </View>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Când pleci?</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/settings")}
              style={{ paddingVertical: 8 }}
            >
              <Text style={styles.detour}>
                Ocol maxim +{planner.settings.maxExtraMinutes} min
              </Text>
            </Pressable>
          </View>
          <DeparturePicker
            value={planner.departure}
            onChange={planner.changeDeparture}
          />
          {!!planner.message && (
            <View style={styles.notice} accessibilityRole="alert">
              <Ionicons
                name="information-circle-outline"
                size={20}
                color={colors.error}
              />
              <Text style={styles.noticeText}>{planner.message}</Text>
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            disabled={
              !planner.hydrated ||
              !planner.origin ||
              !planner.destination ||
              planner.loading
            }
            onPress={() => void planner.calculate()}
            style={[
              styles.primary,
              (!planner.hydrated ||
                !planner.origin ||
                !planner.destination ||
                planner.loading) && { opacity: 0.45 },
            ]}
          >
            {planner.loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Text style={styles.primaryText}>Compară traseele</Text>
                <Ionicons name="arrow-forward" color={colors.white} size={20} />
              </>
            )}
          </Pressable>
          {!planner.settings.apiUrl && (
            <Text style={styles.smallNote}>
              Poți alege punctele și plecarea. Calculul traseelor și al umbrelor
              necesită conectarea motorului de calcul din Preferințe.
            </Text>
          )}
          {planner.comparison && (
            <View style={styles.results}>
              <Text style={styles.sectionTitle}>Alege cum mergi</Text>
              <Text style={styles.smallNote}>
                Plecare:{" "}
                {new Date(planner.comparison.departure_at).toLocaleString(
                  "ro-RO",
                )}{" "}
                · expunere estimată, nu măsurată.
              </Text>
              {planner.comparison.routes.map((route) => (
                <RouteCard
                  key={route.id}
                  route={route}
                  selected={route.id === planner.selectedId}
                  onPress={() => planner.setSelectedId(route.id)}
                />
              ))}
              {planner.comparison.warnings.map((warning, index) => (
                <Text key={index} style={styles.smallNote}>
                  {warning}
                </Text>
              ))}
              <Text style={styles.smallNote}>
                {planner.comparison.attribution.join(" · ")}
              </Text>
            </View>
          )}
          <Text style={styles.footer}>
            Umbra nu estimează temperatura sau riscul medical. Respectă
            trecerile și accesul pietonal.
          </Text>
        </ScrollView>
      </View>
      {search && (
        <PlaceSearch
          key={search}
          target={search}
          onClose={() => setSearch(null)}
          onChoose={(place) => {
            gpsOperation.current++;
            setLocating(false);
            planner.choosePlace(search, place);
            setSearch(null);
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  mark: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.green,
  },
  wordmark: {
    fontSize: 29,
    letterSpacing: -1.5,
    color: colors.ink,
    fontWeight: "700",
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  mapArea: { flex: 1, minHeight: 230 },
  mapTop: {
    position: "absolute",
    top: 14,
    left: 16,
    right: 16,
    alignItems: "center",
  },
  mapHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: colors.white,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 24,
    elevation: 2,
  },
  mapHintText: { color: colors.ink, fontSize: 12 },
  locate: {
    position: "absolute",
    right: 16,
    bottom: 48,
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.white,
    elevation: 3,
    justifyContent: "center",
    alignItems: "center",
  },
  legend: {
    position: "absolute",
    bottom: 12,
    left: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    backgroundColor: colors.white,
    padding: 9,
    borderRadius: 12,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 5 },
  legendText: { fontSize: 10, color: colors.muted },
  panel: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    marginTop: -3,
  },
  handleButton: { height: 26, justifyContent: "center", alignItems: "center" },
  handle: {
    width: 38,
    height: 4,
    backgroundColor: colors.line,
    borderRadius: 5,
  },
  panelContent: { paddingHorizontal: 22, paddingBottom: 42 },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  eyebrow: {
    fontSize: 9,
    letterSpacing: 1.1,
    color: colors.muted,
    fontWeight: "600",
    marginBottom: 5,
  },
  title: {
    fontSize: 25,
    fontWeight: "600",
    letterSpacing: -0.7,
    color: colors.ink,
  },
  places: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 4,
    position: "relative",
  },
  placeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 68,
  },
  targetButton: {
    width: 34,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 10,
  },
  targetSelected: { backgroundColor: colors.greenLight },
  targetText: { color: colors.green, fontWeight: "700", fontSize: 14 },
  placeText: { flex: 1, minHeight: 48, justifyContent: "center", gap: 3 },
  placeLabel: { fontSize: 10, color: colors.muted },
  placeValue: { fontSize: 13, color: colors.ink },
  swap: {
    position: "absolute",
    right: -9,
    top: 49,
    height: 38,
    width: 30,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 12,
    marginBottom: 4,
  },
  sectionTitle: { color: colors.ink, fontWeight: "600", fontSize: 15 },
  detour: { color: colors.green, fontSize: 12 },
  primary: {
    backgroundColor: colors.green,
    minHeight: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 14,
    marginTop: 18,
  },
  primaryText: { color: colors.white, fontWeight: "600", fontSize: 15 },
  notice: {
    backgroundColor: colors.errorLight,
    padding: 12,
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },
  noticeText: { flex: 1, color: colors.error, fontSize: 13, lineHeight: 20 },
  smallNote: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginVertical: 10,
  },
  results: { marginTop: 20 },
  footer: { color: colors.muted, fontSize: 10, lineHeight: 16, marginTop: 14 },
});
