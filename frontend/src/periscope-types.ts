export type Region = { x: number; y: number; width: number; height: number };
export type Calibration = {
  id: string;
  diagnostics: { effective_rank: number; cell_count: number; condition_number: number; white_additivity_error: number; interpretation: string };
};
export type Reconstruction = {
  id: string; created_at: string; grid_side: number; model_id: string;
  status: "estimated" | "no_signal" | "measurement_mismatch";
  reason: string; values: number[] | null; fit_residual: number; measurement_file: string;
};
export type Experiment = {
  id: string; name: string; grid_side: number; region: Region;
  captures: Record<string, { file: string; captured_at: string }>;
  calibration: Calibration | null; results: Reconstruction[];
};

export function calibrationLabels(side: number): string[] {
  return ["dark", "white", ...Array.from({ length: side * side }, (_, i) => `cell-${i}`), "dark_check"];
}

export function labelName(label: string, side: number): string {
  if (label === "dark") return "Black reference";
  if (label === "white") return "White reference";
  if (label === "dark_check") return "Black reference · repeat";
  const index = Number(label.slice(5));
  return `Cell ${index + 1} · row ${Math.floor(index / side) + 1} column ${index % side + 1}`;
}

export function calibrationPattern(label: string, side: number): number[] {
  return Array.from({ length: side * side }, (_, i) => label === "white" || label === `cell-${i}` ? 1 : 0);
}
