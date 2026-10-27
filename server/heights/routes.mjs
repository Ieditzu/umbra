import { ComputeError } from "../compute/pool.mjs";
import {
  BUILDING_ID,
  evaluateSubmission,
  isSubmission,
  MEASUREMENT_ID,
} from "../../mobile/src/domain/measurements.ts";

// Shared heights API (docs/shadow-heights.md §9):
//   GET    /v1/heights?since=…          changed confirmed heights (full file without since)
//   POST   /v1/measurements             store one measurement (opt-in upload)
//   DELETE /v1/measurements/{id}        owner deletes one measurement
//   DELETE /v1/measurements             owner deletes all of theirs
//   GET    /v1/buildings/{way|relation}/{id}  one building's public measurements and status
export const CONTRIBUTOR = /^[0-9a-f]{32}$/;
const DAY = 86400000;

/** Sliding one-hour windows per key (install id or IP address), §6.8. */
export class RateLimiter {
  constructor(limits, now = () => Date.now()) {
    this.limits = limits;
    this.now = now;
    this.hits = new Map();
  }
  allow(bucket, key) {
    const limit = this.limits[bucket];
    if (!limit) return true;
    const id = `${bucket}:${key}`,
      t = this.now(),
      list = (this.hits.get(id) ?? []).filter((h) => t - h < 3600000);
    if (this.hits.size > 50000) this.hits.clear();
    if (list.length >= limit) {
      this.hits.set(id, list);
      return false;
    }
    list.push(t);
    this.hits.set(id, list);
    return true;
  }
}
const limited = () =>
  new ComputeError(
    "Prea multe măsurători într-o oră. Încearcă mai târziu.",
    429,
    "rate_limited",
  );

/** Returns true when the request was a heights route and has been answered. */
export async function heightsRoute({
  req,
  path,
  url,
  store,
  pool,
  limiter,
  readJson,
  reply,
  signal,
  now = () => Date.now(),
}) {
  // Trust X-Forwarded-For only from the local Metro proxy.
  const peer = req.socket.remoteAddress ?? "unknown";
  const forwarded = req.headers["x-forwarded-for"];
  const ip =
    /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(peer) &&
    typeof forwarded === "string" &&
    forwarded
      ? forwarded.split(",")[0].trim()
      : peer;
  if (path === "/v1/heights") {
    if (req.method !== "GET")
      throw new ComputeError("Method not allowed", 405, "invalid");
    const since = url.searchParams.get("since") ?? "";
    if (since && !Number.isFinite(Date.parse(since)))
      throw new ComputeError("Parametru since invalid.", 422, "invalid");
    const file = store.exportFile(new Date(now()).toISOString());
    if (since) file.heights = store.changedSince(since);
    await reply(200, JSON.stringify(file));
    return true;
  }
  const building = /^\/v1\/buildings\/((?:way|relation)\/\d{1,15})$/.exec(path);
  if (building && req.method === "GET") {
    await reply(200, JSON.stringify(store.building(building[1])));
    return true;
  }
  if (path === "/v1/measurements" && req.method === "POST") {
    const body = await readJson();
    if (
      !body ||
      typeof body !== "object" ||
      Object.keys(body).some(
        (k) => !["measurement", "contributor"].includes(k),
      ) ||
      typeof body.contributor !== "string" ||
      !CONTRIBUTOR.test(body.contributor) ||
      !isSubmission(body.measurement)
    )
      throw new ComputeError("Măsurătoare invalidă.", 422, "invalid");
    const s = body.measurement,
      at = Date.parse(s.measured_at);
    if (at > now() + 5 * 60000 || at < now() - 400 * DAY)
      throw new ComputeError("Ora măsurătorii este invalidă.", 422, "invalid");
    // Retries from the phone's upload queue are answered without using the hourly limit.
    const existing = store.find(s.id);
    if (existing) {
      if (existing.contributor !== body.contributor)
        throw new ComputeError(
          "Identificator de măsurătoare folosit.",
          409,
          "conflict",
        );
      await reply(
        200,
        JSON.stringify({
          measurement: {
            id: existing.id,
            height_m: existing.height_m,
            sigma_m: existing.sigma_m,
            status: existing.effective_status,
            reason: existing.reason,
          },
          building: store.summary(existing.osm_building),
        }),
      );
      return true;
    }
    if (
      !limiter.allow("post_contributor", body.contributor) ||
      !limiter.allow("post_ip", ip)
    )
      throw limited();
    // The corner must be a vertex of the bundled OSM footprint, so heights cannot be
    // attached to arbitrary ids or points.
    const check = JSON.parse(
      await pool.run(
        "verify",
        { osm_building: s.osm_building, corner: s.corner },
        signal,
      ),
    );
    if (!check.exists)
      throw new ComputeError(
        "Clădirea nu există în datele OSM.",
        422,
        "unknown_building",
      );
    if (check.elevated)
      throw new ComputeError(
        "Clădirile suspendate nu pot fi măsurate.",
        422,
        "invalid",
      );
    if (!check.corner)
      throw new ComputeError(
        "Colțul nu aparține clădirii.",
        422,
        "not_a_corner",
      );
    const measurement = evaluateSubmission(s, check.levels);
    const result = store.add(
      measurement,
      body.contributor,
      new Date(now()).toISOString(),
    );
    if (result === "conflict")
      throw new ComputeError(
        "Identificator de măsurătoare folosit.",
        409,
        "conflict",
      );
    const stored = store.find(s.id);
    await reply(
      result === "created" ? 201 : 200,
      JSON.stringify({
        measurement: {
          id: stored.id,
          height_m: stored.height_m,
          sigma_m: stored.sigma_m,
          status: stored.effective_status,
          reason: stored.reason,
        },
        building: store.summary(s.osm_building),
      }),
    );
    return true;
  }
  const one = /^\/v1\/measurements(?:\/([a-z0-9-]{8,64}))?$/.exec(path);
  if (one && req.method === "DELETE") {
    const contributor = req.headers["x-umbra-contributor"];
    if (typeof contributor !== "string" || !CONTRIBUTOR.test(contributor))
      throw new ComputeError(
        "Identificator de instalare lipsă.",
        401,
        "invalid",
      );
    if (!limiter.allow("delete_ip", ip)) throw limited();
    if (!one[1]) {
      await reply(
        200,
        JSON.stringify({ deleted: store.removeContributor(contributor) }),
      );
      return true;
    }
    if (!MEASUREMENT_ID.test(one[1]))
      throw new ComputeError("Identificator invalid.", 422, "invalid");
    const result = store.remove(one[1], contributor);
    if (result === "not_found")
      throw new ComputeError("Măsurătoare inexistentă.", 404, "not_found");
    if (result === "forbidden")
      throw new ComputeError(
        "Măsurătoarea aparține altei instalări.",
        403,
        "forbidden",
      );
    await reply(200, JSON.stringify({ deleted: 1 }));
    return true;
  }
  if (path === "/v1/heights" || one || building)
    throw new ComputeError("Method not allowed", 405, "invalid");
  return false;
}
export { BUILDING_ID };
