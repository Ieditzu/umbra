import assert from "node:assert/strict";
import test from "node:test";
import { calibrationLabels, calibrationPattern, labelName } from "../src/periscope-types.ts";

test("calibration ends with an independent background drift measurement", () => {
  for (const side of [2, 3, 4]) {
    const labels = calibrationLabels(side);
    assert.equal(labels.length, side ** 2 + 3);
    assert.equal(labels[0], "dark");
    assert.equal(labels.at(-1), "dark_check");
    assert.equal(new Set(labels).size, labels.length);
    assert.deepEqual(calibrationPattern("dark", side), Array(side ** 2).fill(0));
    assert.deepEqual(calibrationPattern("white", side), Array(side ** 2).fill(1));
    for (let index = 0; index < side ** 2; index++) {
      const pattern = calibrationPattern(`cell-${index}`, side);
      assert.equal(pattern.reduce((a, b) => a + b, 0), 1);
      assert.equal(pattern[index], 1);
    }
  }
  assert.equal(labelName("cell-5", 4), "Cell 6 · row 2 column 2");
});
