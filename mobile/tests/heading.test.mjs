import assert from "node:assert/strict";
import test from "node:test";
import {
  compassDegrees,
  smoothHeading,
  freshHeading,
  headingCone,
} from "../src/domain/heading.ts";
import { headingFeatures } from "../src/domain/localMap.ts";
import { distanceBetween } from "../src/domain/routes.ts";

test("device orientation accepts true north and calibrated magnetic fallback without GPS course", () => {
  assert.equal(
    compassDegrees({ trueHeading: 0, magHeading: 20, accuracy: 3 }),
    0,
  );
  assert.equal(
    compassDegrees({ trueHeading: -1, magHeading: 90, accuracy: 2 }),
    90,
  );
  assert.equal(
    compassDegrees({ trueHeading: 360, magHeading: 90, accuracy: 2 }),
    0,
  );
  assert.equal(
    compassDegrees({ trueHeading: 42, magHeading: 40, accuracy: 0 }),
    null,
  );
  assert.equal(
    compassDegrees({ trueHeading: NaN, magHeading: -1, accuracy: 2 }),
    null,
  );
  assert.equal(
    compassDegrees({ trueHeading: 999, magHeading: Infinity, accuracy: 2 }),
    null,
  );
});

test("smoothing crosses north along the short arc and stale readings expire", () => {
  assert.ok(smoothHeading(359, 1) > 359 && smoothHeading(359, 1) < 360);
  assert.ok(smoothHeading(1, 359) < 1);
  assert.equal(freshHeading({ degrees: 10, timestamp: 1000 }, 11000), true);
  assert.equal(freshHeading({ degrees: 10, timestamp: 1000 }, 11001), false);
  assert.equal(freshHeading({ degrees: NaN, timestamp: 1000 }, 1000), false);
  assert.equal(freshHeading({ degrees: 10, timestamp: 10000 }, 1000), false);
  assert.equal(freshHeading(null, 1000), false);
});

test("direction sectors point north east south and west in geographic space", () => {
  const origin = { latitude: 44.1733, longitude: 28.6383 };
  for (const degrees of [0, 90, 180, 270, 359]) {
    const ring = headingCone(origin, degrees);
    assert.deepEqual(ring[0], ring.at(-1));
    const tip = ring[9];
    assert.ok(Math.abs(distanceBetween(origin, tip) - 35) < 0.1);
    if (degrees === 0) assert.ok(tip.latitude > origin.latitude);
    if (degrees === 90) assert.ok(tip.longitude > origin.longitude);
    if (degrees === 180) assert.ok(tip.latitude < origin.latitude);
    if (degrees === 270) assert.ok(tip.longitude < origin.longitude);
  }
  assert.equal(headingFeatures(origin, null).features.length, 0);
  assert.equal(
    headingFeatures(null, { degrees: 0, timestamp: 1 }).features.length,
    0,
  );
  assert.equal(
    headingFeatures(origin, { degrees: 90, timestamp: 1 }).features[0].geometry
      .type,
    "Polygon",
  );
});
