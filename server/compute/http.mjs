import { createServer } from "node:http";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { ComputeError, ComputePool } from "./pool.mjs";
import { IdleCache } from "./idle-cache.mjs";
import { RegionTiles, regionalSelection } from "./regions.mjs";
import { solarPower } from "./solar-power.mjs";
import { heightsRoute, RateLimiter } from "../heights/routes.mjs";
import { createWeatherService, applyWeather } from "./weather.mjs";
const compress = promisify(gzip);
const kinds = new Map([
  ["/v1/routes/compare", "routes"],
  ["/v1/shadows", "shadows"],
  ["/v1/buildings", "buildings"],
  ["/v1/buildings/inspect", "inspect"],
]);
const BUILDING_ID = /^(way|relation)\/\d{1,15}$/;
/** Confirmed on-phone shadow measurements, sent only as building id + height range. */
function validateMeasured(list) {
  if (list === undefined) return;
  if (
    !Array.isArray(list) ||
    list.length > 200 ||
    new Set(list.map((m) => m?.id)).size !== list.length ||
    !list.every(
      (m) =>
        m &&
        typeof m === "object" &&
        Object.keys(m).every((k) => ["id", "low_m", "high_m"].includes(k)) &&
        typeof m.id === "string" &&
        BUILDING_ID.test(m.id) &&
        Number.isFinite(m.low_m) &&
        Number.isFinite(m.high_m) &&
        m.low_m > 0 &&
        m.low_m <= m.high_m &&
        m.high_m <= 1000,
    )
  )
    throw new ComputeError("Înălțimi măsurate invalide.", 422, "invalid");
}
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
          "measured_heights",
        ]
      : kind === "shadows"
        ? ["at", "bounds", "focus", "include_estimates", "measured_heights"]
        : kind === "inspect"
          ? ["point", "at", "measured_heights"]
          : ["bounds", "focus", "measured_heights"];
  if (Object.keys(q).some((k) => !fields.includes(k)))
    throw new ComputeError("Câmpuri de cerere necunoscute.", 422, "invalid");
  validateMeasured(q.measured_heights);
  if (kind === "inspect") {
    if (
      !q.point ||
      !Number.isFinite(q.point.latitude) ||
      !Number.isFinite(q.point.longitude) ||
      Math.abs(q.point.latitude) > 85 ||
      Math.abs(q.point.longitude) > 180 ||
      typeof q.at !== "string" ||
      !Number.isFinite(Date.parse(q.at))
    )
      throw new ComputeError("Punct de măsurare invalid.", 422, "invalid");
    return;
  }
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
    q.include_estimates !== undefined &&
    typeof q.include_estimates !== "boolean"
  )
    throw new ComputeError("Opțiune de umbre invalidă.", 422, "invalid");
  if (
    q.focus &&
    (!Number.isFinite(q.focus.latitude) ||
      !Number.isFinite(q.focus.longitude) ||
      Math.abs(q.focus.latitude) > 85 ||
      Math.abs(q.focus.longitude) > 180)
  )
    throw new ComputeError("Centrul hărții este invalid.", 422, "invalid");
}
/** Shared confirmed heights first, then the phone's own confirmed measurements on top. */
function mergeHeights(shared, own) {
  if (!shared?.length) return own;
  const merged = new Map(shared.map((h) => [h.id, h]));
  for (const h of own ?? []) merged.set(h.id, h);
  return [...merged.values()];
}
export function createComputeServer({
  pool = new ComputePool(),
  regions = new RegionTiles(),
  heights = null,
  weather = createWeatherService(),
  solar = solarPower,
  limiter = new RateLimiter({
    post_contributor: 30,
    post_ip: 60,
    solar_ip: 120,
    delete_ip: 120,
  }),
} = {}) {
  let cacheBytes = 0;
  const cache = new IdleCache(300000, Date.now, (json) => { cacheBytes -= Buffer.byteLength(json); });
  const cleanup = setInterval(() => cache.sweep(), 60000);
  cleanup.unref();
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
    const readJson = async () => {
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
      try {
        return JSON.parse(body.toString("utf8"));
      } catch {
        throw new ComputeError("JSON invalid.", 422, "invalid");
      }
    };
    try {
      const url = new URL(req.url, "http://localhost"),
        path = url.pathname;
      if (path === "/health" && req.method === "GET") {
        await reply(
          pool.ready ? 200 : 503,
          JSON.stringify({
            service: "umbra-compute",
            schema_version: 1,
            capabilities: [
              "regional_buildings",
              "estimated_shadows",
              "sun_position",
              "shadow_measurement",
              "city_catalog",
              ...(heights ? ["shared_heights"] : []),
            ],
            ready: pool.ready,
          }),
        );
        return;
      }
      if (
        heights &&
        (await heightsRoute({
          req,
          path,
          url,
          store: heights,
          pool,
          limiter,
          readJson,
          reply,
          signal: controller.signal,
        }))
      )
        return;
      if (path === "/v1/solar-power" && req.method === "POST") {
        const peer = req.socket.remoteAddress ?? "unknown";
        const forwarded = req.headers["x-forwarded-for"];
        const ip = /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(peer) && typeof forwarded === "string" && forwarded ? forwarded.split(",")[0].trim() : peer;
        if (!limiter.allow("solar_ip", ip)) throw new ComputeError("Prea multe estimări. Încearcă mai târziu.", 429, "rate_limited");
        const q = await readJson();
        if (!q || Array.isArray(q) || typeof q !== "object" || Object.keys(q).some((k) => !["point", "date", "watts", "tilt", "azimuth"].includes(k)))
          throw new ComputeError("Cerere invalidă.", 422, "invalid");
        await reply(200, JSON.stringify(await solar(q)));
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
      const q = await readJson();
      validate(kind, q);
      // Only static viewport results are cached; routes/GPS endpoints are never cached.
      const key =
        kind === "routes" || kind === "inspect"
          ? null
          : JSON.stringify([kind, q, heights?.revision ?? 0]);
      let json = key ? cache.get(key) : null;
      if (!json) {
        // Measuring uses stable OSM ids, so it always reads the bundled city snapshot.
        const selection =
          kind === "routes" || kind === "inspect" ? null : regionalSelection(q, undefined, kind === "buildings");
        const region = selection ? await regions.load(selection) : undefined;
        if (controller.signal.aborted) return;
        const measured = mergeHeights(heights?.confirmed(), q.measured_heights);
        const job = measured?.length ? { ...q, measured_heights: measured } : q;
        json = await pool.run(
          kind,
          region ? { ...job, __region: region } : job,
          controller.signal,
        );
        if (kind === "routes") {
          const value = JSON.parse(json);
          if (Array.isArray(value.routes) && Array.isArray(value.attribution)) {
            const forecast = await weather(q);
            json = JSON.stringify(applyWeather(value, q, forecast));
          }
        }
        if (kind === "inspect" && heights) {
          // Shared status for the building card; never cached because it changes per upload.
          const value = JSON.parse(json);
          if (value.building)
            value.building.shared = heights.summary(value.building.id);
          json = JSON.stringify(value);
        }
        if (key && Buffer.byteLength(json) <= 8_000_000) {
          while (
            cache.size &&
            (cache.size >= 12 ||
              cacheBytes + Buffer.byteLength(json) > 16_000_000)
          ) {
            const first = cache.keys().next().value;
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
      clearInterval(cleanup);
      cache.clear();
      regions.close?.();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await pool.close();
    },
  };
}
