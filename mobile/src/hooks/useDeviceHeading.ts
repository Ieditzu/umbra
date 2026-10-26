import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { compassDegrees, freshHeading, smoothHeading } from "../domain/heading";
import type { DeviceHeading } from "../domain/heading";

export function useDeviceHeading(enabled: boolean) {
  const [heading, setHeading] = useState<DeviceHeading | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let disposed = false,
      generation = 0;
    let watch: Location.LocationSubscription | null = null;
    let previous: DeviceHeading | null = null;
    let lastPaint = 0;
    function stop() {
      generation++;
      watch?.remove();
      watch = null;
      previous = null;
      setHeading(null);
    }
    async function start() {
      stop();
      if (!enabled || disposed || AppState.currentState !== "active") return;
      const ticket = generation;
      try {
        const subscription = await Location.watchHeadingAsync(
          (sample) => {
            if (disposed || ticket !== generation) return;
            const degrees = compassDegrees(sample),
              timestamp = Date.now();
            if (degrees === null) {
              previous = null;
              setHeading(null);
              return;
            }
            if (timestamp - lastPaint < 100) return;
            const next = {
              degrees:
                previous && freshHeading(previous, timestamp)
                  ? smoothHeading(previous.degrees, degrees)
                  : degrees,
              timestamp,
            };
            previous = next;
            lastPaint = timestamp;
            setHeading(next);
            setNow(timestamp);
          },
          () => {
            if (!disposed && ticket === generation) {
              previous = null;
              setHeading(null);
            }
          },
        );
        if (disposed || ticket !== generation) subscription.remove();
        else watch = subscription;
      } catch {
        if (!disposed && ticket === generation) setHeading(null);
      }
    }
    const initial = setTimeout(() => void start(), 0);
    const timer = setInterval(() => setNow(Date.now()), 2000);
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") void start();
      else stop();
    });
    return () => {
      disposed = true;
      generation++;
      watch?.remove();
      clearTimeout(initial);
      clearInterval(timer);
      app.remove();
    };
  }, [enabled]);
  return enabled && freshHeading(heading, now) ? heading : null;
}
