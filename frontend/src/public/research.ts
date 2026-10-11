/** The original experiment service runs separately on the local machine. */
export function localResearchURL(
  location: Pick<Location, "hostname" | "href">,
): string | null {
  if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(location.hostname))
    return null;
  const url = new URL("/research.html", location.href);
  url.protocol = "http:";
  if (["[::1]", "::1"].includes(location.hostname)) url.hostname = "127.0.0.1";
  url.port = "8002";
  return url.href;
}
