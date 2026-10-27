import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

function renderer(models = false) {
  const messages = [],
    instances = [];
  class Map {
    constructor() {
      this.events = {};
      this.sources = {};
      this.layers = {};
      this.pitch = 0;
      this.zoom = 15;
      this.roadFeatures = [];
      this.center = { lng: 28.64, lat: 44.175 };
      instances.push(this);
    }
    on(name, fn) {
      this.events[name] = fn;
    }
    once(name, fn) {
      this.events[name] = fn;
    }
    emit(name, event) {
      this.events[name]?.(event);
    }
    addControl() {}
    querySourceFeatures() {
      return this.roadFeatures;
    }
    triggerRepaint() {}
    getSource(id) {
      return this.sources[id];
    }
    addSource(id, source) {
      this.sources[id] = {
        data: source.data,
        replacements: 0,
        updates: 0,
        setData(value) {
          this.replacements++;
          this.data = value;
        },
        updateData(diff) {
          this.updates++;
          const features = new globalThis.Map(
            this.data.features.map((f) => [f.id, f]),
          );
          for (const id of diff.remove ?? []) features.delete(id);
          for (const f of diff.add ?? []) features.set(f.id, f);
          this.data = {
            type: "FeatureCollection",
            features: [...features.values()],
          };
          return Promise.resolve();
        },
      };
    }
    getLayer(id) {
      return this.layers[id];
    }
    addLayer(layer) {
      this.layers[layer.id] = layer;
    }
    setLayoutProperty(id, name, value) {
      this.layers[id].layout ??= {};
      this.layers[id].layout[name] = value;
    }
    getStyle() {
      return { layers: Object.values(this.layers) };
    }
    setLight(value) {
      this.light = value;
    }
    getBounds() {
      return {
        getWest: () => 28.63,
        getEast: () => 28.65,
        getSouth: () => 44.17,
        getNorth: () => 44.18,
      };
    }
    getCenter() {
      return this.center;
    }
    getPitch() {
      return this.pitch;
    }
    getZoom() {
      return this.zoom;
    }
    getBearing() {
      return 10;
    }
    getCanvas() {
      return { addEventListener() {} };
    }
    jumpTo(options) {
      this.easeTo(options);
    }
    easeTo(options) {
      this.lastCamera = options;
      if (options.pitch !== undefined) this.pitch = options.pitch;
      if (options.zoom !== undefined) this.zoom = options.zoom;
    }
    fitBounds(bounds, options) {
      this.frame = { bounds, options };
    }
  }
  class Marker {
    setLngLat(point) {
      this.point = point;
      return this;
    }
    addTo() {
      assert.ok(this.point);
      return this;
    }
    getElement() {
      return {};
    }
    remove() {}
  }
  class LngLatBounds {
    extend() {}
  }
  const window = {
    ReactNativeWebView: {
      postMessage: (text) => messages.push(JSON.parse(text)),
    },
    addEventListener() {},
  };
  if (models)
    window.umbraCreateTreeLayer = () => ({
      id: "umbra-tree-models",
      type: "custom",
      renderingMode: "3d",
      updates: [],
      obstacleUpdates: [],
      setObstacles(buildings, roads) {
        this.obstacleUpdates.push({ buildings, roads });
      },
      update(features) {
        this.updates.push(features);
      },
      inspect() {
        return { count: this.updates.at(-1)?.length ?? 0 };
      },
    });
  vm.runInNewContext(
    readFileSync(new URL("../map-web/map.js", import.meta.url), "utf8"),
    {
      window,
      document: { documentElement: { style: { setProperty() {} } } },
      maplibregl: { Map, Marker, LngLatBounds, AttributionControl: class {} },
      setTimeout,
      clearTimeout,
      AbortController,
      fetch: () => {
        throw new Error("Network disabled in test");
      },
    },
  );
  const map = instances[0];
  map.emit("style.load");
  return { bridge: window.umbraMap, map, messages, instances };
}

