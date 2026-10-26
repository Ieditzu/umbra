import { ComputeError } from "./pool.mjs";
const ZOOM = 14,
  SIZE = 2 ** ZOOM;
export const ROMANIA_ENVELOPE = [20.2, 43.5, 30, 48.4];
const CITY = [28.5, 44.075, 28.75, 44.355];
const inside = (p, b) =>
  p.longitude >= b[0] &&
  p.longitude <= b[2] &&
  p.latitude >= b[1] &&
  p.latitude <= b[3];
export function regionalSelection(q) {
  const b = q.bounds;
  const focus = q.focus ?? {
    longitude: (b[0] + b[2]) / 2,
    latitude: (b[1] + b[3]) / 2,
  };
  if (b[0] >= CITY[0] && b[1] >= CITY[1] && b[2] <= CITY[2] && b[3] <= CITY[3])
    return null;
  if (!inside(focus, ROMANIA_ENVELOPE))
    throw new ComputeError(
      "Apropie harta de România pentru clădiri și umbre.",
      422,
      "outside",
    );
  const x = Math.floor(((focus.longitude + 180) / 360) * SIZE);
  const lat = (focus.latitude * Math.PI) / 180;
  const y = Math.floor(((1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2) * SIZE);
  return { key: `${ZOOM}/${x}/${y}`, x, y, z: ZOOM };
}
export function tileBounds(x, y, z = ZOOM) {
  const size = 2 ** z;
  const lon = (x) => (x / size) * 360 - 180;
  const lat = (y) =>
    (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / size))) * 180) / Math.PI;
  return [lon(x), lat(y + 1), lon(x + 1), lat(y)];
}
const USER_AGENT =
  "UmbraShadeRouting/0.1 (personal research; https://github.com/Ieditzu/umbra)";
async function limitedBody(response, limit) {
  if (!response.ok || Number(response.headers.get("content-length")) > limit)
    throw new ComputeError(
      "Datele hărții sunt temporar indisponibile. Reîncearcă.",
    );
  const chunks = [];
  let bytes = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit)
        throw new ComputeError("Datele zonei sunt prea mari. Apropie harta.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}
export class RegionTiles {
  constructor(fetcher = fetch) {
    this.fetcher = fetcher;
    this.cache = new Map();
    this.pending = new Map();
    this.regions = new Map();
    this.bytes = 0;
    this.active = 0;
    this.waiters = [];
    this.metadata = null;
  }
  async network(url, limit) {
    if (this.active >= 4)
      await new Promise((resolve) => this.waiters.push(resolve));
    else this.active++;
    try {
      return await limitedBody(
        await this.fetcher(url, {
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "application/octet-stream",
          },
          signal: AbortSignal.timeout(8000),
        }),
        limit,
      );
    } finally {
      const next = this.waiters.shift();
      if (next) next();
      else this.active--;
    }
  }
  async template() {
    if (!this.metadata)
      this.metadata = this.network(
        "https://tiles.openfreemap.org/planet",
        100000,
      )
        .then((buffer) => {
          const data = JSON.parse(buffer.toString("utf8")),
            url = data.tiles?.[0];
          if (
            typeof url !== "string" ||
            !/^https:\/\/tiles\.openfreemap\.org\/planet\/[^?]+\/\{z\}\/\{x\}\/\{y\}\.pbf$/.test(
              url,
            )
          )
            throw new ComputeError("Sursa de clădiri nu este validă.");
          return url;
        })
        .catch((error) => {
          this.metadata = null;
          throw error;
        });
    return this.metadata;
  }
  async tile(x, y, z) {
    const key = `${z}/${x}/${y}`;
    if (this.cache.has(key)) {
      const value = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    if (this.pending.has(key)) return this.pending.get(key);
    const promise = (async () => {
      const template = await this.template();
      const url = template
        .replace("{z}", z)
        .replace("{x}", x)
        .replace("{y}", y);
      const bytes = await this.network(url, 4_000_000);
      while (
        this.cache.size &&
        (this.cache.size >= 32 || this.bytes + bytes.length > 16_000_000)
      ) {
        const first = this.cache.keys().next().value;
        this.bytes -= this.cache.get(first).bytes.length;
        this.cache.delete(first);
      }
      const value = { x, y, z, bytes };
      this.cache.set(key, value);
      this.bytes += bytes.length;
      return value;
    })().finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }
  async load(selection) {
    if (this.regions.has(selection.key)) return this.regions.get(selection.key);
    if (this.regions.size >= 3)
      throw new ComputeError(
        "Se încarcă alte zone ale hărții. Reîncearcă imediat.",
        503,
        "busy",
      );
    const result = (async () => {
      const tiles = [];
      for (let x = selection.x - 1; x <= selection.x + 1; x++)
        for (let y = selection.y - 1; y <= selection.y + 1; y++)
          tiles.push(this.tile(x, y, selection.z));
      const loaded = await Promise.all(tiles);
      if (loaded.reduce((sum, t) => sum + t.bytes.length, 0) > 12_000_000)
        throw new ComputeError("Zona este prea detaliată. Apropie harta.");
      return {
        key: selection.key,
        tiles: loaded,
        bounds: [
          tileBounds(selection.x - 1, selection.y + 1)[0],
          tileBounds(selection.x - 1, selection.y + 1)[1],
          tileBounds(selection.x + 1, selection.y - 1)[2],
          tileBounds(selection.x + 1, selection.y - 1)[3],
        ],
      };
    })().finally(() => this.regions.delete(selection.key));
    this.regions.set(selection.key, result);
    return result;
  }
}
