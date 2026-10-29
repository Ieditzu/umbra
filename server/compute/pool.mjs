import { Worker } from "node:worker_threads";
export class ComputeError extends Error {
  constructor(message, status = 503, code = "unavailable") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export class ComputePool {
  constructor(size = 1) {
    this.queue = [];
    this.sequence = 0;
    this.closed = false;
    this.slots = Array.from({ length: size }, () => ({
      ready: false,
      worker: null,
      job: null,
      failures: 0,
    }));
    for (const slot of this.slots) this.spawn(slot);
  }
  get ready() {
    return this.slots.some((s) => s.ready);
  }
  spawn(slot) {
    if (this.closed) return;
    slot.ready = false;
    const worker = new Worker(new URL("./worker.mjs", import.meta.url), {
      execArgv: ["--experimental-strip-types"],
    });
    slot.worker = worker;
    const fail = () => {
      if (slot.worker !== worker) return;
      slot.ready = false;
      slot.worker = null;
      if (slot.job) {
        this.finish(
          slot.job,
          new ComputeError("Procesul de calcul a fost repornit. Reîncearcă."),
        );
        slot.job = null;
      }
      void worker.terminate();
      if (!this.closed && ++slot.failures <= 3)
        setTimeout(() => this.spawn(slot), 500).unref();
    };
    worker.on("error", fail);
    worker.on("exit", fail);
    worker.on("message", (m) => {
      if (slot.worker !== worker) return;
      if (m.type === "fatal") {
        console.error("City data unavailable:", m.message);
        slot.failures = 3;
        fail();
        return;
      }
      if (m.type === "ready") {
        slot.ready = true;
        slot.failures = 0;
        this.drain();
        return;
      }
      if (m.type === "result" && slot.job?.id === m.id) {
        const job = slot.job;
        slot.job = null;
        this.finish(
          job,
          m.error ? new ComputeError(m.error, m.status, m.code) : null,
          m.json,
        );
        this.drain();
      }
    });
  }
  finish(job, error, json) {
    clearTimeout(job.timer);
    clearTimeout(job.hardTimer);
    job.signal.removeEventListener("abort", job.abort);
    if (job.settled) return;
    job.settled = true;
    if (error) job.reject(error);
    else job.resolve(json);
  }
  drain() {
    if (this.closed) return;
    for (const slot of this.slots) {
      if (!slot.ready || slot.job || !this.queue.length) continue;
      const job = this.queue.shift();
      if (job.settled) continue;
      slot.job = job;
      job.slot = slot;
      slot.worker.postMessage({
        type: "run",
        id: job.id,
        kind: job.kind,
        payload: job.payload,
      });
    }
  }
  run(kind, payload, signal) {
    if (this.closed)
      return Promise.reject(new ComputeError("Serverul se oprește."));
    if (this.queue.length >= 24)
      return Promise.reject(
        new ComputeError("Serverul este ocupat. Reîncearcă.", 429, "busy"),
      );
    if (signal.aborted)
      return Promise.reject(
        new ComputeError("Calculul a fost oprit.", 499, "cancelled"),
      );
    return new Promise((resolve, reject) => {
      const job = {
        id: ++this.sequence,
        kind,
        payload,
        signal,
        resolve,
        reject,
        slot: null,
        settled: false,
      };
      const cancel = (error) => {
        this.queue = this.queue.filter((j) => j !== job);
        if (job.slot?.job === job) {
          job.slot.worker.postMessage({ type: "cancel", id: job.id });
          job.hardTimer = setTimeout(() => {
            const slot = job.slot;
            if (slot.job !== job) return;
            const worker = slot.worker;
            slot.worker = null;
            slot.job = null;
            slot.ready = false;
            void worker.terminate();
            this.spawn(slot);
          }, 5000).unref();
        }
        // Keep the hard deadline until the worker acknowledges cancellation.
        clearTimeout(job.timer);
        signal.removeEventListener("abort", job.abort);
        if (!job.settled) {
          job.settled = true;
          reject(error);
        }
      };
      job.abort = () =>
        cancel(new ComputeError("Calculul a fost oprit.", 499, "cancelled"));
      signal.addEventListener("abort", job.abort, { once: true });
      job.timer = setTimeout(
        () =>
          cancel(
            new ComputeError(
              "Calculul a durat prea mult. Apropie harta sau alege un traseu mai scurt.",
              503,
              "timeout",
            ),
          ),
        20000,
      ).unref();
      this.queue.push(job);
      const priority = {
        routes: 0,
        verify: 1,
        inspect: 1,
        buildings: 1,
        shadows: 2,
      };
      this.queue.sort(
        (a, b) => priority[a.kind] - priority[b.kind] || a.id - b.id,
      );
      this.drain();
    });
  }
  async close() {
    this.closed = true;
    for (const job of this.queue)
      this.finish(job, new ComputeError("Serverul se oprește."));
    this.queue = [];
    await Promise.all(
      this.slots.map((slot) => {
        if (slot.job)
          this.finish(slot.job, new ComputeError("Serverul se oprește."));
        const worker = slot.worker;
        slot.worker = null;
        slot.job = null;
        return worker?.terminate();
      }),
    );
  }
}
