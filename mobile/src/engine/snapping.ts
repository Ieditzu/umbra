import type { Dataset, Edge } from "./data.ts";
import {
  bounds,
  distance,
  firstInteriorDistance,
  length,
  lerp,
  polygonContains,
} from "./geometry.ts";
import type { Point } from "./geometry.ts";
import type { Task } from "./task.ts";

type Projection = { point: Point; along: number; distance: number };
type Snap = Projection & { edge: number; id: number; insideBuilding: boolean };

function nearestOnLine(p: Point, points: Point[]): Projection {
  let best: Projection = { point: points[0], along: 0, distance: Infinity },
    walked = 0;
  for (let j = 1; j < points.length; j++) {
    const a = points[j - 1],
      b = points[j],
      ln = distance(a, b);
    if (ln < 1e-8) continue;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / ln ** 2,
      ),
    );
    const point = lerp(a, b, t),
      d = distance(p, point);
    if (d < best.distance)
      best = { point, along: walked + ln * t, distance: d };
    walked += ln;
  }
  return best;
}

async function snap(
  data: Dataset,
  p: Point,
  label: string,
  work: Task,
): Promise<Snap> {
  const candidates: (Projection & { edge: number })[] = [];
  for (let i = 0; i < data.edges.length; i++) {
    if (i % 256 === 0) await work.checkpoint();
    const projection = nearestOnLine(p, data.edges[i].geometry);
    if (projection.distance <= 75) candidates.push({ ...projection, edge: i });
  }
  candidates.sort((a, b) => a.distance - b.distance);
  if (!candidates.length)
    throw new Error(
      `${label}: nu există o stradă sau potecă pietonală cartografiată la mai puțin de 75 m.`,
    );
  for (const candidate of candidates) {
    await work.checkpoint();
    let blocked = false,
      insideBuilding = false;
    if (candidate.distance > 0.05) {
      for (const building of data.index.query(bounds([p, candidate.point]))) {
        for (const poly of building.geometry) {
          if (
            polygonContains(poly, p) &&
            !polygonContains(poly, candidate.point)
          ) {
            // Addresses and indoor GPS fixes may start inside a building. This
            // unverified exit is excluded from route distance/exposure, not a path through it.
            insideBuilding = true;
          } else if (firstInteriorDistance(p, candidate.point, poly) !== null)
            blocked = true;
        }
      }
    }
    if (blocked) continue;
    const edge = data.edges[candidate.edge];
    const id =
      candidate.along < 0.05
        ? edge.from
        : edge.length - candidate.along < 0.05
          ? edge.to
          : NaN;
    return { ...candidate, id, insideBuilding };
  }
  throw new Error(
    `${label}: accesul la străzile apropiate traversează o altă clădire. Alege un loc lângă o intrare sau pe stradă.`,
  );
}

function section(
  points: Point[],
  start: number,
  end: number,
  a: Point,
  b: Point,
): Point[] {
  const result = [a];
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    walked += distance(points[i - 1], points[i]);
    if (walked > start + 1e-6 && walked < end - 1e-6) result.push(points[i]);
  }
  result.push(b);
  return result;
}

/** Request-local virtual nodes attach to actual polylines, preserving directed access. */
export async function attachToWalkingGraph(
  source: Dataset,
  origin: Point,
  destination: Point,
  work: Task,
) {
  const from = await snap(source, origin, "Locația ta", work);
  const to = await snap(source, destination, "Destinația", work);
  const interior: Snap[] = [];
  let nextId = -1;
  for (const point of [from, to]) {
    if (Number.isFinite(point.id)) continue;
    const chosen = source.edges[point.edge];
    const shared = interior.find((s) => {
      const other = source.edges[s.edge];
      return (
        chosen.way_id === other.way_id &&
        ((chosen.from === other.from && chosen.to === other.to) ||
          (chosen.from === other.to && chosen.to === other.from)) &&
        distance(s.point, point.point) < 0.05
      );
    });
    if (shared) point.id = shared.id;
    else {
      while (source.positions.has(nextId)) nextId--;
      point.id = nextId--;
      interior.push(point);
    }
  }
  if (!interior.length) return { data: source, from, to };
  const data: Dataset = {
    ...source,
    nodes: [
      ...source.nodes,
      ...interior.map((s) => ({ id: s.id, point: s.point })),
    ],
    positions: new Map(source.positions),
    adjacency: new Map(source.adjacency),
    edges: [...source.edges],
  };
  for (const s of interior) data.positions.set(s.id, s.point);
  for (let i = 0; i < source.edges.length; i++) {
    if (i % 256 === 0) await work.checkpoint();
    const edge = source.edges[i];
    const cuts = interior
      .flatMap((s) => {
        const chosen = source.edges[s.edge];
        if (
          edge.way_id !== chosen.way_id ||
          !(
            (edge.from === chosen.from && edge.to === chosen.to) ||
            (edge.from === chosen.to && edge.to === chosen.from)
          )
        )
          return [];
        const p = nearestOnLine(s.point, edge.geometry);
        return p.distance < 0.05 &&
          p.along > 0.05 &&
          edge.length - p.along > 0.05
          ? [{ ...p, id: s.id }]
          : [];
      })
      .sort((a, b) => a.along - b.along);
    if (!cuts.length) continue;
    data.adjacency.set(
      edge.from,
      (data.adjacency.get(edge.from) ?? []).filter((id) => id !== i),
    );
    const parts = [
      { id: edge.from, along: 0, point: edge.geometry[0] },
      ...cuts,
      { id: edge.to, along: edge.length, point: edge.geometry.at(-1)! },
    ];
    for (let j = 1; j < parts.length; j++) {
      const a = parts[j - 1],
        b = parts[j];
      if (b.along - a.along < 1e-6) continue;
      const geometry = section(
        edge.geometry,
        a.along,
        b.along,
        a.point,
        b.point,
      );
      const split: Edge = {
        ...edge,
        from: a.id,
        to: b.id,
        geometry,
        length: length(geometry),
      };
      const id = data.edges.push(split) - 1;
      data.adjacency.set(a.id, [...(data.adjacency.get(a.id) ?? []), id]);
    }
  }
  return { data, from, to };
}
