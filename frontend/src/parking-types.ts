export type RoadUser = { id: number; label: string; score: number; box: [number, number, number, number]; risk: "observed" | "approaching" | "in_path" };
export type ParkingObservation = {
  state: "observing" | "obstacle" | "cross_traffic" | "shadow_cue" | "limited";
  message: string; detections: RoadUser[];
  alerts: { id: number; label: string; side: "left" | "right"; kind: string }[];
  frame_aspect: number; processing_ms: number; motion_reliable: boolean;
  shadow: { state: string; message: string; progress?: number; box?: [number, number, number, number] };
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
