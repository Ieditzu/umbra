import { Pressable, StyleSheet, Text, View } from "react-native";
import { distanceLabel, exposureTotals, minutes } from "../domain/routes";
import type { WalkingRoute } from "../domain/routes";
import { colors } from "../theme";

const names = {
  fastest: "Rapid",
  balanced: "Echilibrat",
  shadiest: "Mai multă umbră",
};
export function RouteCard({
  route,
  selected,
  recommended = false,
  onPress,
}: {
  route: WalkingRoute;
  selected: boolean;
  recommended?: boolean;
  onPress: () => void;
}) {
  const totals = exposureTotals(route);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.card, selected && styles.selected]}
    >
      <View style={styles.heading}>
        <Text style={styles.name}>
          {names[route.kind]}
          {recommended ? " · Recomandat" : ""}
        </Text>
        <Text style={styles.time}>{minutes(route.duration_s)}</Text>
      </View>
      <Text style={styles.detail}>
        {distanceLabel(route.distance_m)} ·{" "}
        {totals.unknown >= route.duration_s - 1
          ? "Expunere necunoscută"
          : `${minutes(totals.shade + totals.estimated_shade)} umbră modelată`}
      </Text>
      <View style={styles.bar}>
        {totals.shade > 0 && (
          <View style={{ flex: totals.shade, backgroundColor: colors.green }} />
        )}
        {totals.estimated_shade > 0 && (
          <View
            style={{ flex: totals.estimated_shade, backgroundColor: "#8CAE71" }}
          />
        )}
        {totals.sun > 0 && (
          <View style={{ flex: totals.sun, backgroundColor: colors.sun }} />
        )}
        {totals.unknown > 0 && (
          <View
            style={{ flex: totals.unknown, backgroundColor: colors.unknown }}
          />
        )}
      </View>
      {totals.estimated_shade > 0 && (
        <Text style={styles.detail}>
          {minutes(totals.estimated_shade)} umbră de copaci estimată
        </Text>
      )}
      {totals.unknown > 0 && (
        <Text style={styles.detail}>
          {minutes(totals.unknown)} cu expunere necunoscută
        </Text>
      )}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 15,
    gap: 8,
    marginBottom: 10,
    backgroundColor: colors.white,
  },
  selected: { borderColor: colors.green, backgroundColor: colors.greenLight },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  name: { color: colors.ink, fontWeight: "600", fontSize: 15 },
  time: { fontSize: 18, fontWeight: "700", color: colors.green },
  detail: { color: colors.muted, fontSize: 12 },
  bar: { height: 5, flexDirection: "row", borderRadius: 3, overflow: "hidden" },
});
