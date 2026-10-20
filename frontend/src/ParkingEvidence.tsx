import { useState } from "react";
import type { ParkingEvidence as Evidence } from "./parking-types";
import { leadLabel } from "./parking-types";

type Props = { evidence: Evidence | null; replay: boolean; active: boolean; mirrored: boolean;
  onReview: (id: number, outcome: "first_visible" | "unrelated" | "unreviewed", visible?: number) => Promise<void> };

export function ParkingEvidence({ evidence, replay, active, mirrored, onReview }: Props) {
  const [times, setTimes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  if (!evidence?.episodes.length) return null;
  const summary = evidence.summary;
  async function review(id: number, outcome: "first_visible" | "unrelated" | "unreviewed") {
    setBusy(true);
    try { await onReview(id, outcome, times[id]?.trim() ? Number(times[id]) : undefined); }
    finally { setBusy(false); }
  }
  return <section className="parking-evidence" aria-label="Indirect warning evidence">
    <div className="parking-evidence-heading"><h2>Indirect warnings</h2><span>{summary.retained_episodes} cues · {summary.unreviewed} unreviewed{summary.median_lead_s !== null ? ` · median ${summary.median_lead_s.toFixed(2)} s frame lead (manual)` : ""}</span></div>
    <p>For a replay, pause at the first frame where any part of the approaching person or vehicle becomes visible. Mark that frame for the matching cue, or enter its video time. A shadow alone does not confirm a hidden person.</p>
    <div className="parking-evidence-list">{evidence.episodes.slice(-8).reverse().map(event => <article key={event.id}>
      <div><strong>Cue {event.id} · {mirrored ? event.side === "left" ? "right" : "left" : event.side} ground</strong><span>{replay ? `Cue frame at ${event.warning_s.toFixed(2)} s` : "Live cue"} · {event.visible_road_users_at_warning} visible detections</span><span className={event.lead_s !== null && event.lead_s > 0 ? "positive" : ""}>{event.review === "unrelated" ? "No related approach (manual)" : leadLabel(event.lead_s)}</span></div>
      {replay && <div className="parking-review-controls"><input type="number" min="0" step="0.01" aria-label={`First visibility time for cue ${event.id}`} placeholder="Video time (s)" value={times[event.id] ?? ""} onChange={e => setTimes(current => ({ ...current, [event.id]: e.target.value }))} /><button className="button secondary" disabled={!active || busy} onClick={() => void review(event.id, "first_visible")}>{times[event.id]?.trim() ? "Set first visibility" : "First visible here"}</button><button className="button ghost" disabled={!active || busy} onClick={() => void review(event.id, "unrelated")}>Unrelated cue</button>{event.review !== "unreviewed" && <button className="button ghost" disabled={!active || busy} onClick={() => void review(event.id, "unreviewed")}>Reset label</button>}</div>}
    </article>)}</div>
    <p>Frame-time lead excludes processing and display latency. Only reviewed cues are measured; missed approaches are not counted here. Download the log before starting another session.</p>
  </section>;
}
