import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { freshFix } from "../domain/live";
import type { LocationFix } from "../domain/live";
import { isCoordinate } from "../domain/routes";

export function useLiveLocation() {
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [status, setStatus] = useState("locating");
  const [tick, setTick] = useState(() => Date.now());
  const subscription = useRef<Location.LocationSubscription | null>(null);
  const lifecycle = useRef({
    generation: 0,
    mounted: true,
    newest: 0,
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
  });
  const start = useCallback(async (ask: boolean) => {
    const state = lifecycle.current;
    const ticket = ++state.generation;
    clearTimeout(state.timer);
    subscription.current?.remove();
    subscription.current = null;
    try {
      const permission = ask
        ? await Location.requestForegroundPermissionsAsync()
        : await Location.getForegroundPermissionsAsync();
      if (!state.mounted || ticket !== state.generation) return;
      if (permission.status !== "granted") {
        setStatus("denied");
        return;
      }
      const enabled = await Location.hasServicesEnabledAsync();
      if (!state.mounted || ticket !== state.generation) return;
      if (!enabled) {
        setStatus("disabled");
        return;
      }
      setStatus("locating");
      state.timer = setTimeout(() => {
        if (state.mounted && ticket === state.generation)
          setStatus("unavailable");
      }, 15000);
      const watch = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 0,
          timeInterval: 3000,
        },
        (location) => {
          if (
            !state.mounted ||
            ticket !== state.generation ||
            !isCoordinate(location.coords) ||
            location.timestamp < state.newest
          )
            return;
          state.newest = location.timestamp;
          clearTimeout(state.timer);
          setFix({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            timestamp: location.timestamp,
            accuracy: location.coords.accuracy ?? 9999,
          });
          setStatus("ready");
          setTick(Date.now());
        },
        () => {
          if (state.mounted && ticket === state.generation)
            setStatus("unavailable");
        },
      );
      if (!state.mounted || ticket !== state.generation) watch.remove();
      else subscription.current = watch;
    } catch {
      if (state.mounted && ticket === state.generation)
        setStatus("unavailable");
      clearTimeout(state.timer);
    }
  }, []);
  useEffect(() => {
    const state = lifecycle.current;
    state.mounted = true;
    const initial = setTimeout(() => void start(true), 0);
    const timer = setInterval(() => setTick(Date.now()), 5000);
    const app = AppState.addEventListener("change", (next) => {
      if (next === "active") void start(false);
      else {
        state.generation++;
        clearTimeout(state.timer);
        subscription.current?.remove();
        subscription.current = null;
        setStatus("paused");
      }
    });
    return () => {
      state.mounted = false;
      clearTimeout(state.timer);
      state.generation++;
      subscription.current?.remove();
      subscription.current = null;
      clearTimeout(initial);
      clearInterval(timer);
      app.remove();
    };
  }, [start]);
  const current = status === "ready" && freshFix(fix, tick);
  return {
    fix: current ? fix : null,
    status: status === "ready" && !current ? "stale" : status,
    retry: () => {
      setStatus("locating");
      void start(true);
    },
  };
}
