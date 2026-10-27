import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PlannerProvider } from "../state/PlannerProvider";
import { MeasurementProvider } from "../state/MeasurementProvider";
import { colors } from "../theme";

export default function Layout() {
  return (
    <SafeAreaProvider>
      <MeasurementProvider>
        <PlannerProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              contentStyle: { backgroundColor: colors.paper },
              headerTintColor: colors.ink,
              headerShadowVisible: false,
              headerStyle: { backgroundColor: colors.paper },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen
              name="settings"
              options={{
                title: "Setări",
                headerBackButtonDisplayMode: "minimal",
                presentation: "modal",
              }}
            />
          </Stack>
        </PlannerProvider>
      </MeasurementProvider>
    </SafeAreaProvider>
  );
}
