import assert from "node:assert/strict";
import test from "node:test";
import { ACTIVE_ANALYSIS_KEY, elapsedAnalysisTime, monitorAnalysis, readActiveAnalysis, waitForPoll } from "../src/analysis-job.ts";

const active = { jobId: "job-1", sceneId: "scene-1", trialId: "trial-1", title: "Evening walk", startedAt: 1000 };
const job = (status, progress = 0, extra = {}) => ({ id: "job-1", kind: "analysis", status, progress, message: status, result: null, error: null, ...extra });
const completed = job("succeeded", 1, { result: { analysis_id: "result-1" } });

test("restores only valid saved analysis metadata", () => {
  assert.deepEqual(readActiveAnalysis({ getItem: (key) => key === ACTIVE_ANALYSIS_KEY ? JSON.stringify(active) : null }), active);
  for (const text of [null, "{", "null", "[]", JSON.stringify({ ...active, jobId: "" }), JSON.stringify({ ...active, startedAt: "yesterday" }), JSON.stringify({ ...active, startedAt: -1 })]) {
    assert.equal(readActiveAnalysis({ getItem: () => text }), null);
  }
  assert.equal(readActiveAnalysis({ getItem: () => { throw new Error("Storage blocked"); } }), null);
});

test("elapsed time is readable and does not go negative", () => {
  assert.equal(elapsedAnalysisTime(1000, 3000), "2s");
  assert.equal(elapsedAnalysisTime(1000, 76000), "1m 15s");
  assert.equal(elapsedAnalysisTime(3000, 1000), "0s");
});

test("reports real queued and running progress then opens the saved result", async () => {
  const jobs = [job("queued"), job("running", 0.56, { message: "Separating foreground" }), completed];
  const states = [], waits = [];
  const result = await monitorAnalysis({
    jobId: active.jobId, signal: new AbortController().signal,
    getJob: async (id) => { assert.equal(id, active.jobId); return jobs.shift(); },
    finish: async (value) => value.result.analysis_id,
    onProgress: (value) => states.push(value), wait: async (ms) => { waits.push(ms); }
  });
  assert.equal(result, "result-1");
  assert.deepEqual(states.map((state) => state.status), ["queued", "running", "opening"]);
  assert.equal(states[1].progress, 0.56);
  assert.equal(states[1].message, "Separating foreground");
  assert.deepEqual(waits, [900, 900]);
});

test("reconnects after network and server errors without submitting another analysis", async () => {
  let reads = 0;
  const states = [];
  const result = await monitorAnalysis({
    jobId: active.jobId, signal: new AbortController().signal,
    getJob: async () => {
      reads++;
      if (reads === 1) throw new TypeError("Failed to fetch");
      if (reads === 2) throw Object.assign(new Error("Unavailable"), { status: 503 });
      return completed;
    },
    finish: async () => "ready", onProgress: (state) => states.push(state), wait: async () => {}
  });
  assert.equal(result, "ready");
  assert.equal(reads, 3);
  assert.deepEqual(states.map((state) => state.status), ["reconnecting", "reconnecting", "opening"]);
});

test("a temporary failure while loading the finished result is retried too", async () => {
  let attempts = 0;
  assert.equal(await monitorAnalysis({
    jobId: active.jobId, signal: new AbortController().signal, getJob: async () => completed,
    finish: async () => { if (++attempts === 1) throw new TypeError("Connection lost"); return "ready"; },
    onProgress: () => {}, wait: async () => {}
  }), "ready");
  assert.equal(attempts, 2);
});

test("slow jobs are not falsely failed after the old 180-poll limit", async () => {
  let attempts = 0;
  assert.equal(await monitorAnalysis({
    jobId: active.jobId, signal: new AbortController().signal,
    getJob: async () => ++attempts <= 200 ? job("running", 0.93) : completed,
    finish: async () => "ready", onProgress: () => {}, wait: async () => {}
  }), "ready");
  assert.equal(attempts, 201);
});

test("missing jobs and malformed completed results fail clearly instead of looping", async () => {
  for (const getJob of [
    async () => { throw Object.assign(new Error("Job not found"), { status: 404 }); },
    async () => job("succeeded", 1)
  ]) {
    await assert.rejects(monitorAnalysis({
      jobId: active.jobId, signal: new AbortController().signal, getJob,
      finish: async () => assert.fail("No valid saved result"), onProgress: () => {},
      wait: async () => assert.fail("Permanent errors must not retry")
    }), /not found|no saved result/);
  }
});

test("job failures display the useful error without a traceback", async () => {
  await assert.rejects(monitorAnalysis({
    jobId: active.jobId, signal: new AbortController().signal,
    getJob: async () => job("failed", 0.4, { error: "Video cannot be decoded\nTraceback: internal details" }),
    finish: async () => assert.fail(), onProgress: () => {}, wait: async () => assert.fail()
  }), { message: "Video cannot be decoded" });
});

test("unmount or dismiss aborts monitoring without affecting the server job", async () => {
  const controller = new AbortController();
  let reads = 0, finishes = 0;
  await assert.rejects(monitorAnalysis({
    jobId: active.jobId, signal: controller.signal,
    getJob: async () => { reads++; return job("running", 0.4); },
    finish: async () => { finishes++; }, onProgress: () => {}, wait: async () => controller.abort()
  }), { name: "AbortError" });
  assert.equal(reads, 1);
  assert.equal(finishes, 0);
});

test("the polling timer aborts promptly instead of waiting for its timeout", async () => {
  const controller = new AbortController();
  const waiting = waitForPoll(60000, controller.signal);
  controller.abort();
  await assert.rejects(waiting, { name: "AbortError" });
  await assert.rejects(waitForPoll(60000, controller.signal), { name: "AbortError" });
});
