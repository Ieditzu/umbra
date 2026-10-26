import assert from "node:assert/strict";
import test from "node:test";
import { task } from "../src/engine/task.ts";

test("changing the wall clock does not expire a local computation budget", () => {
  const previous = Date.now;
  let wall = previous();
  Date.now = () => wall;
  try {
    const work = task(new AbortController().signal, 1000);
    wall += 3600000;
    assert.doesNotThrow(() => work.check());
    wall -= 7200000;
    assert.doesNotThrow(() => work.check());
  } finally { Date.now = previous; }
});
