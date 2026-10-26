import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

function renderer() {
  const messages = [],
    instances = [];
  class Map {
    constructor() {
      this.events = {};
      this.sources = {};
      this.layers = {};
      this.pitch = 0;
      this.zoom = 15;
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
    getSource(id) {
      return this.sources[id];
    }
    addSource(id, source) {
      this.sources[id] = {
        data: source.data,
        setData(value) {
          this.data = value;
        },
      };
    }
    getLayer(id) {
      return this.layers[id];
    }
    addLayer(layer) {
      this.layers[layer.id] = layer;
    }
    getStyle() {
      return { layers: Object.values(this.layers) };
    }
    setLight() {}
    getBounds() {
      return {
        getWest: () => 28.63,
        getEast: () => 28.65,
        getSouth: () => 44.17,
        getNorth: () => 44.18,
      };
    }
    getCenter() {
      return { lng: 28.64, lat: 44.175 };
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
    easeTo(options) {
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
  assert.equal(map.getSource("umbra-buildings").data, buildings);
  assert.equal(instances.length, 1);
  // A basemap style load must restore cached local geometry too.
  map.sources = {};
  map.layers = {};
  map.emit("style.load");
  assert.equal(map.getSource("umbra-buildings").data, buildings);
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
