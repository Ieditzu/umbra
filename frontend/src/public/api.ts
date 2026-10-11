export type User = {
  id: string;
  email: string;
  verified: boolean;
  credits: number;
  reserved: number;
  available: number;
  csrf_token: string;
};
export type Config = {
  billing_enabled: boolean;
  pack_credits: number;
  pack_amount: number;
  currency: string;
  starter_credits: number;
  max_upload_bytes: number;
  retention_days: number;
};
export type Analysis = {
  id: string;
  name: string;
  status: "queued" | "running" | "succeeded" | "failed";
  progress: number;
  message: string;
  state?: string;
  lead_time_s?: number | null;
  created_at: string;
  expires_at: string;
  artifacts_expired?: boolean;
  request?: Record<string, unknown>;
  result?: Result | null;
};
export type Result = {
  state: string;
  confidence: number;
  lead_time_s?: number | null;
  shadow_onset_s?: number | null;
  los_onset_s?: number | null;
  reasons: string[];
  timeline?: {
    timestamp_s: number;
    presence_probability: number;
    los_probability: number;
  }[];
  visualization?: { available: boolean };
  visualizations?: { hidden_path_available: boolean };
  evidence?: { limitation: string };
};
export type Media = {
  id: string;
  name: string;
  role: string;
  expires_at: string;
  metadata: { duration_s: number; width: number; height: number };
};
export class APIError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export const base = "/api/v1";
let csrf = "";
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  if (
    init.method &&
    !["GET", "HEAD"].includes(init.method) &&
    !path.startsWith("/auth/login") &&
    !path.startsWith("/auth/signup") &&
    !path.startsWith("/auth/verify") &&
    !path.startsWith("/auth/forgot") &&
    !path.startsWith("/auth/reset")
  ) {
    if (!csrf) await api<User>("/me");
    headers.set("X-CSRF-Token", csrf);
  }
  const response = await fetch(base + path, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new APIError(
      payload.error?.message ?? `Request failed (${response.status})`,
      response.status,
    );
  if (path === "/me") csrf = payload.csrf_token;
  if (
    path === "/auth/logout" ||
    path === "/auth/login" ||
    path === "/auth/signup"
  )
    csrf = "";
  return payload as T;
}
export const date = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
export const stateName = (state?: string) =>
  ({
    no_coverage: "No coverage",
    no_reliable_signal: "No reliable signal",
    possible_motion: "Possible shadow motion",
    strong_motion: "Strong shadow motion",
    early_warning: "Early warning",
    entered_view: "Entered view",
  })[state ?? ""] ??
  state?.replaceAll("_", " ") ??
  "—";
