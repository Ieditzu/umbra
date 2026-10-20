import assert from "node:assert/strict";
import test from "node:test";
import { parkingMessage, screenBox } from "../src/parking-types.ts";

test("mirroring moves boxes and warning direction together", () => {
  const box = [0.1, 0.2, 0.2, 0.4];
  assert.deepEqual(screenBox(box, false), box);
  const mirrored = screenBox(box, true);
  assert.ok(Math.abs(mirrored[0] - 0.7) < 1e-8);
  assert.deepEqual(mirrored.slice(1), box.slice(1));
  const observation = { state: "cross_traffic", alerts: [{ side: "left" }], message: "Approaching from left" };
  assert.equal(parkingMessage(observation, false), "Approaching from left");
  assert.equal(parkingMessage(observation, true), "Approaching from right");
  assert.equal(parkingMessage({ state: "obstacle", message: "Object in the exit path" }, true), "Object in the exit path");
});
