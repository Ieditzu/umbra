import assert from "node:assert/strict";
import test from "node:test";
import { distanceLabel, leadLabel, nearestRoadUser, parkingMessage, screenBox } from "../src/parking-types.ts";

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

test("warning evidence does not turn late or unreviewed cues into early warnings", () => {
  assert.equal(leadLabel(null), "Not reviewed");
  assert.equal(leadLabel(1.234), "1.23 s before visibility");
  assert.equal(leadLabel(-0.45), "0.45 s after visibility");
  assert.equal(leadLabel(0), "At first visibility");
});

test("distances are shown as ranges and warnings name the possibly closest object", () => {
  const range = { bound: "range", low_m: 2.34, estimate_m: 2.8, high_m: 3.41, method: "size" };
  const cut = { bound: "at_most", low_m: null, estimate_m: null, high_m: 12.6, method: "size" };
  assert.equal(distanceLabel(range), "2.3–3.4 m");
  assert.equal(distanceLabel(cut), "< 13 m");
  assert.equal(distanceLabel(null), null);
  const detections = [
    { id: 1, label: "car", distance: { ...range, low_m: 6, high_m: 9 } },
    { id: 2, label: "person", distance: range },
    { id: 3, label: "bicycle", distance: null },
  ];
  assert.equal(nearestRoadUser(detections).id, 2);
  assert.equal(nearestRoadUser([{ id: 4, label: "truck", distance: cut }, ...detections]).id, 4);
  const observation = { state: "cross_traffic", message: "", detections, alerts: [{ id: 1, side: "left" }] };
  assert.equal(parkingMessage(observation, false), "Approaching from left · car 6.0–9.0 m");
  assert.equal(parkingMessage({ ...observation, alerts: [{ id: 3, side: "left" }] }, false), "Approaching from left");
});
