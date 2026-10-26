import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { calculateShadows } from "../services/localEngine";
import { OutsideCoverageError } from "../engine/overlay";
import type { Bounds, ShadowLayer } from "../domain/shadows";

export function useShadowLayer(at: string, bounds: Bounds, enabled: boolean) {
  const [result, setResult] = useState<{
    layer: ShadowLayer | null;
    status: string;
    key: string;
  }>({ layer: null, status: "idle", key: "" });
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
      setResult({ layer: null, status: "loading", key: requestKey });
      timeout = setTimeout(() => {
        controller.abort();
        if (active)
          setResult({ layer: null, status: "unavailable", key: requestKey });
      }, 15000);
      const updateLayer = async () => {
        try {
          const result = await calculateShadows(
            at,
            key.split(",").map(Number) as Bounds,
            controller.signal,
          );
          if (!controller.signal.aborted && active)
            setResult({ layer: result, status: result.state, key: requestKey });
        } catch (error) {
          if (!controller.signal.aborted && active)
            setResult({
              layer: null,
              status:
                error instanceof OutsideCoverageError
                  ? "outside"
                  : "unavailable",
              key: requestKey,
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
  const valid = enabled && foreground && result.key === requestKey;
  return {
    layer: valid ? result.layer : null,
    status: !enabled
      ? "off"
      : !foreground
        ? "paused"
        : result.key === requestKey
          ? result.status
          : "loading",
  };
}