test("data updates and taps preserve building meshes and chosen pitch without recreating the map", () => {
  const { bridge, map, instances } = renderer();
  const buildings = {
    type: "FeatureCollection",
    features: [{ id: "synthetic-building" }],
  };
  bridge.receive({ type: "data", name: "buildings", value: buildings });
  bridge.receive({ type: "tilt", value: true });
  bridge.receive({
    type: "destination",
    place: {
      coordinate: { latitude: 44.175, longitude: 28.64 },
      label: "<img src=x onerror=alert(1)>",
    },
  });
  bridge.receive({
    type: "data",
    name: "shadows",
    value: { type: "FeatureCollection", features: [] },
  });
  bridge.receive({
    type: "follow",
    coordinate: { latitude: 44.176, longitude: 28.641 },
  });
  assert.equal(map.getPitch(), 55);
  assert.equal(
    map.getSource("umbra-buildings").data.features[0].id,
    "synthetic-building",
  );
  assert.equal(instances.length, 1);
  // A basemap style load must restore cached local geometry too.
  map.sources = {};
  map.layers = {};
  map.emit("style.load");
  assert.equal(
    map.getSource("umbra-buildings").data.features[0].id,
    "synthetic-building",
  );
  bridge.receive({
    type: "frame",
    coordinates: [
      [28.63, 44.17],
      [28.64, 44.18],
    ],
  });
  assert.equal(map.frame.options.pitch, 55);
});

test("user gestures emit interaction messages and a flat view remains controllable", () => {
  const { bridge, map, messages } = renderer();
  map.emit("pitchstart", { originalEvent: {} });
  assert.equal(messages.at(-1).type, "gesture");
  bridge.receive({ type: "tilt", value: true });
  bridge.receive({ type: "tilt", value: false });
  assert.equal(map.getPitch(), 0);
});

test("compass updates do not rotate recenter or recreate the map", () => {
  const { bridge, map, instances } = renderer();
  bridge.receive({ type: "tilt", value: true });
  const heading = {
    type: "FeatureCollection",
    features: [{ id: "direction" }],
  };
  bridge.receive({ type: "data", name: "heading", value: heading });
  assert.equal(map.getSource("umbra-heading").data, heading);
  assert.equal(map.getPitch(), 55);
  assert.equal(instances.length, 1);
  map.sources = {};
  map.layers = {};
  map.emit("style.load");
  assert.equal(map.getSource("umbra-heading").data, heading);
});

test("zoom viewport replacements retain loaded buildings and skip identical source rebuilds", () => {
  const { bridge, map } = renderer();
  const send = (ids, truncated = false) =>
    bridge.receive({
      type: "data",
      name: "buildings",
      value: {
        type: "FeatureCollection",
        features: ids.map((id) => ({ id })),
        truncated,
      },
    });
  send(["a", "b"]);
  const source = map.getSource("umbra-buildings");
  send(["a", "c"]);
  assert.equal(source.data.features.length, 3);
  assert.ok(source.data.features.some((f) => f.id === "b"));
  const updates = source.updates;
  send(["a", "c"]);
  send([], true);
  assert.equal(source.updates, updates);
  assert.equal(source.replacements, 0);
  assert.equal(map.getSource("umbra-buildings"), source);
  map.sources = {};
  map.layers = {};
  map.emit("style.load");
  assert.equal(map.getSource("umbra-buildings").data.features.length, 3);
});

test("retained building geometry stays bounded while giving the new viewport priority", () => {
  const { bridge, map } = renderer();
  const send = (ids) =>
    bridge.receive({
      type: "data",
      name: "buildings",
      value: { type: "FeatureCollection", features: ids.map((id) => ({ id })) },
    });
  send(Array.from({ length: 5000 }, (_, i) => `old-${i}`));
  send(["new"]);
  const source = map.getSource("umbra-buildings");
  assert.equal(source.data.features.length, 5000);
  assert.ok(source.data.features.some((f) => f.id === "new"));
  assert.equal(source.replacements, 0);
});

test("server Sun rotates building light in geographic coordinates and survives a style reload", () => {
  const { bridge, map } = renderer();
  bridge.receive({
    type: "data",
    name: "shadows",
    value: {
      type: "FeatureCollection",
      features: [],
      sun: { azimuth: 110, elevation: 30 },
    },
  });
  assert.equal(
    JSON.stringify(map.light.position),
    JSON.stringify([1.5, 110, 60]),
  );
  map.sources = {};
  map.layers = {};
  map.emit("style.load");
  assert.equal(
    JSON.stringify(map.light.position),
    JSON.stringify([1.5, 110, 60]),
  );
});

