// Layouts are deterministic illustrations of canopy coverage, not a tree census.
const R = 6378137;
const xy = ([lon, lat]) => [
  (R * lon * Math.PI) / 180,
  R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
];
const lngLat = ([x, y]) => [
  ((x / R) * 180) / Math.PI,
  ((2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180) / Math.PI,
];
function insideRing(p, ring) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      result = !result;
  }
  return result;
}
function hash(x, y, seed = 0) {
  let h =
    Math.imul(x ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(y ^ seed, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
export function placeCanopy(feature) {
  const source = feature.properties?.source;
  if (source !== "tree_canopy" && source !== "satellite_canopy") return [];
  const rings = feature.geometry?.coordinates;
  if (
    !Array.isArray(rings) ||
    !rings.length ||
    !Array.isArray(rings[0]) ||
    rings[0].length < 4
  )
    return [];
  if (
    !rings.every(
      (r) =>
        Array.isArray(r) &&
        r.length >= 4 &&
        r.every(
          (p) =>
            Array.isArray(p) &&
            Number.isFinite(p[0]) &&
            Number.isFinite(p[1]) &&
            Math.abs(p[1]) < 85,
        ),
    )
  )
    return [];
  const projected = rings.map((r) => r.map(xy));
  const outer = projected[0];
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of outer) {
    minX = Math.min(x, minX);
    minY = Math.min(y, minY);
    maxX = Math.max(x, maxX);
    maxY = Math.max(y, maxY);
  }
  const valid = (p) =>
    insideRing(p, outer) && !projected.slice(1).some((r) => insideRing(p, r));
  const latitude = lngLat([(minX + maxX) / 2, (minY + maxY) / 2])[1],
    factor = Math.cos((latitude * Math.PI) / 180);
  const width = (maxX - minX) * factor,
    length = (maxY - minY) * factor;
  const height = Math.max(
    3,
    Math.min(25, Number(feature.properties?.height) || 8),
  );
  const kind =
    feature.properties?.model_kind ??
    (source === "satellite_canopy" ? "area" : "individual");
  const step = Math.max(
    7 / factor,
    Math.sqrt(((maxX - minX) * (maxY - minY)) / 400),
  );
  const points = [];
  if (kind !== "individual") {
    for (
      let gy = Math.ceil(minY / step);
      gy * step < maxY && points.length < 64;
      gy++
    ) {
      for (
        let gx = Math.ceil(minX / step);
        gx * step < maxX && points.length < 64;
        gx++
      ) {
        const px = (gx + (hash(gx, gy, 1) - 0.5) * 0.45) * step,
          py = (gy + (hash(gx, gy, 2) - 0.5) * 0.45) * step;
        if (valid([px, py])) points.push([px, py]);
      }
    }
  }
  if (!points.length) {
    const center = [(minX + maxX) / 2, (minY + maxY) / 2];
    if (valid(center)) points.push(center);
    else {
      outerloop: for (let y = 1; y < 10; y++)
        for (let x = 1; x < 10; x++) {
          const p = [
            minX + ((maxX - minX) * x) / 10,
            minY + ((maxY - minY) * y) / 10,
          ];
          if (valid(p)) {
            points.push(p);
            break outerloop;
          }
        }
    }
  }
  return points.map(([x, y]) => {
    const seed = hash(Math.round(x), Math.round(y), 9);
    const radius =
      kind === "individual"
        ? Math.max(1.5, Math.min(7, Math.min(width, length) / 2))
        : Math.max(1.7, Math.min(3.7, 2.5 + seed * 0.8));
    return {
      center: lngLat([x, y]),
      radius,
      height: Math.max(3, height * (0.82 + seed * 0.3)),
      seed,
    };
  });
}
export function planTrees(features, limit = 700, obstacles = null) {
  const groups = features
    .map(placeCanopy)
    .map((group) =>
      obstacles ? group.filter((tree) => !obstacles.blocked(tree)) : group,
    )
    .filter((group) => group.length);
  const result = [];
  // Give every visible canopy an initial model before filling the larger patches.
  for (let index = 0; result.length < limit; index++) {
    let added = false;
    for (const group of groups)
      if (group[index]) {
        result.push(group[index]);
        added = true;
        if (result.length >= limit) break;
      }
    if (!added) break;
  }
  return result;
}
