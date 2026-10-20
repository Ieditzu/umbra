export type Distance = {
  bound: "range" | "at_most"; low_m: number | null; estimate_m: number | null; high_m: number;
  method: "size" | "ground" | "ground+size" | "conflict";
};
export type RoadUser = { id: number; label: string; score: number; box: [number, number, number, number]; risk: "observed" | "approaching" | "in_path"; distance?: Distance | null };
export type CameraGeometry = { vertical_fov_deg: number; height_m: number | null; tilt_deg: number };
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
  evidence: ParkingEvidence; timestamp_s: number; camera_geometry?: CameraGeometry;
  image?: string;
};

function metres(value: number): string {
  return value < 10 ? value.toFixed(1) : String(Math.round(value));
}

/** A range, never a single exact number: these are image-based estimates. */
export function distanceLabel(distance?: Distance | null): string | null {
  if (!distance) return null;
  if (distance.bound === "at_most" || distance.low_m === null) return `< ${metres(distance.high_m)} m`;
  return `${metres(distance.low_m)}–${metres(distance.high_m)} m`;
}

/** The road user that could be closest: smallest near bound (a cut-off box could be very close). */
export function nearestRoadUser(detections: RoadUser[], ids?: Set<number>): RoadUser | null {
  const candidates = detections.filter(item => item.distance && (!ids || ids.has(item.id)));
  const near = (item: RoadUser) => item.distance!.low_m ?? 0;
  return candidates.sort((a, b) => near(a) - near(b) || a.distance!.high_m - b.distance!.high_m)[0] ?? null;
}

export function parkingMessage(observation: ParkingObservation, mirrored: boolean): string {
  let message = observation.message;
  if (observation.state === "cross_traffic") {
    const sides = [...new Set(observation.alerts.map(alert => mirrored ? alert.side === "left" ? "right" : "left" : alert.side))];
    message = `Approaching from ${sides.sort().join(" and ")}`;
  }
  if (observation.state !== "cross_traffic" && observation.state !== "obstacle") return message;
  const closest = nearestRoadUser(observation.detections ?? [], new Set((observation.alerts ?? []).map(alert => alert.id)));
  return closest ? `${message} · ${closest.label} ${distanceLabel(closest.distance)}` : message;
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
