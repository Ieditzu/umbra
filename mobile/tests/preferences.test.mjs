import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PREFERENCES,
  restorePreferences,
  serializePreferences,
} from "../src/domain/preferences.ts";
import {
  createPreferenceStore,
  PREFERENCE_KEY,
} from "../src/state/preferenceStore.ts";

function memory(raw = null) {
  const storage = {
    raw,
    writes: [],
    async getItem(key) {
      assert.equal(key, PREFERENCE_KEY);
      return this.raw;
    },
    async setItem(key, value) {
      assert.equal(key, PREFERENCE_KEY);
      this.writes.push(value);
      this.raw = value;
    },
  };
  return storage;
}

test("legacy detour settings migrate and corrupt values use safe platform defaults", () => {
  assert.deepEqual(restorePreferences(null, "ios"), DEFAULT_PREFERENCES);
  assert.equal(
    restorePreferences('{"maxExtraMinutes":10,"apiUrl":"http://old"}', "ios")
      .maxExtraMinutes,
    10,
  );
  assert.deepEqual(restorePreferences("broken", "ios"), DEFAULT_PREFERENCES);
  const raw = JSON.stringify({
    mapStyle: "terrain",
    threeD: true,
    showShadows: false,
    departureAt: "bad",
    maxExtraMinutes: 999,
  });
  assert.equal(restorePreferences(raw, "android").mapStyle, "terrain");
  assert.equal(restorePreferences(raw, "ios").mapStyle, "map");
  assert.equal(restorePreferences(raw, "ios").threeD, true);
  assert.equal(restorePreferences(raw, "ios").showShadows, false);
  assert.equal(restorePreferences(raw, "ios").departureAt, null);
  assert.equal(restorePreferences(raw, "ios").maxExtraMinutes, 5);
});

test("map controls detour and chosen time survive a fresh store without retaining position or URLs", async () => {
  const storage = memory();
  let store = createPreferenceStore(storage, "ios");
  await store.load();
  assert.equal(storage.writes.length, 0);
  await store.update({
    mapStyle: "satellite",
    threeD: true,
    showShadows: false,
    departureAt: "2026-10-26T15:00:00Z",
  });
  await store.update({ maxExtraMinutes: 15 });
  store = createPreferenceStore(storage, "ios");
  await store.load();
  assert.deepEqual(store.snapshot(), {
    maxExtraMinutes: 15,
    mapStyle: "satellite",
    threeD: true,
    showShadows: false,
    departureAt: "2026-10-26T15:00:00.000Z",
  });
  const saved = serializePreferences({
    ...store.snapshot(),
    origin: { latitude: 44, longitude: 28 },
    apiUrl: "secret",
  });
  assert.equal(saved.includes("latitude"), false);
  assert.equal(saved.includes("secret"), false);
  await store.update({ departureAt: null });
  assert.equal(JSON.parse(storage.raw).departureAt, null);
  const before = storage.writes.length;
  await store.update({ threeD: true });
  assert.equal(storage.writes.length, before);
});

test("interactions during a slow restore merge with untouched saved preferences", async () => {
  let resolve;
  const storage = memory(
    JSON.stringify({
      maxExtraMinutes: 15,
      mapStyle: "satellite",
      threeD: true,
    }),
  );
  storage.getItem = () => new Promise((r) => (resolve = r));
  const store = createPreferenceStore(storage, "ios");
  const load = store.load(),
    save = store.update({ showShadows: false });
  resolve(storage.raw);
  await load;
  await save;
  assert.equal(store.snapshot().mapStyle, "satellite");
  assert.equal(store.snapshot().maxExtraMinutes, 15);
  assert.equal(store.snapshot().threeD, true);
  assert.equal(store.snapshot().showShadows, false);
  assert.equal(JSON.parse(storage.raw).mapStyle, "satellite");
});

test("native writes serialize and the latest edit wins while a prior save is pending", async () => {
  const storage = memory();
  let release;
  let concurrent = 0,
    maxConcurrent = 0;
  storage.setItem = async (_, value) => {
    concurrent++;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    await new Promise((r) => (release = r));
    storage.raw = value;
    concurrent--;
  };
  const store = createPreferenceStore(storage, "android");
  await store.load();
  const first = store.update({ threeD: true });
  await new Promise((r) => setTimeout(r, 0));
  const second = store.update((p) => ({
    showShadows: !p.showShadows,
    mapStyle: "terrain",
  }));
  release();
  await first;
  await new Promise((r) => setTimeout(r, 0));
  release();
  await second;
  assert.equal(maxConcurrent, 1);
  assert.equal(JSON.parse(storage.raw).threeD, true);
  assert.equal(JSON.parse(storage.raw).showShadows, false);
  assert.equal(JSON.parse(storage.raw).mapStyle, "terrain");
});

test("failed storage writes are reported and the same settings can be retried", async () => {
  const storage = memory();
  let fails = true;
  storage.setItem = async (_, value) => {
    if (fails) throw Error("disk");
    storage.raw = value;
  };
  const store = createPreferenceStore(storage, "ios");
  await store.load();
  await assert.rejects(store.update({ threeD: true }), /disk/);
  fails = false;
  await store.update({ threeD: true });
  assert.equal(JSON.parse(storage.raw).threeD, true);
});
