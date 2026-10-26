import assert from "node:assert/strict";
import test from "node:test";
import { nativeMapType } from "../src/domain/mapDisplay.ts";

test("iOS switches between standard maps and satellite flyover without claiming unsupported terrain", () => {
  assert.equal(nativeMapType("map", true, "ios"), "standard");
  assert.equal(nativeMapType("satellite", false, "ios"), "hybrid");
  assert.equal(nativeMapType("satellite", true, "ios"), "hybridFlyover");
  assert.equal(nativeMapType("terrain", false, "ios"), "standard");
});

test("Android uses its native terrain layer and hybrid satellite map", () => {
  assert.equal(nativeMapType("terrain", false, "android"), "terrain");
  assert.equal(nativeMapType("satellite", true, "android"), "hybrid");
  assert.equal(nativeMapType("map", false, "android"), "standard");
});
