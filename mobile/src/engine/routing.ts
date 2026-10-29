import type {
  RouteComparison,
  RouteRequest,
  WalkingRoute,
  RouteSegment,
} from "../domain/routes.ts";
import { isCoordinate, parseComparison } from "../domain/routes.ts";
import { ATTRIBUTION, COPERNICUS_ATTRIBUTION } from "./data.ts";
import type { Dataset } from "./data.ts";
import { contains, distance, lerp, project, unproject } from "./geometry.ts";
import type { Point } from "./geometry.ts";
import { exposureAt } from "./exposure.ts";
import type { ExposureResult } from "./exposure.ts";
import { solarPosition } from "./solar.ts";
import { task } from "./task.ts";
import type { Task } from "./task.ts";
import { attachToWalkingGraph } from "./snapping.ts";

type Entry = { node: number; cost: number; sequence: number };
class Heap {
  values: Entry[] = [];
  less(a: Entry, b: Entry) {
    return a.cost < b.cost || (a.cost === b.cost && a.sequence < b.sequence);
  }
  push(value: Entry) {
    const q = this.values;
    q.push(value);
    let i = q.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(q[i], q[p])) break;
      [q[i], q[p]] = [q[p], q[i]];
      i = p;
    }
  }
  pop(): Entry {
    const q = this.values,
      top = q[0],
      end = q.pop()!;
    if (q.length) {
      q[0] = end;
      let i = 0;
      for (;;) {
        let child = i * 2 + 1;
        if (child >= q.length) break;
        if (child + 1 < q.length && this.less(q[child + 1], q[child])) child++;
        if (!this.less(q[child], q[i])) break;
        [q[i], q[child]] = [q[child], q[i]];
        i = child;
      }
    }
    return top;
  }
}

function validate(data: Dataset, q: RouteRequest, now: number): number {
  if (
    q.schema_version !== 1 ||
    !isCoordinate(q.origin) ||
    !isCoordinate(q.destination) ||
    !Number.isFinite(q.walking_speed_mps) ||
    q.walking_speed_mps <= 0 ||
    ![0, 5, 10, 15].includes(q.max_extra_minutes)
  )
    throw new Error("Cerere de traseu invalidă.");
  const a = project(q.origin),
    b = project(q.destination),
    apart = distance(a, b);
  if (!contains(data.pilot_m, a) || !contains(data.pilot_m, b))
    throw new Error(
      "Punctele alese sunt în afara datelor disponibile pentru trasee.",
    );
  if (apart < 25 || apart > 20000)
    throw new Error("Alege puncte aflate între 25 m și 20 km distanță.");
  const at = Date.parse(q.departure_at),
    year = new Date(at).getUTCFullYear();
  if (
    !/(Z|[+-]\d{2}:\d{2})$/.test(q.departure_at) ||
    !Number.isFinite(at) ||
    at < now - 60000 ||
    year < 2000 ||
    year > 2100
  )
    throw new Error(
      "Alege o oră de plecare din prezent sau viitor, între anii 2000 și 2100.",
    );
  try {
    if (!q.departure_timezone || q.departure_timezone === "Local")
      throw new Error();
    new Intl.DateTimeFormat("en", { timeZone: q.departure_timezone });
  } catch {
    throw new Error("Fus orar invalid.");
  }
  return at;
}

async function shortest(
  data: Dataset,
  from: number,
  to: number,
  weight: (edge: number) => number,
  all: boolean,
  work: Task,
) {
  const distances = new Map<number, number>([[from, 0]]),
    previous = new Map<number, number>(),
    heap = new Heap();
  let sequence = 0;
  heap.push({ node: from, cost: 0, sequence });
  while (heap.values.length) {
    await work.checkpoint();
    const current = heap.pop();
    if (current.cost > distances.get(current.node)! + 1e-9) continue;
    if (current.node === to && !all) break;
    for (const i of data.adjacency.get(current.node) ?? []) {
      const edge = data.edges[i],
        next = current.cost + weight(i);
      if (next < (distances.get(edge.to) ?? Infinity) - 1e-9) {
        distances.set(edge.to, next);
        previous.set(edge.to, i);
        heap.push({ node: edge.to, cost: next, sequence: ++sequence });
      }
    }
  }
  if (!distances.has(to))
    throw new Error("Nu există un traseu pietonal conectat în datele locale.");
  const path: number[] = [];
  for (let current = to; current !== from;) {
    const i = previous.get(current);
    if (i === undefined || path.length > data.edges.length)
      throw new Error("Traseul local nu a putut fi reconstruit.");
    path.push(i);
    current = data.edges[i].from;
  }
  return { path: path.reverse(), distances };
}

