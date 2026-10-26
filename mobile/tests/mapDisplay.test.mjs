import assert from "node:assert/strict";
import test from "node:test";
import { nativeMapType } from "../src/domain/mapDisplay.ts";

test("iOS switches between standard maps and satellite flyover without claiming unsupported terrain", () => {
  assert.equal(nativeMapType("map", "ios"), "standard");
  assert.equal(nativeMapType("satellite", "ios"), "hybridFlyover");
  assert.equal(nativeMapType("terrain", "ios"), "standard");
});

test("Android uses its native terrain layer and hybrid satellite map", () => {
  assert.equal(nativeMapType("terrain", "android"), "terrain");
  assert.equal(nativeMapType("satellite", "android"), "hybrid");
  assert.equal(nativeMapType("map", "android"), "standard");
});
