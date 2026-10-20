import assert from "node:assert/strict";
import test from "node:test";
import { fromManifest, parseTags, roundTime, stem, toManifest, trialProblems, uniqueId } from "../src/labels.ts";

const approach = { id: "corner-01", video: "corner-01.mp4", split: "tune", approach: true,
  first_cue_s: 2.4, first_visible_s: 3.9, clear_s: 6.5, zone: "left", tags: ["left"] };
const empty = { id: "empty-01", video: "empty-01.mp4", split: "test", approach: false,
  first_cue_s: undefined, first_visible_s: null, clear_s: null, zone: "ground", tags: [] };

test("approach labels need every mark in order and an explicit shadow decision", () => {
  assert.deepEqual(trialProblems(approach), []);
  assert.deepEqual(trialProblems(empty), []);
  assert.match(trialProblems({ ...approach, first_cue_s: undefined })[0], /No useful shadow/);
  assert.deepEqual(trialProblems({ ...approach, first_cue_s: null }), []);
  assert.match(trialProblems({ ...approach, first_cue_s: 4 })[0], /shadow start/);
  assert.match(trialProblems({ ...approach, clear_s: 3 })[0], /Gone/);
  assert.equal(trialProblems({ ...approach, first_visible_s: null, clear_s: null }).length, 2);
});

test("export matches the evaluation manifest format", () => {
  const manifest = toManifest([approach, { ...empty, first_visible_s: 1 }, { ...approach, id: "c2", first_cue_s: null }], 0.5);
  assert.equal(manifest.label_tolerance_s, 0.5);
  assert.deepEqual(manifest.trials[0], approach);
  // Empty clips carry no approach times, even stale ones.
  assert.deepEqual(Object.keys(manifest.trials[1]).sort(), ["approach", "id", "split", "tags", "video", "zone"]);
  assert.equal(manifest.trials[2].first_cue_s, null);
  assert.throws(() => toManifest([approach, approach], 0.5), /share the id/);
  assert.throws(() => toManifest([{ ...approach, clear_s: null }], 0.5), /gone/);
  assert.throws(() => toManifest([], 0.5), /at least one/);
  assert.throws(() => toManifest([approach], 9), /tolerance/);
});

test("exported manifests can be loaded again to keep labelling", () => {
  const manifest = toManifest([approach, empty], 0.3);
  const { tolerance, labels } = fromManifest(JSON.parse(JSON.stringify(manifest)));
  assert.equal(tolerance, 0.3);
  assert.deepEqual(labels, [approach, empty]);
  assert.throws(() => fromManifest({}), /no trials/);
});

test("helpers keep ids unique and times tidy", () => {
  assert.equal(stem("corner left.mp4"), "corner left");
  assert.equal(uniqueId("clip", ["clip", "clip-2"]), "clip-3");
  assert.equal(uniqueId("new", ["clip"]), "new");
  assert.deepEqual(parseTags(" left, slow ,left,, cloudy"), ["left", "slow", "cloudy"]);
  assert.equal(roundTime(3.14159), 3.142);
});
