/** Remove near-collinear display points without changing analysis geometry. */
export function simplifyDisplayRing(ring) {
  if (ring.length < 6) return ring;
  const latitude = ring[0][1] * Math.PI / 180;
  const xScale = 111320 * Math.cos(latitude), yScale = 111320;
  const points = ring.slice(0, -1);
  const result = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = result[result.length - 1], b = points[i], c = points[(i + 1) % points.length];
    const dx = (c[0] - a[0]) * xScale, dy = (c[1] - a[1]) * yScale;
    const bx = (b[0] - a[0]) * xScale, by = (b[1] - a[1]) * yScale;
    const length2 = dx * dx + dy * dy;
    const t = length2 ? (bx * dx + by * dy) / length2 : -1;
    const distance = t >= 0 && t <= 1 ? Math.hypot(bx - t * dx, by - t * dy) : Infinity;
    // Only isolated points are removed: avoid accumulating geometric error.
    if (i % 2 === 1 && distance <= 0.15) continue;
    result.push(b);
  }
  if (result.length < 3) return ring;
  result.push(result[0]);
  return result;
}
