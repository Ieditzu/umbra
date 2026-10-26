import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { calculateShadows } from "../services/calculations";
import { CalculationError } from "../services/calculationClient";
import type { Bounds, ShadowLayer } from "../domain/shadows";
import { visibleShadowLayer } from "../domain/shadows";

export function useShadowLayer(at: string, bounds: Bounds, enabled: boolean) {
  const [result, setResult] = useState<{
    layer: ShadowLayer | null;
    status: string;
    key: string;
    bounds: Bounds | null;
  }>({ layer: null, status: "idle", key: "", bounds: null });
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    return () => sub.remove();
  }, []);
  const key = bounds.map((value) => value.toFixed(4)).join(",");
  const requestKey = `${at}|${key}`;
  useEffect(() => {
    if (!enabled || !foreground) return;
    const controller = new AbortController();
    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      setResult((previous) => ({
        ...previous,
        status: "loading",
        key: requestKey,
      }));
      timeout = setTimeout(() => {
        controller.abort();
        if (active)
          setResult({
            layer: null,
            status: "unavailable",
            key: requestKey,
            bounds: null,
          });
      }, 15000);
      const updateLayer = async () => {
        try {
          const result = await calculateShadows(
            at,
            key.split(",").map(Number) as Bounds,
            controller.signal,
          );
          if (!controller.signal.aborted && active)
            setResult({
              layer: result,
              status: result.state,
              key: requestKey,
              bounds: key.split(",").map(Number) as Bounds,
            });
        } catch (error) {
          if (!controller.signal.aborted && active)
            setResult({
              layer: null,
              status:
                error instanceof CalculationError && error.code === "outside"
                  ? "outside"
                  : "unavailable",
              key: requestKey,
              bounds: null,
            });
        } finally {
          clearTimeout(timeout);
        }
      };
      void updateLayer();
    }, 500);
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
      clearTimeout(timeout);
    };
  }, [at, key, requestKey, enabled, foreground]);
  return {
    layer: visibleShadowLayer(
      result,
      at,
      key.split(",").map(Number) as Bounds,
      enabled,
      foreground,
    ),
    status: !enabled
      ? "off"
      : !foreground
        ? "paused"
        : result.key === requestKey
          ? result.status
          : "loading",
  };
}
