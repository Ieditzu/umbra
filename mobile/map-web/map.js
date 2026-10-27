/* global maplibregl */
(() => {
  const empty = () => ({ type: "FeatureCollection", features: [] });
  const send = (message) =>
    window.ReactNativeWebView?.postMessage(JSON.stringify(message));
  window.addEventListener("error", (event) => {
    if (event.message) send({ type: "error", message: event.message });
  });
  const saved = {
    buildings: empty(),
    shadows: empty(),
    route: empty(),
    location: empty(),
    heading: empty(),
  };
  let map,
    destination,
    readySent = false,
    pressTimer,
    pressPoint;
  function putBuildings(value) {
    // A rejected wide-view calculation must never erase already loaded geometry.
    if (!value.features.length && value.truncated) return;
    const oldPoint =
      saved.buildings.features[0]?.geometry?.coordinates?.[0]?.[0];
    const newPoint = value.features[0]?.geometry?.coordinates?.[0]?.[0];
    if (
      oldPoint &&
      newPoint &&
      (Math.abs(oldPoint[0] - newPoint[0]) > 0.25 ||
        Math.abs(oldPoint[1] - newPoint[1]) > 0.25)
    ) {
      // City jumps need a fresh tile index; keep incremental updates for local zoom/pan.
      saved.buildings = value;
      map.getSource("umbra-buildings")?.setData(value);
      return;
    }
    const previous = new Map(saved.buildings.features.map((f) => [f.id, f]));
    const retained = new Map();
    let vertices = 0;
    // New viewport wins under pressure; nearby cached parts survive zoom changes.
    for (const f of [...value.features, ...saved.buildings.features]) {
      if (retained.has(f.id)) continue;
      const feature = previous.get(f.id) ?? f;
      const count =
        feature.geometry?.coordinates?.reduce(
          (n, ring) => n + ring.length,
          0,
        ) ?? 0;
      if (retained.size >= 5000 || vertices + count > 120000) continue;
      retained.set(f.id, feature);
      vertices += count;
    }
    const add = [...retained.values()].filter((f) => !previous.has(f.id));
    const remove = [...previous.keys()].filter((id) => !retained.has(id));
    if (!add.length && !remove.length) return;
    saved.buildings = {
      type: "FeatureCollection",
      features: [...retained.values()],
    };
    const source = map.getSource("umbra-buildings");
    if (source) {
      // Stable IDs let MapLibre keep untouched geometry instead of rebuilding it all.
      source.updateData({ add, remove }).catch(() => {
        source.setData(saved.buildings);
      });
    }
  }
  function put(name, value) {
    if (name === "buildings") return putBuildings(value);
    saved[name] = value;
    const source = map.getSource(`umbra-${name}`);
    if (source) source.setData(value);
    if (name === "shadows" && value.sun) applySun();
  }
  function applySun() {
    const sun = saved.shadows.sun;
    map.setLight({
      anchor: "map",
      position: sun ? [1.5, sun.azimuth, 90 - sun.elevation] : [1.5, 210, 45],
      intensity: sun && sun.elevation < 0 ? 0.08 : 0.32,
    });
  }
  function viewport() {
    const box = map.getBounds(),
      c = map.getCenter();
    send({
      type: "viewport",
      bounds: [box.getWest(), box.getSouth(), box.getEast(), box.getNorth()],
      center: { longitude: c.lng, latitude: c.lat },
      pitch: map.getPitch(),
      zoom: map.getZoom(),
      bearing: map.getBearing(),
    });
  }
  function installLayers() {
    for (const name of Object.keys(saved))
      if (!map.getSource(`umbra-${name}`))
        map.addSource(`umbra-${name}`, { type: "geojson", data: saved[name] });
    const before = map
      .getStyle()
      .layers.find((layer) => layer.type === "symbol")?.id;
    if (!map.getLayer("umbra-shadows"))
      map.addLayer(
        {
          id: "umbra-shadows",
          type: "fill",
          source: "umbra-shadows",
          paint: {
            "fill-color": [
              "match",
              ["get", "source"],
              "display_estimate",
              "#456d88",
              "tree_estimate",
              "#456d88",
              "tree_canopy",
              "#51945c",
              "#182b3c",
            ],
            "fill-opacity": [
              "match",
              ["get", "source"],
              "display_estimate",
              0.18,
              "tree_estimate",
              0.18,
              "tree_canopy",
              0.4,
              "levels_estimate",
              0.26,
              0.34,
            ],
          },
        },
        before,
      );
    if (!map.getLayer("umbra-unknown"))
      map.addLayer(
        {
          id: "umbra-unknown",
          type: "fill",
          source: "umbra-buildings",
          filter: ["==", ["get", "height"], 0],
          paint: {
            "fill-color": "#e8e8e2",
            "fill-opacity": 0.8,
          },
        },
        before,
      );
    if (!map.getLayer("umbra-buildings"))
      map.addLayer(
        {
          id: "umbra-buildings",
          type: "fill-extrusion",
          source: "umbra-buildings",
          paint: {
            "fill-extrusion-color": [
              "case",
              ["==", ["get", "height_source"], "osm_height_tag"],
              "#f7f7f2",
              "#e8e9e3",
            ],
            "fill-extrusion-height": ["get", "display_height"],
            "fill-extrusion-base": 0,
            "fill-extrusion-opacity": 1,
          },
        },
        before,
      );
    if (!map.getLayer("umbra-route"))
      map.addLayer({
        id: "umbra-route",
        type: "line",
        source: "umbra-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-width": 6,
          "line-color": [
            "match",
            ["get", "exposure"],
            "shade",
            "#267245",
            "estimated_shade",
            "#8cae71",
            "sun",
            "#d58d26",
            "#7b8587",
          ],
        },
      });
    if (!map.getLayer("umbra-accuracy"))
      map.addLayer({
        id: "umbra-accuracy",
        type: "fill",
        source: "umbra-location",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": "#4285f4", "fill-opacity": 0.08 },
      });
    if (!map.getLayer("umbra-heading"))
      map.addLayer({
        id: "umbra-heading",
        type: "fill",
        source: "umbra-heading",
        paint: { "fill-color": "#4285f4", "fill-opacity": 0.27 },
      });
    if (!map.getLayer("umbra-location"))
      map.addLayer({
        id: "umbra-location",
        type: "circle",
        source: "umbra-location",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 8,
          "circle-color": "#4285f4",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#fff",
        },
      });
    applySun();
    if (!readySent) {
      readySent = true;
      send({ type: "ready" });
    }
    viewport();
  }
  function cancelPress() {
    clearTimeout(pressTimer);
    pressTimer = undefined;
  }
  function startGesture() {
    cancelPress();
    send({ type: "gesture" });
  }
  try {
    map = new maplibregl.Map({
      container: "map",
      center: [28.6383, 44.1733],
      zoom: 14.7,
      maxZoom: 19,
      maxPitch: 70,
      pitch: 0,
      attributionControl: false,
      touchPitch: true,
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#eceee8" },
          },
        ],
      },
    });
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution:
          '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>',
      }),
      "bottom-left",
    );
    map.on("style.load", installLayers);
    map.on("moveend", viewport);
    map.on("dragstart", startGesture);
    map.on("zoomstart", (e) => {
      if (e.originalEvent) startGesture();
    });
    map.on("pitchstart", (e) => {
      if (e.originalEvent) startGesture();
    });
    map.on("rotatestart", (e) => {
      if (e.originalEvent) startGesture();
    });
    map.on("contextmenu", (e) => {
      cancelPress();
      send({
        type: "pick",
        coordinate: { latitude: e.lngLat.lat, longitude: e.lngLat.lng },
      });
    });
    const canvas = map.getCanvas();
    canvas.addEventListener(
      "touchstart",
      (event) => {
        cancelPress();
        if (event.touches.length !== 1) {
          send({ type: "gesture" });
          return;
        }
        const touch = event.touches[0],
          box = canvas.getBoundingClientRect();
        pressPoint = { x: touch.clientX, y: touch.clientY };
        pressTimer = setTimeout(() => {
          const c = map.unproject([
            pressPoint.x - box.left,
            pressPoint.y - box.top,
          ]);
          send({
            type: "pick",
            coordinate: { latitude: c.lat, longitude: c.lng },
          });
        }, 650);
      },
      { passive: true },
    );
    canvas.addEventListener(
      "touchmove",
      (event) => {
        if (
          event.touches.length !== 1 ||
          !pressPoint ||
          Math.hypot(
            event.touches[0].clientX - pressPoint.x,
            event.touches[0].clientY - pressPoint.y,
          ) > 8
        )
          cancelPress();
      },
      { passive: true },
    );
    canvas.addEventListener("touchend", cancelPress, { passive: true });
    canvas.addEventListener("touchcancel", cancelPress, { passive: true });
    map.once("load", async () => {
      const controller = new AbortController(),
        timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(
          "https://tiles.openfreemap.org/styles/liberty",
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Basemap unavailable");
        const style = await response.json();
        // Only our height-provenance-aware local source supplies 3D buildings.
        style.layers = style.layers.filter(
          (layer) => layer.type !== "fill-extrusion",
        );
        for (const layer of style.layers) {
          const id = layer.id.toLowerCase();
          if (layer.type === "background")
            layer.paint = { ...layer.paint, "background-color": "#f5f4ed" };
          if (layer.type === "fill" && /water/.test(id))
            layer.paint = { ...layer.paint, "fill-color": "#c7e8f0" };
          if (layer.type === "fill" && /park|grass|wood/.test(id))
            layer.paint = { ...layer.paint, "fill-color": "#dcebcf" };
          if (layer.type === "fill" && /building/.test(id))
            layer.paint = { ...layer.paint, "fill-color": "#e8e8e2" };
        }
        map.setStyle(style);
      } catch {
        /* Local buildings/routes still render on a plain background offline. */
      } finally {
        clearTimeout(timeout);
      }
    });
    window.umbraMap = {
      receive(message) {
        switch (message.type) {
          case "data":
            put(message.name, message.value);
            break;
          case "camera":
            map.jumpTo({
              center: [message.center.longitude, message.center.latitude],
              zoom: message.zoom,
              pitch: message.pitch,
              bearing: message.bearing,
            });
            break;
          case "tilt":
            if (map.getPitch() > 2 !== message.value)
              map.easeTo({
                pitch: message.value ? 55 : 0,
                ...(message.value && map.getZoom() < 16
                  ? { zoom: message.navigating ? 18 : 16 }
                  : {}),
                duration: 350,
              });
            break;
          case "follow":
            map.easeTo({
              center: [
                message.coordinate.longitude,
                message.coordinate.latitude,
              ],
              ...(message.recenter
                ? { zoom: message.navigating ? 18 : 16 }
                : {}),
              duration: 500,
            });
            break;
          case "frame": {
            const points = message.coordinates;
            if (!points?.length) break;
            const bounds = new maplibregl.LngLatBounds(points[0], points[0]);
            for (const point of points) bounds.extend(point);
            map.fitBounds(bounds, {
              padding: {
                top: 150,
                bottom: message.navigating ? 240 : 380,
                left: 35,
                right: 35,
              },
              maxZoom: 17,
              pitch: map.getPitch(),
              bearing: map.getBearing(),
              duration: 450,
            });
            break;
          }
          case "navigation":
            document.documentElement.style.setProperty(
              "--bottom-clearance",
              message.active ? "240px" : destination ? "400px" : "135px",
            );
            break;
          case "destination": {
            if (!message.place) {
              destination?.remove();
              destination = null;
            } else {
              if (!destination)
                destination = new maplibregl.Marker({ color: "#267245" })
                  .setLngLat([
                    message.place.coordinate.longitude,
                    message.place.coordinate.latitude,
                  ])
                  .addTo(map);
              else
                destination.setLngLat([
                  message.place.coordinate.longitude,
                  message.place.coordinate.latitude,
                ]);
              destination.getElement().title = message.place.label;
            }
            document.documentElement.style.setProperty(
              "--bottom-clearance",
              message.place ? "375px" : "135px",
            );
            break;
          }
        }
      },
    };
    // Expose a read-only-style diagnostic entry for the local browser QA harness.
    window.umbraMap.inspect = () => ({
      pitch: map.getPitch(),
      buildings: saved.buildings.features.length,
      shadows: saved.shadows.features.length,
      route: saved.route.features.length,
    });
    window.umbraMap.map = map;
  } catch (error) {
    send({ type: "error", message: String(error.message || error) });
  }
})();
