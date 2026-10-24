export type Settings = { apiUrl: string; maxExtraMinutes: number };
export const DEFAULT_SETTINGS: Settings = { apiUrl: "", maxExtraMinutes: 5 };

export function normalizeApiUrl(value: string): string {
  if (!value.trim()) return "";
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(
      "Introdu o adresă completă, de exemplu https://api.exemplu.ro.",
    );
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Folosește HTTP/HTTPS fără parolă, query sau fragment în adresă.",
    );
  const octets = url.hostname.split(".");
  const ipv4 =
    octets.length === 4 &&
    octets.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
  const first = Number(octets[0]),
    second = Number(octets[1]);
  const privateHost =
    url.hostname === "localhost" ||
    url.hostname === "[::1]" ||
    (ipv4 &&
      (first === 127 ||
        first === 10 ||
        (first === 192 && second === 168) ||
        (first === 172 && second >= 16 && second <= 31)));
  if (url.protocol === "http:" && !privateHost)
    throw new Error(
      "Folosește HTTPS pentru serverele publice. HTTP este permis doar pentru dezvoltare în rețeaua locală.",
    );
  return url.toString().replace(/\/$/, "");
}

export function restoreSettings(raw: string | null): Settings {
  try {
    const data = JSON.parse(raw ?? "null");
    if (!data || typeof data.apiUrl !== "string")
      return { ...DEFAULT_SETTINGS };
    return {
      apiUrl: normalizeApiUrl(data.apiUrl),
      maxExtraMinutes: [0, 5, 10, 15].includes(data.maxExtraMinutes)
        ? data.maxExtraMinutes
        : 5,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
