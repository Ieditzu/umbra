import test from "node:test";
import assert from "node:assert/strict";
import { solarSavings } from "../src/domain/solarSavings.ts";

test("savings use the entered price and handle Romanian decimal commas", () => {
  assert.equal(solarSavings(2, "1,25"), 2.5);
  assert.equal(solarSavings(2, "0"), 0);
  for (const price of ["", "-1", "101", "abc"]) assert.equal(solarSavings(2, price), null);
  assert.equal(solarSavings(-1, "1"), null);
});
