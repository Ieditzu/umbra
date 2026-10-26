import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { PropsWithChildren } from "react";
import { AppState } from "react-native";
import type { Coordinate, RouteComparison } from "../domain/routes";
import { makeRouteRequest } from "../domain/routes";
import { DEFAULT_SETTINGS, restoreSettings } from "../domain/settings";
import type { Settings } from "../domain/settings";
import { calculateRoutes } from "../services/calculations";

export type Place = { coordinate: Coordinate; label: string };
export type Selection = "origin" | "destination";
const STORAGE_KEY = "umbra.preferences.v1";

function usePlannerState() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [selection, setSelection] = useState<Selection>("origin");
  const [departure, setDeparture] = useState<Date | null>(null);
  const [comparison, setComparison] = useState<RouteComparison | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef<AbortController | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    let active = true;
    function cancel() {
      generation.current++;
      pending.current?.abort();
    }
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (active) setSettings(restoreSettings(raw));
      })
      .catch(() => {
        if (active) setMessage("Preferințele salvate nu au putut fi citite.");
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        generation.current++;
        pending.current?.abort();
        setLoading(false);
      }
    });
    return () => {
      active = false;
      cancel();
      subscription.remove();
    };
  }, []);

  function invalidate() {
    generation.current++;
    pending.current?.abort();
    pending.current = null;
    setComparison(null);
    setSelectedId(null);
    setLoading(false);
    setMessage("");
  }
  function choosePlace(target: Selection, place: Place) {
    invalidate();
    if (target === "origin") {
      setOrigin(place);
      setSelection("destination");
    } else {
      setDestination(place);
      setSelection("destination");
    }
  }
  function swap() {
    invalidate();
    setOrigin(destination);
    setDestination(origin);
  }
  function updateOrigin(place: Place | null) {
    setOrigin(place);
    if (!place) invalidate();
  }
  function clearDestination() {
    invalidate();
    setDestination(null);
  }
  function changeDeparture(value: Date | null) {
    invalidate();
    setDeparture(value);
  }
  async function saveSettings(value: Settings) {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ maxExtraMinutes: value.maxExtraMinutes }),
    );
    invalidate();
    setSettings(value);
  }
  async function calculate() {
    generation.current++;
    pending.current?.abort();
    setMessage("");
    const preferredKind =
      comparison?.routes.find((route) => route.id === selectedId)?.kind ??
      "balanced";
    const controller = new AbortController();
    pending.current = controller;
    const ticket = generation.current;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 20000);
    try {
      const now = new Date();
      const request = makeRouteRequest(
        origin?.coordinate ?? null,
        destination?.coordinate ?? null,
        departure ?? now,
        now,
        settings.maxExtraMinutes,
        Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Bucharest",
      );
      setLoading(true);
      const result = await calculateRoutes(request, controller.signal);
      if (ticket !== generation.current || controller.signal.aborted) return;
      setComparison(result);
      setSelectedId(
        (
          result.routes.find((route) => route.kind === preferredKind) ??
          result.routes[0]
        ).id,
      );
    } catch (error) {
      if (ticket === generation.current)
        setMessage(
          timedOut
            ? "Calculul a durat prea mult. Încearcă din nou."
            : controller.signal.aborted
              ? "Calculul a fost oprit."
              : error instanceof Error
                ? error.message
                : "Traseul nu a putut fi calculat.",
        );
    } finally {
      clearTimeout(timeout);
      if (ticket === generation.current) {
        setLoading(false);
        pending.current = null;
      }
    }
  }
  return {
    settings,
    hydrated,
    origin,
    destination,
    selection,
    setSelection,
    departure,
    changeDeparture,
    comparison,
    selectedId,
    setSelectedId,
    loading,
    message,
    setMessage,
    choosePlace,
    updateOrigin,
    clearDestination,
    swap,
    saveSettings,
    calculate,
    invalidate,
  };
}

type Planner = ReturnType<typeof usePlannerState>;
const Context = createContext<Planner | null>(null);
export function PlannerProvider({ children }: PropsWithChildren) {
  return (
    <Context.Provider value={usePlannerState()}>{children}</Context.Provider>
  );
}
export function usePlanner(): Planner {
  const context = useContext(Context);
  if (!context) throw new Error("PlannerProvider is required");
  return context;
}