test("a jump between distant cities replaces the spatial index without resetting camera tilt", () => {
  const { bridge, map } = renderer();
  const feature = (id, x, y) => ({
    id,
    type: "Feature",
    properties: { height: 0, display_height: 6 },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [x, y],
          [x + 0.001, y],
          [x, y + 0.001],
          [x, y],
        ],
      ],
    },
  });
  bridge.receive({
    type: "data",
    name: "buildings",
    value: {
      type: "FeatureCollection",
      features: [feature("ct", 28.63, 44.17)],
    },
  });
  bridge.receive({ type: "tilt", value: true });
  const source = map.getSource("umbra-buildings");
  bridge.receive({
    type: "data",
    name: "buildings",
    value: {
      type: "FeatureCollection",
      features: [feature("buc", 26.1, 44.43)],
    },
  });
  assert.equal(source.data.features.length, 1);
  assert.equal(source.data.features[0].id, "buc");
  assert.equal(source.replacements, 1);
  assert.equal(map.getPitch(), 55);
});

test("a refreshed renderer restores its previous camera rather than jumping back to Constanta", () => {
  const { bridge, map, instances } = renderer();
  bridge.receive({
    type: "camera",
    center: { longitude: 26.102, latitude: 44.435 },
    zoom: 17,
    pitch: 65,
    bearing: 20,
  });
  assert.equal(map.getPitch(), 65);
  assert.equal(map.getZoom(), 17);
  assert.equal(instances.length, 1);
});

test("navigation recentres close to the walker and preserves manual zoom on GPS updates", () => {
  const { bridge, map, instances } = renderer();
  const coordinate = { latitude: 44.175, longitude: 28.64 };
  bridge.receive({
    type: "follow",
    coordinate,
    recenter: true,
    navigating: true,
  });
  assert.equal(map.getZoom(), 18);
  assert.deepEqual(Array.from(map.lastCamera.center), [28.64, 44.175]);
  map.zoom = 17.4;
  bridge.receive({
    type: "follow",
    coordinate,
    recenter: false,
    navigating: true,
  });
  assert.equal(map.getZoom(), 17.4);
  bridge.receive({
    type: "frame",
    navigating: true,
    coordinates: [
      [28.64, 44.175],
      [28.65, 44.18],
    ],
  });
  assert.equal(map.frame.options.padding.bottom, 240);
  bridge.receive({
    type: "follow",
    coordinate,
    recenter: true,
    navigating: true,
  });
  assert.equal(map.getZoom(), 18);
  bridge.receive({
    type: "follow",
    coordinate,
    recenter: true,
    navigating: false,
  });
  assert.equal(map.getZoom(), 16);
  assert.equal(instances.length, 1);
});

test("the building layer controls canopies independently of camera tilt", () => {
  const { bridge, map } = renderer();
  assert.equal(map.layers["umbra-tree-canopy"].layout.visibility, "visible");
  bridge.receive({ type: "models", value: true });
  assert.equal(map.getPitch(), 0);
  assert.equal(map.layers["umbra-tree-canopy"].layout.visibility, "none");
  assert.equal(map.layers["umbra-tree-volume"].layout.visibility, "visible");
  assert.equal(map.layers["umbra-buildings"].layout.visibility, "visible");
  bridge.receive({ type: "tilt", value: true });
  map.emit("moveend");
  bridge.receive({ type: "tilt", value: false });
  map.emit("moveend");
  assert.equal(map.layers["umbra-tree-volume"].layout.visibility, "visible");
  bridge.receive({ type: "models", value: false });
  assert.equal(map.layers["umbra-tree-canopy"].layout.visibility, "visible");
  assert.equal(map.layers["umbra-tree-volume"].layout.visibility, "none");
  assert.equal(map.layers["umbra-buildings"].layout.visibility, "none");
});

