import type { Job } from "./types";

export const ACTIVE_ANALYSIS_KEY = "umbra:active-analysis";

export interface ActiveAnalysis {
  jobId: string;
  sceneId: string;
  trialId: string;
  title: string;
  startedAt: number;
}

export interface AnalysisProgress {
  status: "queued" | "running" | "reconnecting" | "opening";
  progress: number;
  message: string;
}

export function readActiveAnalysis(storage: Pick<Storage, "getItem">): ActiveAnalysis | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(ACTIVE_ANALYSIS_KEY) ?? "null");
    if (!value || typeof value !== "object") return null;
    const item = value as Partial<ActiveAnalysis>;
    if (![item.jobId, item.sceneId, item.trialId, item.title].every((field) => typeof field === "string" && field.length > 0)) return null;
    if (typeof item.startedAt !== "number" || !Number.isFinite(item.startedAt) || item.startedAt <= 0) return null;
    return item as ActiveAnalysis;
  } catch {
    return null;
  }
}

export function elapsedAnalysisTime(startedAt: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function waitForPoll(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function retryable(error: unknown): boolean {
  const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 0;
  return !status || status >= 500 || status === 408 || status === 429;
}

export async function monitorAnalysis<T>(options: {
  jobId: string;
  signal: AbortSignal;
  getJob: (id: string, signal: AbortSignal) => Promise<Job>;
  finish: (job: Job, signal: AbortSignal) => Promise<T>;
  onProgress: (progress: AnalysisProgress) => void;
  wait?: typeof waitForPoll;
}): Promise<T> {
  const { jobId, signal, getJob, finish, onProgress, wait = waitForPoll } = options;
  let progress = 0;
  while (!signal.aborted) {
    let next: Job;
    try {
      next = await getJob(jobId, signal);
      if (signal.aborted) break;
      if (next.status === "succeeded") {
        if (typeof next.result?.analysis_id !== "string") {
          throw Object.assign(new Error("The completed job has no saved result."), { status: 422 });
        }
        onProgress({ status: "opening", progress: 1, message: "Opening result" });
        return await finish(next, signal);
      }
    } catch (error) {
      if (signal.aborted) break;
      if (!retryable(error)) throw error;
      onProgress({ status: "reconnecting", progress, message: "Reconnecting to server…" });
      await wait(2500, signal);
      continue;
    }
    if (next.status === "failed") {
      throw new Error(next.error?.split("\n")[0] || "Analysis failed. Check the server log and try again.");
    }
    progress = Math.max(0, Math.min(1, next.progress));
    onProgress({ status: next.status, progress, message: next.message || (next.status === "queued" ? "Queued" : "Analyzing footage") });
    await wait(900, signal);
  }
  throw new DOMException("Aborted", "AbortError");
}
