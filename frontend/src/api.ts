export const API = import.meta.env.VITE_API_URL ?? "/api/v1";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API}${path}`, { ...init, headers });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const payload = (await response.json()) as { detail?: string | { loc?: (string | number)[]; msg?: string }[] };
      if (typeof payload.detail === "string") message = payload.detail;
      else if (Array.isArray(payload.detail)) {
        message = payload.detail.map((item) => `${item.loc?.slice(1).join(".") ?? "Input"}: ${item.msg ?? "Invalid value"}`).join("; ");
      }
    } catch {
      // Keep the status-based fallback.
    }
    throw new ApiError(message, response.status);
  }
  return (await response.json()) as T;
}
