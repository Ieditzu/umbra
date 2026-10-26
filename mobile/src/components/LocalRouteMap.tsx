import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import {
  parseMapMessage,
  routeFeatures,
  shadowFeatures,
  locationFeatures,
  headingFeatures,
} from "../domain/localMap";
import { routeCoordinates } from "../domain/routes";
import type { Bounds } from "../domain/shadows";
import { calculateBuildings } from "../services/localEngine";
import { LOCAL_MAP_HTML } from "../generated/localMapHtml";
import type { RouteMapProps } from "./RouteMap";
import { colors } from "../theme";

const source = { html: LOCAL_MAP_HTML, baseUrl: "https://umbra.local/" };
const initialBounds: Bounds = [28.63, 44.165, 28.65, 44.185];
const allowedLink = (url: string) =>
  /^https:\/\/(www\.)?(openstreetmap\.org|openmaptiles\.org|openfreemap\.org|maplibre\.org)(\/|$)/.test(
    url,
  );

export function LocalRouteMap(props: RouteMapProps) {
  // Explicit generic avoids WebView's default `undefined` collapsing props to never under TS 6.
  const web = useRef<WebView<object>>(null);
  const current = useRef(props);
  useEffect(() => {
    current.current = props;
  }, [props]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState({
    bounds: initialBounds,
    center: { latitude: 44.175, longitude: 28.64 },
  });
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const nativePitch = useRef(false);
  const centered = useRef(-1);
  const framed = useRef("");
  const buildingTicket = useRef(0);
  const boundsKey = [
    ...view.bounds,
    view.center.longitude,
    view.center.latitude,
  ]
    .map((n) => n.toFixed(5))
    .join(",");
  const send = useCallback((message: unknown) => {
    // JSON serialization is data, never an interpolated destination label or code.
    web.current?.injectJavaScript(
      `window.umbraMap&&window.umbraMap.receive(${JSON.stringify(message)});true;`,
    );
  }, []);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!ready || !foreground) return;
    const controller = new AbortController(),
      ticket = ++buildingTicket.current;
    const values = boundsKey.split(",").map(Number);
    const timer = setTimeout(() => {
      void calculateBuildings(values.slice(0, 4) as Bounds, controller.signal, {
        longitude: values[4],
        latitude: values[5],
      })
        .then((value) => {
          if (!controller.signal.aborted && ticket === buildingTicket.current)
            send({ type: "data", name: "buildings", value });
        })
        .catch(() => {
          if (!controller.signal.aborted && ticket === buildingTicket.current)
            setError("Clădirile locale nu au putut fi încărcate.");
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [ready, foreground, boundsKey, send]);
  useEffect(() => {
    if (ready)
      send({
        type: "data",
        name: "shadows",
        value: shadowFeatures(props.shadows),
      });
  }, [ready, props.shadows, send]);
  useEffect(() => {
    if (ready)
      send({ type: "data", name: "route", value: routeFeatures(props.route) });
  }, [ready, props.route, send]);
  useEffect(() => {
    if (!ready) return;
    const fix = props.fix;
    send({
      type: "data",
      name: "location",
      value: locationFeatures(fix),
    });
    if (fix && props.following && foreground) {
      const recenter = centered.current !== props.recenter;
      centered.current = props.recenter;
      send({ type: "follow", coordinate: fix, recenter });
    }
  }, [ready, props.fix, props.following, props.recenter, foreground, send]);
  useEffect(() => {
    if (ready)
      send({
        type: "data",
        name: "heading",
        value: headingFeatures(props.fix, props.heading),
      });
  }, [ready, props.fix, props.heading, send]);
  useEffect(() => {
    if (ready) send({ type: "destination", place: props.destination });
  }, [ready, props.destination, send]);
  useEffect(() => {
    if (!ready || nativePitch.current === props.threeD) return;
    nativePitch.current = props.threeD;
    send({ type: "tilt", value: props.threeD });
  }, [ready, props.threeD, send]);
  useEffect(() => {
    if (!ready || !props.destination) {
      if (!props.destination) framed.current = "";
      return;
    }
    const destination = props.destination.coordinate;
    const key = `${destination.latitude}|${destination.longitude}|${props.route?.kind ?? "destination"}`;
    if (framed.current === key) return;
    framed.current = key;
    const points = props.route
      ? routeCoordinates(props.route)
      : [current.current.fix, destination].filter((p) => p !== null);
    send({
      type: "frame",
      coordinates: points.map((p) => [p.longitude, p.latitude]),
    });
  }, [ready, props.destination, props.route, send]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <WebView<object>
        ref={web}
        source={source}
        style={styles.web}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        textZoom={100}
        applicationNameForUserAgent="Umbra/0.1"
        allowsInlineMediaPlayback
        onMessage={(event) => {
          const message = parseMapMessage(event.nativeEvent.data);
          if (!message) return;
          if (message.type === "ready") {
            setReady(true);
            setError("");
          } else if (message.type === "viewport") {
            setView({ bounds: message.bounds, center: message.center });
            current.current.onBounds(message.bounds);
            nativePitch.current = message.pitch > 2;
            current.current.onThreeDChange(nativePitch.current);
          } else if (message.type === "gesture") current.current.onPan();
          else if (message.type === "pick")
            current.current.onPick(message.coordinate);
          else if (message.type === "error")
            setError("Randarea 3D nu a putut porni pe acest dispozitiv.");
        }}
        onShouldStartLoadWithRequest={(request) => {
          if (
            request.url === "about:blank" ||
            request.url.startsWith("https://umbra.local/")
          )
            return true;
          if (request.navigationType === "click" && allowedLink(request.url))
            void Linking.openURL(request.url);
          return false;
        }}
        onOpenWindow={(event) => {
          if (allowedLink(event.nativeEvent.targetUrl))
            void Linking.openURL(event.nativeEvent.targetUrl);
        }}
        onContentProcessDidTerminate={() => {
          setReady(false);
          centered.current = -1;
          framed.current = "";
          web.current?.reload();
        }}
        onError={() => setError("Harta locală nu a putut porni.")}
      />
      {!ready && !error && (
        <View pointerEvents="none" style={styles.loading}>
          <ActivityIndicator color={colors.green} />
        </View>
      )}
      {!!error && (
        <Pressable
          style={styles.error}
          onPress={() => {
            setError("");
            setReady(false);
            centered.current = -1;
            framed.current = "";
            web.current?.reload();
          }}
        >
          <Text style={styles.errorText}>{error} Reîncearcă</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: "#eceee8" },
  loading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  error: {
    position: "absolute",
    left: 24,
    right: 24,
    top: "45%",
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.white,
  },
  errorText: { color: colors.error, lineHeight: 20 },
});
