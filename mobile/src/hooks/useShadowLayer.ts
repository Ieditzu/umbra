import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { calculateShadows } from "../services/calculations";
import { CalculationError } from "../services/calculationClient";
import type { Coordinate } from "../domain/routes";
import type { Bounds, ShadowLayer } from "../domain/shadows";
import { visibleShadowLayer } from "../domain/shadows";

export function useShadowLayer(
  at: string,
  bounds: Bounds,
  enabled: boolean,
  includeEstimates = true,
  focus?: Coordinate,
) {
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
  const focusKey = focus
    ? `${focus.latitude.toFixed(4)},${focus.longitude.toFixed(4)}`
    : "";
  const requestKey = `${at}|${key}|${includeEstimates}|${focusKey}`;
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
            includeEstimates,
            focusKey
              ? {
                  latitude: Number(focusKey.split(",")[0]),
                  longitude: Number(focusKey.split(",")[1]),
                }
              : undefined,
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
                  : error instanceof CalculationError &&
                      error.code === "restart_required"
                    ? "server_restart"
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
  }, [at, key, requestKey, enabled, foreground, includeEstimates, focusKey]);
  const layer = useMemo(() => {
    const visible = visibleShadowLayer(
      result,
      at,
      key.split(",").map(Number) as Bounds,
      enabled,
      foreground,
    );
    return visible && !includeEstimates
      ? {
          ...visible,
          polygons: visible.polygons.filter(
            (p) => p.source !== "display_estimate",
          ),
        }
      : visible;
  }, [result, at, key, enabled, foreground, includeEstimates]);
  return {
    layer,
    status: !enabled
      ? "off"
      : !foreground
        ? "paused"
        : result.key === requestKey
          ? result.status
          : "loading",
  };
}
