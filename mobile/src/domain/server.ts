import { normalizeApiUrl } from "./settings.ts";
/** Same origin as Metro, including Expo tunnels; no user-entered server address. */
export function resolveCalculationUrl(
  explicit: string | undefined,
  host: string | undefined,
  development: boolean,
): string {
  if (explicit?.trim()) return normalizeApiUrl(explicit);
  if (!development || !host) return "";
  const address = host.replace(/^exps?:\/\//, "http://");
  const url = new URL(address.includes("://") ? address : `http://${address}`);
  if (url.hostname.endsWith(".exp.direct")) url.protocol = "https:";
  url.pathname = "/umbra-api";
  url.search = "";
  url.hash = "";
  return normalizeApiUrl(url.toString());
}
