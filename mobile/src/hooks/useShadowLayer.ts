import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { normalizeApiUrl } from "../domain/settings";
import { parseShadowLayer } from "../domain/shadows";
import type { Bounds, ShadowLayer } from "../domain/shadows";

export function useShadowLayer(
  apiUrl: string,
  at: string,
  bounds: Bounds,
  enabled: boolean,
) {
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
  const requestKey = `${apiUrl}|${at}|${key}`;
  useEffect(() => {
    if (!enabled || !apiUrl || !foreground) return;
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
      const fetchLayer = async () => {
        try {
          const response = await fetch(
            `${normalizeApiUrl(apiUrl)}/v1/shadows`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ at, bounds: key.split(",").map(Number) }),
              signal: controller.signal,
            },
          );
          if (!response.ok) throw new Error("unavailable");
          if (Number(response.headers.get("content-length")) > 5000000)
            throw new Error("oversize");
          const body = await response.text();
          if (body.length > 5000000) throw new Error("oversize");
          const result = parseShadowLayer(JSON.parse(body), at);
          if (!controller.signal.aborted && active)
            setResult({ layer: result, status: result.state, key: requestKey });
        } catch {
          if (!controller.signal.aborted && active)
            setResult({ layer: null, status: "unavailable", key: requestKey });
        } finally {
          clearTimeout(timeout);
        }
      };
      void fetchLayer();
    }, 500);
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
      clearTimeout(timeout);
    };
  }, [apiUrl, at, key, requestKey, enabled, foreground]);
  const valid = enabled && foreground && !!apiUrl && result.key === requestKey;
  return {
    layer: valid ? result.layer : null,
    status: !enabled
      ? "off"
      : !apiUrl
        ? "unconfigured"
        : !foreground
          ? "paused"
          : result.key === requestKey
            ? result.status
            : "loading",
  };
}
