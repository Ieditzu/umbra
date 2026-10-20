export type RoadUser = { id: number; label: string; score: number; box: [number, number, number, number]; risk: "observed" | "approaching" | "in_path" };
export type ShadowCue = {
  id: number; box: [number, number, number, number]; contour: [number, number][];
  side: "left" | "right"; direction: "rightward" | "leftward" | "vertical";
  texture_correlation: number; attenuation: number; source: "unconfirmed";
};
export type CueEpisode = {
  id: number; warning_s: number; last_seen_s: number; side: "left" | "right";
  visible_road_users_at_warning: number;
  review: "unreviewed" | "first_visible" | "unrelated";
  first_visible_s: number | null; lead_s: number | null;
};
export type ParkingEvidence = {
  segment_id: string; episodes: CueEpisode[];
  summary: { retained_episodes: number; reviewed_approaches: number; unrelated_cues: number; unreviewed: number; early_warnings: number; median_lead_s: number | null };
  basis: string;
};
export type ParkingObservation = {
  state: "observing" | "obstacle" | "cross_traffic" | "shadow_cue" | "limited";
  message: string; detections: RoadUser[];
  alerts: { id: number; label: string; side: "left" | "right"; kind: string }[];
  frame_aspect: number; processing_ms: number; motion_reliable: boolean;
  shadow: { state: string; message: string; progress?: number; box?: [number, number, number, number];
    zone: "ground" | "left" | "right"; region: [number, number, number, number]; cues: ShadowCue[] };
  evidence: ParkingEvidence; timestamp_s: number;
  image?: string;
};

export function parkingMessage(observation: ParkingObservation, mirrored: boolean): string {
  if (observation.state !== "cross_traffic") return observation.message;
  const sides = [...new Set(observation.alerts.map(alert => mirrored ? alert.side === "left" ? "right" : "left" : alert.side))];
  return `Approaching from ${sides.sort().join(" and ")}`;
}

export function screenBox(box: [number, number, number, number], mirrored: boolean): [number, number, number, number] {
  return [mirrored ? 1 - box[0] - box[2] : box[0], box[1], box[2], box[3]];
}

export function leadLabel(lead: number | null): string {
  if (lead === null) return "Not reviewed";
  if (lead > 0) return `${lead.toFixed(2)} s before visibility`;
  if (lead < 0) return `${Math.abs(lead).toFixed(2)} s after visibility`;
  return "At first visibility";
}
