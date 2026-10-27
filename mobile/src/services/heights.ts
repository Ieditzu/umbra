import Constants from "expo-constants";
import { resolveCalculationUrl } from "../domain/server";
import { normalizeApiUrl } from "../domain/settings";
import type {
  Measurement,
  MeasurementStatus,
  Submission,
} from "../domain/measurements";

// Client for the shared heights database (server/heights/routes.mjs).
// By default it is the same PC server that calculates shadows; EXPO_PUBLIC_HEIGHTS_URL
// can point at a separately hosted copy.
const base = () =>
  process.env.EXPO_PUBLIC_HEIGHTS_URL?.trim()
    ? normalizeApiUrl(process.env.EXPO_PUBLIC_HEIGHTS_URL)
    : resolveCalculationUrl(
        process.env.EXPO_PUBLIC_API_URL,
        Constants.expoConfig?.hostUri,
        __DEV__,
      );
export class SharedError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
  /** Client errors mean the server refused this measurement; retrying will not help. */
  get permanent() {
    return this.status >= 400 && this.status < 500 && this.status !== 429;
  }
}
async function call(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
  contributor?: string,
): Promise<unknown> {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 15000);
  try {
    const url = base();
    if (!url)
      throw new SharedError("Serverul nu este configurat.", 0, "offline");
    const response = await fetch(`${url}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(contributor ? { "X-Umbra-Contributor": contributor } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (text.length > 4_000_000)
      throw new SharedError("Răspuns prea mare.", 0, "offline");
    let value: { detail?: unknown; code?: unknown } | null = null;
    try {
      value = JSON.parse(text);
    } catch {
      /* Non-JSON errors (proxy pages) are handled below. */
    }
    if (!response.ok)
      throw new SharedError(
        typeof value?.detail === "string"
          ? value.detail
          : "Serverul a refuzat cererea.",
        response.status,
        typeof value?.code === "string" ? value.code : "error",
      );
    return value;
  } catch (error) {
    if (error instanceof SharedError) throw error;
    throw new SharedError("Serverul nu răspunde.", 0, "offline");
  } finally {
    clearTimeout(timer);
  }
}
/** Only the fields the server evaluates; observer initials and local state stay on the phone. */
export function toSubmission(m: Measurement): Submission {
  return {
    id: m.id,
    osm_building: m.osm_building,
    method: m.method,
    corner: m.corner,
    length_m: m.length_m,
    lateral_m: m.lateral_m,
    gps_accuracy_m: m.gps_accuracy_m,
    drone: m.drone,
    measured_at: m.measured_at,
    checklist: m.checklist,
    app_version: m.app_version,
    engine_version: m.engine_version,
  };
}
export async function uploadMeasurement(m: Measurement, contributor: string) {
  const value = (await call("POST", "/v1/measurements", {
    measurement: toSubmission(m),
    contributor,
  })) as { measurement?: { status?: MeasurementStatus } } | null;
  const status = value?.measurement?.status;
  return ["accepted", "rejected", "needs_review"].includes(status ?? "")
    ? (status as MeasurementStatus)
    : undefined;
}
export async function deleteShared(id: string | null, contributor: string) {
  try {
    await call(
      "DELETE",
      id ? `/v1/measurements/${id}` : "/v1/measurements",
      undefined,
      contributor,
    );
  } catch (error) {
    // Already gone on the server counts as deleted.
    if (error instanceof SharedError && error.status === 404) return;
    throw error;
  }
}
