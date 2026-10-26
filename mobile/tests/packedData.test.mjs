import assert from "node:assert/strict";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { unpackDataset } from "../src/engine/packedData.ts";
import { task } from "../src/engine/task.ts";

function pack(raw) {
  const bytes = Buffer.from(JSON.stringify(raw));
  return {
    format: "umbra-gzip-json-v1",
    raw_bytes: bytes.length,
    payload: gzipSync(bytes).toString("base64"),
  };
}
const work = () => task(new AbortController().signal);

test("bundled gzip decodes losslessly across chunks and UTF-8 boundaries", async () => {
  let seed = 17;
  const values = Array.from({ length: 12000 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return `${seed.toString(36)} · Constanța 🏙`;
  });
  const raw = {
    metadata: { attribution: "© OpenStreetMap contributors" },
    values,
  };
  const packed = pack(raw);
  assert.ok(packed.payload.length > 16384);
  assert.deepEqual(await unpackDataset(packed, work()), raw);
});

test("invalid, oversized and cancelled local packages fail explicitly", async () => {
  const packed = pack({ value: "test" });
  await assert.rejects(
    unpackDataset({ ...packed, raw_bytes: 1 }, work()),
    /dimensiunea/,
  );
  await assert.rejects(
    unpackDataset({ ...packed, raw_bytes: 100000001 }, work()),
    /valid/,
  );
  await assert.rejects(
    unpackDataset({ ...packed, payload: "!!!!" }, work()),
    /valid/,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(unpackDataset(packed, task(controller.signal)), /oprit/);
});
