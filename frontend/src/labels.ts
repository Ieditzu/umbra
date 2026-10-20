// Manual clip labels for the method comparison (scripts/evaluate_parking.py).
// Rules mirror umbra.parking_eval.load_manifest so exported files load without surprises.

export type Split = "tune" | "test";
export type Zone = "ground" | "left" | "right";
export type TrialLabel = {
  id: string; video: string; split: Split; approach: boolean;
  // undefined = not decided yet, null = no useful shadow was observable.
  first_cue_s?: number | null; first_visible_s: number | null; clear_s: number | null;
  zone: Zone; tags: string[];
};
type ManifestTrial = Omit<TrialLabel, "first_cue_s" | "first_visible_s" | "clear_s"> &
  Partial<{ first_cue_s: number | null; first_visible_s: number; clear_s: number }>;
export type Manifest = { label_tolerance_s: number; trials: ManifestTrial[] };

export function roundTime(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}

export function parseTags(text: string): string[] {
  return [...new Set(text.split(",").map(tag => tag.trim()).filter(Boolean))];
}

export function stem(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").trim() || "clip";
}

export function uniqueId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

export function trialProblems(label: TrialLabel): string[] {
  const problems: string[] = [];
  if (!label.id.trim()) problems.push("Give the clip an id.");
  if (!label.video.trim()) problems.push("Load the clip's video.");
  if (!label.approach) return problems;
  const { first_cue_s: cue, first_visible_s: visible, clear_s: clear } = label;
  if (cue === undefined) problems.push("Mark where the shadow starts, or choose No useful shadow.");
  if (visible === null) problems.push("Mark the first frame where the road user is directly visible.");
  if (clear === null) problems.push("Mark when the road user is gone.");
  if (typeof cue === "number" && visible !== null && cue > visible) problems.push("The shadow start must not be after first visibility.");
  if (visible !== null && clear !== null && clear < visible) problems.push("Gone must not be before first visibility.");
  return problems;
}

export function toManifest(labels: TrialLabel[], toleranceS: number): Manifest {
  if (!labels.length) throw new Error("Save at least one clip label first.");
  if (!(toleranceS >= 0 && toleranceS <= 5)) throw new Error("Label tolerance must be 0–5 seconds.");
  const ids = new Set<string>();
  const trials = labels.map(label => {
    const problems = trialProblems(label);
    if (problems.length) throw new Error(`${label.id || label.video}: ${problems[0]}`);
    if (ids.has(label.id)) throw new Error(`Two clips share the id ${label.id}.`);
    ids.add(label.id);
    const { first_cue_s, first_visible_s, clear_s, ...base } = label;
    return label.approach
      ? { ...base, first_cue_s: first_cue_s ?? null, first_visible_s: first_visible_s!, clear_s: clear_s! }
      : base;
  });
  return { label_tolerance_s: toleranceS, trials };
}

function time(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Read a previously exported manifest back so labelling can continue. */
export function fromManifest(data: unknown): { tolerance: number; labels: TrialLabel[] } {
  const raw = data as { label_tolerance_s?: unknown; trials?: unknown };
  if (!raw || !Array.isArray(raw.trials)) throw new Error("This file has no trials list.");
  const labels = raw.trials.map((item: Record<string, unknown>) => {
    if (!item || typeof item.id !== "string" || typeof item.approach !== "boolean") throw new Error("Each trial needs an id and approach.");
    return {
      id: item.id, video: typeof item.video === "string" ? item.video : "",
      split: item.split === "tune" ? "tune" : "test",
      approach: item.approach,
      first_cue_s: item.approach ? time(item.first_cue_s) : undefined,
      first_visible_s: item.approach ? time(item.first_visible_s) : null,
      clear_s: item.approach ? time(item.clear_s) : null,
      zone: item.zone === "left" || item.zone === "right" ? item.zone : "ground",
      tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === "string") : [],
    } satisfies TrialLabel;
  });
  const tolerance = typeof raw.label_tolerance_s === "number" ? raw.label_tolerance_s : 0.5;
  return { tolerance, labels };
}
