import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { RouteComparison } from "../domain/routes";
import { colors } from "../theme";

type Weather = NonNullable<RouteComparison["weather"]>;

/** A decorative forecast icon, not a map of cloud positions. */
export function WeatherSummary({
  weather,
  night,
  showIcon,
}: {
  weather: Weather;
  night: boolean;
  showIcon: boolean;
}) {
  const [movement] = useState(() => new Animated.Value(0));
  const [reducedMotion, setReducedMotion] = useState(true);
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReducedMotion(value);
      })
      .catch(() => {});
    const reduce = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReducedMotion,
    );
    const appState = AppState.addEventListener("change", (state) =>
      setActive(state === "active"),
    );
    return () => {
      mounted = false;
      reduce.remove();
      appState.remove();
    };
  }, []);
  useEffect(() => {
    movement.setValue(0);
    if (reducedMotion || !active || !showIcon || weather.status !== "available")
      return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(movement, {
          toValue: 1,
          duration: 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(movement, {
          toValue: 0,
          duration: 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [movement, reducedMotion, active, showIcon, weather.status]);
  if (weather.status === "unavailable")
    return (
      <View style={styles.row}>
        {showIcon && (
          <Ionicons
            name="cloud-offline-outline"
            size={19}
            color={colors.muted}
          />
        )}
        <Text style={styles.text}>
          Prognoza nu este disponibilă · trasee calculate fără vreme
        </Text>
      </View>
    );
  const cloudy = weather.cloud_percent >= 70;
  const partlyCloudy = weather.cloud_percent >= 25 && !cloudy;
  const description = cloudy
    ? "Înnorat"
    : partlyCloudy
      ? "Parțial înnorat"
      : "Mai mult senin";
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${description}, nori ${weather.cloud_percent} la sută, soare direct estimat ${weather.direct_wm2} wați pe metru pătrat. Prognoză regională Open-Meteo.`}
    >
      {showIcon && (
        <View
          style={styles.icon}
          importantForAccessibility="no-hide-descendants"
        >
          {!cloudy && (
            <Animated.View
              style={[
                partlyCloudy && styles.sun,
                {
                  transform: [
                    {
                      scale: movement.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.08],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Ionicons
                name={night ? "moon" : "sunny"}
                size={partlyCloudy ? 19 : 22}
                color={colors.sun}
              />
            </Animated.View>
          )}
          {(cloudy || partlyCloudy) && (
            <Animated.View
              style={{
                transform: [
                  {
                    translateX: movement.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-2, 3],
                    }),
                  },
                ],
              }}
            >
              <Ionicons name="cloud" size={cloudy ? 25 : 21} color="#8497A0" />
            </Animated.View>
          )}
        </View>
      )}
      <View style={styles.copy}>
        <Text style={styles.title}>
          {description} · nori {weather.cloud_percent}%
        </Text>
        <Text style={styles.text}>
          Soare direct {weather.direct_wm2} W/m² · prognoză Open-Meteo
        </Text>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
    paddingVertical: 4,
  },
  icon: {
    width: 34,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  sun: { position: "absolute", top: 0, left: 2 },
  copy: { flex: 1, gap: 2 },
  title: { color: colors.ink, fontSize: 12, fontWeight: "600" },
  text: { color: colors.muted, fontSize: 12, flexShrink: 1 },
});
