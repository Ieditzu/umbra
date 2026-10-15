export type State = "no_coverage" | "no_reliable_signal" | "possible_motion" | "strong_motion" | "early_warning" | "entered_view";
export type MediaRole = "calibration" | "main" | "ground_truth";

export interface Scene {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  recorded_at: string | null;
  notes: string;
  created_at: string;
}

export interface SunPosition {
  status: "estimated" | "not_available";
  elevation_deg: number | null;
  azimuth_deg: number | null;
  above_horizon: boolean | null;
}

export interface MediaAsset {
  id: string;
  scene_id: string;
  role: MediaRole;
  original_name: string;
  content_type: string | null;
  path: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Trial {
  id: string;
  scene_id: string;
  name: string;
  calibration_media_id: string;
  main_media_id: string;
  ground_truth_media_id: string | null;
  track_length_m: number | null;
  created_at: string;
}

export interface ManualPoint {
  x: number;
  y: number;
}

export interface ManualTrackSample extends ManualPoint {
  timestamp_s: number;
}

export interface ManualRegion extends ManualPoint {
  width: number;
  height: number;
}

export interface ManualGroundTruth {
  trial_id: string;
  ground_truth_media_id: string;
  corner: ManualPoint | null;
  far_point: ManualPoint | null;
  samples: ManualTrackSample[];
  main_entry_timestamp_s: number | null;
  main_shadow_region: ManualRegion | null;
  updated_at?: string | null;
}

export interface SceneDetail {
  scene: Scene;
  media: MediaAsset[];
  trials: Trial[];
  analyses: { id: string; trial_id: string; trial_name: string; created_at: string }[];
  position_calibration?: {
    id: string;
    calibration_media_id: string;
    main_media_id: string;
    updated_at: string;
    model: { pair_count: number; internal_check_error_px: number; aspect_ratio: number; source_trial_id: string };
  } | null;
}

export interface Job {
  id: string;
  kind: string;
  status: "queued" | "running" | "succeeded" | "failed";
  progress: number;
  message: string;
  result: Record<string, unknown> | null;
  error: string | null;
}

export interface TimelinePoint {
  timestamp_s: number;
  presence_probability: number;
  los_probability?: number;
  position_norm: number;
  position_bins: number[];
  signal_energy: number;
}

export interface AnalysisResult {
  analysis_id: string;
  state: State;
  confidence: number;
  presence_probability: number | null;
  position_range_norm: [number, number] | null;
  position_range_m: [number, number] | null;
  direction: string;
  speed_class: string;
  velocity_track_units_per_s: number | null;
  lead_time_s?: number | null;
  shadow_onset_s?: number | null;
  los_onset_s?: number | null;
  los_detected?: boolean;
  entry_source?: string;
  hidden_source_estimate?: {
    status: "estimated" | "unavailable" | "calibration_required";
    calibrated: boolean;
    limitation: string;
    reason?: string;
  } | null;
  reasons: string[];
  sun?: SunPosition;
  illumination?: { source: "sun" | "streetlamp" | "unknown"; selected_pool_brightness: number | null };
  timeline: TimelinePoint[];
  metrics: Record<string, number | string | null>;
  baselines: Record<string, { presence_probability: number; state: string }>;
  scene_assessment: {
    edge: number[] | null;
    roi: number[] | null;
    entry_zone?: number[] | null;
    coverage_score: number;
    calibration_stability: number;
    roi_score: number;
    roi_source?: string;
    reasons: string[];
  };
  confidence_factors: Record<string, number>;
  model: Record<string, unknown>;
  evidence?: { kind: string; limitation: string };
  visualization?: { available: boolean; filename: string | null };
  visualizations?: { corner_trial_available: boolean; hidden_path_available: boolean };
}
