import { createServer } from "node:http";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { ComputeError, ComputePool } from "./pool.mjs";
const compress = promisify(gzip);
const kinds = new Map([
  ["/v1/routes/compare", "routes"],
  ["/v1/shadows", "shadows"],
  ["/v1/buildings", "buildings"],
]);
function validate(kind, q) {
  if (!q || Array.isArray(q) || typeof q !== "object")
    throw new ComputeError("Cerere invalidă.", 422, "invalid");
  const fields =
    kind === "routes"
      ? [
          "schema_version",
          "origin",
          "destination",
          "departure_at",
          "departure_timezone",
          "max_extra_minutes",
          "walking_speed_mps",
        ]
      : kind === "shadows"
        ? ["at", "bounds"]
        : ["bounds", "focus"];
  if (Object.keys(q).some((k) => !fields.includes(k)))
    throw new ComputeError("Câmpuri de cerere necunoscute.", 422, "invalid");
  if (
    kind !== "routes" &&
    (!Array.isArray(q.bounds) ||
      q.bounds.length !== 4 ||
      !q.bounds.every(Number.isFinite) ||
      q.bounds[0] >= q.bounds[2] ||
      q.bounds[1] >= q.bounds[3])
  )
    throw new ComputeError("Limite de hartă invalide.", 422, "invalid");
  if (
    kind === "shadows" &&
    (typeof q.at !== "string" || !Number.isFinite(Date.parse(q.at)))
  )
    throw new ComputeError("Ora este invalidă.", 422, "invalid");
  if (
    q.focus &&
    (!Number.isFinite(q.focus.latitude) ||
      !Number.isFinite(q.focus.longitude) ||
      Math.abs(q.focus.latitude) > 85 ||
      Math.abs(q.focus.longitude) > 180)
  )
    throw new ComputeError("Centrul hărții este invalid.", 422, "invalid");
}
export function createComputeServer({ pool = new ComputePool() } = {}) {
  const cache = new Map();
  let cacheBytes = 0;
  const server = createServer(async (req, res) => {
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });
    const reply = async (status, json) => {
      if (controller.signal.aborted || res.destroyed) return;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Vary", "Accept-Encoding");
      let body = Buffer.from(json);
      if (
        body.length > 1024 &&
        /\bgzip\b/.test(req.headers["accept-encoding"] ?? "")
      ) {
        body = await compress(body, { level: 3 });
        res.setHeader("Content-Encoding", "gzip");
      }
      if (res.destroyed) return;
      res.writeHead(status, { "Content-Length": body.length });
      res.end(body);
    };
    try {
      const path = new URL(req.url, "http://localhost").pathname;
      if (path === "/health" && req.method === "GET") {
        await reply(
          pool.ready ? 200 : 503,
          JSON.stringify({
            service: "umbra-compute",
            schema_version: 1,
            ready: pool.ready,
          }),
        );
        return;
      }
      const kind = kinds.get(path);
      if (!kind) {
        await reply(404, JSON.stringify({ detail: "Not found" }));
        return;
      }
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        await reply(405, JSON.stringify({ detail: "Method not allowed" }));
        return;
      }
      if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] ?? ""))
        throw new ComputeError(
          "Content-Type trebuie să fie application/json.",
          415,
          "invalid",
        );
      const body = await new Promise((resolve, reject) => {
        const chunks = [];
        let bytes = 0,
          oversized = false;
        req.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > 16384) {
            if (!oversized)
              reject(
                new ComputeError("Cererea depășește 16 KiB.", 413, "invalid"),
              );
            oversized = true;
            chunks.length = 0;
            return;
          }
          if (!oversized) chunks.push(chunk);
        });
        req.on("end", () => {
          if (!oversized) resolve(Buffer.concat(chunks));
        });
        req.on("error", reject);
        req.on("aborted", () =>
          reject(new ComputeError("Cererea a fost oprită.", 499, "cancelled")),
        );
      });
      let q;
      try {
        q = JSON.parse(body.toString("utf8"));
      } catch {
        throw new ComputeError("JSON invalid.", 422, "invalid");
      }
      validate(kind, q);
      // Only static viewport results are cached; routes/GPS endpoints are never cached.
      const key = kind === "routes" ? null : JSON.stringify([kind, q]);
      let json = key ? cache.get(key) : null;
      if (!json) {
        json = await pool.run(kind, q, controller.signal);
        if (key && Buffer.byteLength(json) <= 8_000_000) {
          while (
            cache.size &&
            (cache.size >= 12 ||
              cacheBytes + Buffer.byteLength(json) > 16_000_000)
          ) {
            const first = cache.keys().next().value;
            cacheBytes -= Buffer.byteLength(cache.get(first));
            cache.delete(first);
          }
          cache.set(key, json);
          cacheBytes += Buffer.byteLength(json);
        }
      }
      await reply(200, json);
    } catch (error) {
      if (controller.signal.aborted) return;
      await reply(
        error.status ?? 503,
        JSON.stringify({
          detail:
            error instanceof ComputeError
              ? error.message
              : "Serviciul de calcul nu este disponibil.",
          code: error.code ?? "unavailable",
        }),
      );
    }
  });
  server.requestTimeout = 25000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 60000;
  return {
    server,
    pool,
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await pool.close();
    },
  };
}