type Evaluated = {
  route: WalkingRoute;
  upperSun: number;
  reasons: Set<string>;
};
async function evaluate(
  data: Dataset,
  path: number[],
  q: RouteRequest,
  at: number,
  work: Task,
  classify: Classifier,
): Promise<Evaluated> {
  const segments: RouteSegment[] = [],
    reasons = new Set<string>();
  let elapsed = 0,
    metres = 0,
    upperSun = 0,
    samples = 0;
  for (const ei of path) {
    const edge = data.edges[ei];
    metres += edge.length;
    for (let i = 1; i < edge.geometry.length; i++) {
      const a = edge.geometry[i - 1],
        b = edge.geometry[i],
        ln = distance(a, b);
      if (ln < 1e-8) continue;
      const count = Math.ceil(ln / Math.min(10, q.walking_speed_mps * 10));
      samples += count;
      if (samples > 20000)
        throw new Error("Traseul depășește limita de calcul local.");
      for (let j = 0; j < count; j++) {
        await work.checkpoint();
        const p = lerp(a, b, j / count),
          z = lerp(a, b, (j + 1) / count),
          seconds = distance(p, z) / q.walking_speed_mps;
        const ex = classify(
          lerp(p, z, 0.5),
          at + (elapsed + seconds / 2) * 1000,
          edge.position_known,
        );
        reasons.add(ex.reason);
        if (ex.exposure === "estimated_shade") upperSun += seconds * 0.5;
        else if (ex.exposure !== "shade") upperSun += seconds;
        const last = segments.at(-1);
        if (
          last &&
          last.exposure === ex.exposure &&
          last.coordinates.length < 9000
        ) {
          last.coordinates.push(unproject(z));
          last.duration_s += seconds;
        } else
          segments.push({
            coordinates: [unproject(p), unproject(z)],
            duration_s: seconds,
            exposure: ex.exposure,
          });
        elapsed += seconds;
      }
    }
  }
  if (!segments.length || segments.length > 5000)
    throw new Error("Geometria traseului depășește limitele aplicației.");
  return {
    route: {
      id: `local-${path.join(".")}`,
      kind: "fastest",
      distance_m: metres,
      duration_s: elapsed,
      segments,
    },
    upperSun,
    reasons,
  };
}
/** Follow polyline distance, not the chord between an edge's endpoints. */
function along(points: Point[], fraction: number): Point {
  let total = 0;
  for (let i = 1; i < points.length; i++)
    total += distance(points[i - 1], points[i]);
  let left = total * fraction;
  for (let i = 1; i < points.length; i++) {
    const ln = distance(points[i - 1], points[i]);
    if (left <= ln && ln > 0) return lerp(points[i - 1], points[i], left / ln);
    left -= ln;
  }
  return points.at(-1)!;
}
export type Classifier = (
  p: Point,
  at: number,
  known: boolean,
) => ExposureResult;
export async function compareLocalRoutes(
  data: Dataset,
  q: RouteRequest,
  signal: AbortSignal,
  options: { now?: number; classify?: Classifier; budgetMs?: number } = {},
): Promise<RouteComparison> {
  const now = options.now ?? Date.now(),
    at = validate(data, q, now),
    work = task(signal, options.budgetMs ?? 18000);
  work.check();
  const classify =
    options.classify ?? ((p, at, known) => exposureAt(data, p, at, known));
  const attached = await attachToWalkingGraph(
    data,
    project(q.origin),
    project(q.destination),
    work,
  );
  data = attached.data;
  const { from, to } = attached;
  if (from.id === to.id)
    throw new Error("Punctele alese ajung la același nod pietonal.");
  const fastest = await shortest(
    data,
    from.id,
    to.id,
    (i) => data.edges[i].length,
    true,
    work,
  );
  const limit =
    fastest.distances.get(to.id)! / q.walking_speed_mps +
    q.max_extra_minutes * 60;
  if (limit > 14400) throw new Error("Traseul și ocolul depășesc patru ore.");
  const base = await evaluate(data, fastest.path, q, at, work, classify),
    candidates: Evaluated[] = [base];
  const seen = new Set([base.route.id]),
    usage = new Map<number, number>(),
    edgeExposure = new Map<number, number>();
  for (const i of fastest.path) usage.set(i, (usage.get(i) ?? 0) + 1);
  const score = (i: number) => {
    if (edgeExposure.has(i)) return edgeExposure.get(i)!;
    const edge = data.edges[i],
      travel = fastest.distances.get(edge.from)! / q.walking_speed_mps;
    let bad = 0;
    for (let j = 0; j < 3; j++) {
      const f = (j + 0.5) / 3;
      const exposure = classify(
        along(edge.geometry, f),
        at + (travel + (edge.length / q.walking_speed_mps) * f) * 1000,
        edge.position_known,
      ).exposure;
      bad +=
        exposure === "shade" ? 0 : exposure === "estimated_shade" ? 0.5 : 1;
    }
    edgeExposure.set(i, bad / 3);
    return bad / 3;
  };
  const seek =
    solarPosition(at, q.origin).elevation >= 5 ||
    solarPosition(at + limit * 1000, q.destination).elevation >= 5;
  if (seek)
    for (let attempt = 0; attempt < 12; attempt++) {
      await work.checkpoint();
      const lambda = [1, 3, 8, 20, 50, 100][attempt % 6],
        diversity = attempt >= 6 ? 0.8 : 0;
      const { path } = await shortest(
        data,
        from.id,
        to.id,
        (i) => {
          const edge = data.edges[i];
          // An admissible lower bound avoids evaluating shadows across the whole
          // city for a short walk. It cannot remove a path within the detour limit.
          const minimumMetres =
            (fastest.distances.get(edge.from) ?? Infinity) +
            edge.length +
            distance(data.positions.get(edge.to)!, data.positions.get(to.id)!);
          if (minimumMetres > limit * q.walking_speed_mps + 1e-6)
            return Infinity;
          return (
            edge.length *
            (1 + lambda * score(i) + diversity * (usage.get(i) ?? 0))
          );
        },
        false,
        work,
      );
      for (const i of path) usage.set(i, (usage.get(i) ?? 0) + 1);
      if (
        seen.has(`local-${path.join(".")}`) ||
        path.reduce((n, i) => n + data.edges[i].length, 0) /
          q.walking_speed_mps >
          limit + 1e-6
      )
        continue;
      const result = await evaluate(data, path, q, at, work, classify);
      seen.add(result.route.id);
      candidates.push(result);
    }
  const selected = [base];
  const improvements = candidates
    .slice(1)
    .filter((v) => v.upperSun < base.upperSun - 1)
    .sort(
      (a, b) =>
        a.upperSun - b.upperSun || a.route.duration_s - b.route.duration_s,
    );
  const shade = improvements[0];
  if (shade) {
    shade.route.kind = "shadiest";
    const balanced = improvements
      .filter(
        (v) => v !== shade && v.route.duration_s < shade.route.duration_s - 1,
      )
      .sort(
        (a, b) =>
          (base.upperSun - b.upperSun) /
            (1 + b.route.duration_s - base.route.duration_s) -
          (base.upperSun - a.upperSun) /
            (1 + a.route.duration_s - base.route.duration_s),
      )[0];
    if (balanced) {
      balanced.route.kind = "balanced";
      selected.push(balanced);
    }
    selected.push(shade);
  }
  work.check();
  return parseComparison(
    {
      schema_version: 1,
      departure_at: q.departure_at,
      generated_at: new Date(now).toISOString(),
      method: "on-device/bounded-candidates/traversal-ray-shadows/utm35/v1",
      routes: selected.map((v) => v.route),
      warnings: [
        "Model geometric experimental pe teren plan; fără validare în teren. Umbrele copacilor cartografiați și ale coroanelor estimate din imagini satelitare din 2019–2020 sunt orientative. Norii, vremea și obstacolele necartografiate nu sunt deduse.",
        "Calcul local: poziția Soarelui este reevaluată la momentele parcurgerii, cu eșantioane de cel mult 10 m și 10 s. Căutarea de alternative este limitată și nu garantează optimul global.",
        `Înălțimile din numărul etajelor sunt ipoteze de 2,5–3,5 m/etaj plus până la 3 m pentru acoperiș. ${data.metadata.copernicus_heights ? `Umbrele Copernicus sunt estimări satelitare din jurul anului ${data.metadata.copernicus_heights} și pot fi greșite. ` : ""}«Fără umbră identificată» nu dovedește soare direct; norii și obstacolele lipsă pot schimba rezultatul.`,
        `Acces la rețeaua pietonală: ${from.distance.toFixed(1)} m și ${to.distance.toFixed(1)} m; porțiunile din afara rețelei nu sunt incluse în durată. Verifică accesul și trecerile pe teren.`,
        ...(from.insideBuilding || to.insideBuilding
          ? [
              "Un punct este în conturul unei clădiri. Legătura până la stradă nu reprezintă o intrare verificată și nu este inclusă în traseu.",
            ]
          : []),
        `Date locale ${data.pilot_id}, OSM ${data.metadata.osm_base_timestamp}. Inventarul obstacolelor nu este verificat complet.`,
        ...(selected.length === 1
          ? [
              "Nu s-a găsit o alternativă distinctă cu mai puțină expunere estimată și incertitudine în ocolul acceptat.",
            ]
          : []),
        ...[...new Set(selected.flatMap((v) => [...v.reasons]))].map(
          (reason) => `Model exposure: ${reason}`,
        ),
      ],
      attribution: [
        ATTRIBUTION,
        ...(data.metadata.copernicus_heights ? [COPERNICUS_ATTRIBUTION] : []),
        ...(data.trees?.some((tree) => tree.origin === "satellite")
          ? [
              "Canopy height: Tolan et al. 2024 · WRI and Meta · CC BY 4.0 · source imagery © Maxar · 2019–2020",
            ]
          : []),
      ],
    },
    q,
  );
}