test("tree model layer follows the layer setting and survives camera changes", () => {
  const { bridge, map } = renderer(true);
  const model = map.layers["umbra-tree-models"];
  const features = [
    {
      type: "Feature",
      id: "tree-1",
      properties: { source: "tree_canopy" },
      geometry: { type: "Polygon", coordinates: [] },
    },
  ];
  bridge.receive({
    type: "data",
    name: "shadows",
    value: { type: "FeatureCollection", features },
  });
  assert.equal(model.updates.at(-1).length, 1);
  bridge.receive({ type: "models", value: true });
  bridge.receive({ type: "tilt", value: true });
  map.emit("moveend");
  assert.equal(map.layers["umbra-tree-volume"].layout.visibility, "none");
  assert.equal(map.layers["umbra-tree-canopy"].layout.visibility, "none");
  bridge.receive({ type: "tilt", value: false });
  map.emit("moveend");
  assert.equal(map.layers["umbra-tree-canopy"].layout.visibility, "none");
  bridge.receive({ type: "models", value: false });
  assert.equal(map.layers["umbra-tree-canopy"].layout.visibility, "visible");
  bridge.receive({
    type: "data",
    name: "shadows",
    retainTrees: false,
    value: { type: "FeatureCollection", features: [] },
  });
  assert.equal(model.updates.at(-1).length, 0);
});

test("tree cache survives empty refreshes prioritizes the current view and clears when disabled", () => {
  const { bridge, map } = renderer(true);
  const tree = (id, lon) => ({
    type: "Feature",
    id,
    properties: { source: "tree_canopy" },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [lon, 44.175],
          [lon + 0.001, 44.175],
          [lon, 44.176],
          [lon, 44.175],
        ],
      ],
    },
  });
  bridge.receive({
    type: "data",
    name: "shadows",
    retainTrees: true,
    value: {
      type: "FeatureCollection",
      features: [tree("far", 28.67), tree("near", 28.64)],
    },
  });
  assert.equal(map.layers["umbra-tree-models"].updates.at(-1)[0].id, "near");
  map.center = { lng: 28.67, lat: 44.175 };
  map.emit("moveend");
  assert.equal(map.layers["umbra-tree-models"].updates.at(-1)[0].id, "far");
  bridge.receive({
    type: "data",
    name: "shadows",
    retainTrees: true,
    value: { type: "FeatureCollection", features: [] },
  });
  assert.equal(map.getSource("umbra-shadows").data.features.length, 2);
  assert.equal(map.layers["umbra-tree-models"].updates.at(-1).length, 2);
  bridge.receive({
    type: "data",
    name: "shadows",
    retainTrees: true,
    value: { type: "FeatureCollection", features: [tree("new", 28.641)] },
  });
  assert.equal(map.getSource("umbra-shadows").data.features.length, 3);
  map.center = { lng: 26.1, lat: 44.435 };
  bridge.receive({
    type: "data",
    name: "shadows",
    retainTrees: true,
    value: { type: "FeatureCollection", features: [tree("bucharest", 26.1)] },
  });
  assert.equal(map.getSource("umbra-shadows").data.features.length, 1);
  assert.equal(map.getSource("umbra-shadows").data.features[0].id, "bucharest");
  bridge.receive({
    type: "data",
    name: "shadows",
    retainTrees: false,
    value: { type: "FeatureCollection", features: [] },
  });
  assert.equal(map.getSource("umbra-shadows").data.features.length, 0);
  assert.equal(map.layers["umbra-tree-models"].updates.at(-1).length, 0);
});

test("tree clearance refreshes after road tiles load and ignores repeated idle events", async () => {
  const { map } = renderer(true);
  const layer = map.layers["umbra-tree-models"];
  map.addLayer({
    id: "road-street",
    source: "openmaptiles",
    "source-layer": "transportation",
    type: "line",
  });
  const road = {
    id: 12,
    properties: { class: "minor" },
    geometry: {
      type: "LineString",
      coordinates: [
        [28.64, 44.17],
        [28.64, 44.18],
      ],
    },
  };
  map.roadFeatures = [road];
  map.emit("idle");
  await new Promise((resolve) => setTimeout(resolve, 380));
  assert.equal(layer.obstacleUpdates.length, 1);
  assert.equal(layer.obstacleUpdates[0].roads.length, 1);
  map.emit("idle");
  await new Promise((resolve) => setTimeout(resolve, 380));
  assert.equal(layer.obstacleUpdates.length, 1);
  map.roadFeatures = [];
  map.emit("idle");
  await new Promise((resolve) => setTimeout(resolve, 380));
  assert.equal(layer.obstacleUpdates.length, 2);
  assert.equal(layer.obstacleUpdates[1].roads.length, 0);
});
