import test from "node:test";
import assert from "node:assert/strict";
import { IdleCache } from "./idle-cache.mjs";

test("shared entries survive another client's use and expire only after inactivity", () => {
  let time = 0;
  const removed = [];
  const cache = new IdleCache(100, () => time, (value) => removed.push(value));
  cache.set("shared", "shared data");
  cache.set("unused", "unused data");
  time = 80;
  assert.equal(cache.get("shared"), "shared data");
  time = 110;
  cache.sweep();
  assert.deepEqual(removed, ["unused data"]);
  assert.equal(cache.has("shared"), true);
  time = 180;
  cache.sweep();
  assert.equal(cache.size, 0);
  assert.deepEqual(removed, ["unused data", "shared data"]);
});

test("removing a cached value never cancels an in-flight user and counts deletion once", async () => {
  let finish;
  const active = new Promise((resolve) => { finish = resolve; });
  const removed = [];
  const cache = new IdleCache(1, () => 5, (value) => removed.push(value));
  cache.set("area", active);
  cache.delete("area");
  cache.delete("area");
  finish("loaded");
  assert.equal(await active, "loaded");
  assert.deepEqual(removed, [active]);
});


test("replacement and LRU reads keep size accounting accurate", () => {
  let bytes = 0;
  const cache = new IdleCache(100, () => 0, (value) => { bytes -= value.length; });
  cache.set("a", "aaa"); bytes += 3;
  cache.set("b", "bb"); bytes += 2;
  assert.equal(cache.get("a"), "aaa");
  assert.deepEqual([...cache.keys()], ["b", "a"]);
  assert.equal(bytes, 5);
  cache.set("a", "x"); bytes += 1;
  assert.equal(bytes, 3);
  cache.clear();
  assert.equal(bytes, 0);
});
