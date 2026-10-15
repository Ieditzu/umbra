import { useState } from "react";
import { request } from "./api";
import type { SceneDetail } from "./types";

export function CameraSetup({ detail, disabled, onSaved, onNotice, onBusy }: {
  detail: SceneDetail;
  disabled: boolean;
  onSaved: () => Promise<void>;
  onNotice: (message: string) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [trialId, setTrialId] = useState("");
  const [saving, setSaving] = useState(false);
  const selected = detail.trials.find((trial) => trial.id === trialId) ?? detail.trials[0];
  const saved = detail.position_calibration;
  async function calibrate() {
    if (!selected || saving) return;
    setSaving(true);
    onBusy(true);
    onNotice("");
    try {
      await request(`/scenes/${detail.scene.id}/position-calibration`, { method: "POST", body: JSON.stringify({ trial_id: selected.id }) });
      await onSaved();
      onNotice("Camera mapping saved. Use the same camera view, light and walking route for live detection.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Could not calibrate camera");
    } finally {
      setSaving(false);
      onBusy(false);
    }
  }
  async function clear() {
    if (!window.confirm("Remove the saved position mapping? Your videos and analyses will be kept.")) return;
    setSaving(true);
    onBusy(true);
    try {
      await request(`/scenes/${detail.scene.id}/position-calibration`, { method: "DELETE" });
      await onSaved();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Could not remove calibration");
    } finally {
      setSaving(false);
      onBusy(false);
    }
  }
  return <details className="panel side-card camera-setup" open={!saved}>
    <summary className="side-summary"><h2>Camera setup</h2><span>{saved ? "Saved" : "Needed"}</span></summary>
    <p>Use a prior walk with an empty opening, then the person and complete shadow visible together. This saves an experimental position mapping for this camera, light and route.</p>
    <label>Calibration walk<select value={selected?.id ?? ""} disabled={disabled || saving} onChange={(event) => setTrialId(event.target.value)}>
      {!selected && <option value="">Add a trial first</option>}
      {detail.trials.map((trial) => <option key={trial.id} value={trial.id}>{trial.name}</option>)}
    </select></label>
    <button className="button secondary" disabled={disabled || saving || !selected} onClick={() => void calibrate()}>{saving ? "Calibrating…" : saved ? "Recalibrate from walk" : "Calibrate from walk"}</button>
    {saved && <><p>{saved.model.pair_count} visible pairs · internal check {saved.model.internal_check_error_px.toFixed(1)} px. This is not independent live validation.</p><button className="text-button" disabled={disabled || saving} onClick={() => void clear()}>Remove mapping</button></>}
  </details>;
}
