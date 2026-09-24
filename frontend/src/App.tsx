import { FormEvent, MouseEvent, RefObject, useEffect, useMemo, useRef, useState } from "react";
import { API, request } from "./api";
import type {
  AnalysisResult,
  Job,
  ManualGroundTruth,
  ManualPoint,
  ManualRegion,
  ManualTrackSample,
  MediaAsset,
  MediaRole,
  Scene,
  SceneDetail,
  State,
  Trial
} from "./types";

const roleLabel: Record<MediaRole, string> = {
  calibration: "Empty-scene calibration",
  main: "Corner trial (shadow, then person)",
  ground_truth: "Hidden-path ground truth"
};

const stateLabel: Record<State, string> = {
  no_coverage: "No coverage",
  no_reliable_signal: "No reliable signal",
  possible_motion: "Shadow possible",
  strong_motion: "Shadow approaching",
  early_warning: "Early warning",
  entered_view: "Entered view"
};

const sleep = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

type SceneForm = {
  name: string;
  notes: string;
  latitude: string;
  longitude: string;
  recorded_at: string;
};

function localDateTimeValue(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function newSceneForm(): SceneForm {
  return { name: "", notes: "", latitude: "", longitude: "", recorded_at: localDateTimeValue() };
}

function fmt(value: number | null | undefined, digits = 2): string {
  return typeof value === "number" ? value.toFixed(digits) : "—";
}

function StatePill({ state }: { state: State }) {
  return <span className={`state-pill ${state}`}>{stateLabel[state]}</span>;
}

function LiveShadowOverlay({
  videoRef,
  calibrationId
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  calibrationId?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    const overlay = canvasRef.current;
    if (!video || !overlay || !calibrationId) return;

    // Compare the live feed with the saved empty-scene view. Only sustained
    // darkening in the lower image is treated as shadow evidence.
    const reference = document.createElement("video");
    reference.muted = true;
    reference.playsInline = true;
    reference.src = `${API}/media/${calibrationId}/stream`;
    const referenceCanvas = document.createElement("canvas");
    const referenceContext = referenceCanvas.getContext("2d", { willReadFrequently: true });
    const processCanvas = document.createElement("canvas");
    processCanvas.width = 192;
    processCanvas.height = 108;
    const processContext = processCanvas.getContext("2d", { willReadFrequently: true });
    const context = overlay.getContext("2d");
    if (!referenceContext || !processContext || !context) return;

    let referencePixels: Uint8ClampedArray | null = null;
    let frame = 0;
    let lastProcess = 0;
    let active = true;
    let track: Array<{ x: number; y: number; t: number }> = [];
    const loadReference = () => {
      if (!active || !reference.videoWidth) return;
      referenceCanvas.width = processCanvas.width;
      referenceCanvas.height = processCanvas.height;
      referenceContext.drawImage(reference, 0, 0, referenceCanvas.width, referenceCanvas.height);
      referencePixels = referenceContext.getImageData(0, 0, referenceCanvas.width, referenceCanvas.height).data;
      reference.pause();
    };
    reference.addEventListener("loadeddata", loadReference, { once: true });
    reference.load();

    const draw = (now: number) => {
      if (!active) return;
      frame = requestAnimationFrame(draw);
      if (!referencePixels || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || now - lastProcess < 100) return;
      lastProcess = now;
      const width = processCanvas.width;
      const height = processCanvas.height;
      processContext.drawImage(video, 0, 0, width, height);
      const live = processContext.getImageData(0, 0, width, height).data;
      let weight = 0;
      let sx = 0;
      let sy = 0;
      let minX = width, minY = height, maxX = 0, maxY = 0;
      // Ignore the upper scene; pavement shadows usually occupy the lower half.
      for (let y = 52; y < height - 2; y += 2) {
        for (let x = 2; x < width - 2; x += 2) {
          const i = (y * width + x) * 4;
          const base = (referencePixels[i] * 0.299 + referencePixels[i + 1] * 0.587 + referencePixels[i + 2] * 0.114);
          const current = (live[i] * 0.299 + live[i + 1] * 0.587 + live[i + 2] * 0.114);
          const darkening = base - current;
          if (base > 38 && darkening > 26) {
            const w = Math.min(100, darkening - 18);
            weight += w; sx += x * w; sy += y * w;
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          }
        }
      }
      const stamp = performance.now();
      const enoughEvidence = weight > 1800 && maxX - minX > 5 && maxY - minY > 3;
      if (enoughEvidence) {
        track.push({ x: sx / weight / width, y: sy / weight / height, t: stamp });
        track = track.filter((point) => stamp - point.t < 2200).slice(-20);
      } else if (track.length && stamp - track[track.length - 1].t > 450) {
        track = [];
      }

      const rect = overlay.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const canvasWidth = Math.max(1, Math.round(rect.width * dpr));
      const canvasHeight = Math.max(1, Math.round(rect.height * dpr));
      if (overlay.width !== canvasWidth || overlay.height !== canvasHeight) {
        overlay.width = canvasWidth; overlay.height = canvasHeight;
      }
      context.clearRect(0, 0, canvasWidth, canvasHeight);
      context.save(); context.scale(canvasWidth, canvasHeight);
      if (track.length >= 2) {
        context.strokeStyle = "rgba(116, 235, 194, .9)"; context.lineWidth = 0.004;
        context.beginPath(); track.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)); context.stroke();
      }
      if (enoughEvidence) {
        context.strokeStyle = "#75f0c2"; context.lineWidth = 0.004;
        context.strokeRect(minX / width, minY / height, (maxX - minX) / width, (maxY - minY) / height);
      }
      if (track.length >= 4) {
        const first = track[0], last = track[track.length - 1];
        const elapsed = Math.max(0.15, (last.t - first.t) / 1000);
        const dx = (last.x - first.x) / elapsed;
        const dy = (last.y - first.y) / elapsed;
        const lead = Math.min(0.65, Math.max(0.2, elapsed * 0.35));
        const px = Math.max(0.04, Math.min(0.96, last.x + dx * lead));
        const py = Math.max(0.25, Math.min(0.88, last.y + dy * lead));
        // A simple moving position marker: its coordinates come from measured
        // shadow motion, not a time-based walking animation.
        context.setLineDash([0.012, 0.009]); context.strokeStyle = "rgba(255, 208, 105, .88)"; context.lineWidth = 0.003;
        context.beginPath(); context.moveTo(last.x, last.y); context.lineTo(px, py); context.stroke(); context.setLineDash([]);
        context.fillStyle = "rgba(255, 208, 105, .2)"; context.strokeStyle = "#ffd069"; context.lineWidth = 0.004;
        context.beginPath(); context.ellipse(px, py - 0.07, 0.025, 0.025, 0, 0, Math.PI * 2); context.fill(); context.stroke();
        context.beginPath(); context.moveTo(px, py - 0.045); context.lineTo(px, py + 0.035); context.moveTo(px - 0.025, py - 0.015); context.lineTo(px + 0.025, py - 0.015); context.moveTo(px, py + 0.035); context.lineTo(px - 0.02, py + 0.07); context.moveTo(px, py + 0.035); context.lineTo(px + 0.02, py + 0.07); context.stroke();
      }
      context.restore();
    };
    frame = requestAnimationFrame(draw);
    return () => {
      active = false; cancelAnimationFrame(frame); reference.pause(); reference.removeAttribute("src"); reference.load();
      reference.removeEventListener("loadeddata", loadReference);
    };
  }, [videoRef, calibrationId]);

  return <><canvas ref={canvasRef} className="live-overlay" aria-hidden="true" />{calibrationId ? <span className="live-overlay-label">shadow-driven movement estimate</span> : <span className="live-overlay-label">record empty calibration to enable estimate</span>}</>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </article>
  );
}

function SignalChart({ result }: { result: AnalysisResult }) {
  const points = result.timeline.slice(-80);
  const maximum = Math.max(...points.map((point) => point.presence_probability), 0.01);
  return (
    <div className="signal-chart" aria-label="Hidden-motion probability over time">
      {points.map((point) => (
        <span
          key={point.timestamp_s}
          title={`${point.timestamp_s.toFixed(1)} seconds: ${(point.presence_probability * 100).toFixed(0)}%`}
          style={{ height: `${Math.max(3, (point.presence_probability / maximum) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function ResultPanel({ result }: { result: AnalysisResult }) {
  const reportUrl = `${API}/analyses/${result.analysis_id}/report`;
  const predictionsUrl = `${API}/analyses/${result.analysis_id}/predictions`;
  const positions = result.position_range_m
    ? `${fmt(result.position_range_m[0])}–${fmt(result.position_range_m[1])} m`
    : result.position_range_norm
      ? `${fmt(result.position_range_norm[0])}–${fmt(result.position_range_norm[1])} track`
      : "—";
  return (
    <section className="results panel" aria-live="polite">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Evidence review</p>
          <h2>Confidence-qualified result</h2>
        </div>
        <StatePill state={result.state} />
      </div>
      <div className="metrics-grid">
        <Metric label="Confidence" value={`${Math.round(result.confidence * 100)}%`} />
        <Metric label="Shadow evidence" value={result.presence_probability == null ? "—" : `${Math.round(result.presence_probability * 100)}%`} />
        <Metric label="Lead time" value={result.lead_time_s == null ? "—" : `${result.lead_time_s.toFixed(2)} s`} detail={result.los_detected ? result.entry_source === "manual_review" ? "shadow → reviewed body entry" : "shadow → line of sight" : "person not yet in frame"} />
        <Metric label="Direction" value={result.direction.replaceAll("_", " ")} detail={result.speed_class} />
      </div>
      <p className="privacy-note"><strong>{result.evidence?.kind === "synthetic" ? "Synthetic demonstration" : "Experimental video analysis"}.</strong> {result.evidence?.limitation ?? "Field performance has not been established."} Lead time is pavement-shadow onset versus the first frame the walker enters this camera.</p>
      {typeof result.metrics.validation_note === "string" && <p className="hint">{result.metrics.validation_note}</p>}
      <div className="chart-card">
        <div className="chart-label"><span>Pavement-shadow evidence</span><span>{result.timeline.length} samples</span></div>
        <SignalChart result={result} />
      </div>
      <div className="result-columns">
        <div>
          <h3>Why this result</h3>
          <ul className="reason-list">{result.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        </div>
        <div>
          <h3>Scene setup</h3>
          <dl className="compact-dl">
            <div><dt>Coverage</dt><dd>{fmt(result.scene_assessment.coverage_score)}</dd></div>
            <div><dt>Calibration stability</dt><dd>{fmt(result.scene_assessment.calibration_stability)}</dd></div>
            <div><dt>ROI quality</dt><dd>{fmt(result.scene_assessment.roi_score)}</dd></div>
            <div><dt>Shadow region</dt><dd>{result.scene_assessment.roi_source === "manual_phone" ? "Selected on phone video" : result.scene_assessment.roi ? "Automatic" : "None"}</dd></div>
            <div><dt>Entry time</dt><dd>{result.los_detected ? result.entry_source === "manual_review" ? "Reviewed on phone shot" : "Automatic" : "Not marked"}</dd></div>
          </dl>
        </div>
      </div>
      {(result.visualizations?.corner_trial_available || result.visualization?.available) && <section className="visualization-card">
        <h3>What Umbra saw — moving video evidence</h3>
        <div className={`visualization-grid ${result.visualizations?.hidden_path_available ? "two-videos" : ""}`}>
          <div><strong>Corner trial · warning camera</strong><p>Boxes follow detected shadow and visible-body evidence. Where the wall edge is clear, a simple anonymous position marker moves along the shadow-derived estimate. It does not animate a gait or claim to detect the hidden person; ambiguous geometry shows relative shadow travel only.</p><video key={`corner-${result.analysis_id}`} controls preload="metadata" className="analysis-video"><source src={`${API}/analyses/${result.analysis_id}/visualization`} type="video/mp4" /></video><a className="button secondary video-download" href={`${API}/analyses/${result.analysis_id}/visualization`} download={`umbra-corner-trial-${result.analysis_id}.mp4`}>Download corner trial</a></div>
          {result.visualizations?.hidden_path_available && <div><strong>Hidden path · reference camera</strong><p>Shows the reviewed corner/far route line and the manually reviewed walker position when you saved labels.</p><video key={`hidden-${result.analysis_id}`} controls preload="metadata" className="analysis-video"><source src={`${API}/analyses/${result.analysis_id}/hidden-path-visualization`} type="video/mp4" /></video><a className="button secondary video-download" href={`${API}/analyses/${result.analysis_id}/hidden-path-visualization`} download={`umbra-hidden-path-${result.analysis_id}.mp4`}>Download hidden path</a></div>}
        </div>
      </section>}
      <h3>Method comparison</h3>
      <div className="baseline-grid">
        {Object.entries(result.baselines).map(([name, baseline]) => (
          <div className="baseline" key={name}>
            <span>{name.replaceAll("_", " ")}</span>
            <strong>{Math.round(baseline.presence_probability * 100)}%</strong>
            <small>{baseline.state.replaceAll("_", " ")}</small>
          </div>
        ))}
      </div>
      {typeof result.model.name === "string" && (
        <p className="model-note">
          Model: <strong>{result.model.name.replaceAll("_", " ")}</strong>
          {typeof result.model.role === "string" && ` · ${result.model.role}`}
        </p>
      )}
      <div className="export-row">
        <a className="button secondary" href={`${API}/analyses/${result.analysis_id}/bundle`}>Download evidence ZIP</a>
        <a className="button secondary" href={reportUrl} target="_blank" rel="noreferrer">Open HTML report</a>
        <a className="button ghost" href={predictionsUrl}>Download predictions CSV</a>
      </div>
      <p className="privacy-note">Umbra uses the first visible body part to timestamp entry. It does not identify a person, reconstruct appearance, or infer pose.</p>
    </section>
  );
}

function MediaSlot({
  role,
  media,
  disabled,
  onUpload
}: {
  role: MediaRole;
  media?: MediaAsset;
  disabled: boolean;
  onUpload: (role: MediaRole, file: File) => void;
}) {
  return (
    <label className={`media-slot ${media ? "complete" : ""} ${disabled ? "disabled" : ""}`}>
      <input
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onUpload(role, file);
          event.currentTarget.value = "";
        }}
      />
      <span className="slot-icon">{media ? "✓" : "+"}</span>
      <span><strong>{roleLabel[role]}</strong><small>{media ? media.original_name : "Import a local video"}</small></span>
    </label>
  );
}

type ReviewMode = "corner" | "far" | "walker";

function emptyManualReview(trial: Trial): ManualGroundTruth {
  return {
    trial_id: trial.id,
    ground_truth_media_id: trial.ground_truth_media_id ?? "",
    corner: null,
    far_point: null,
    samples: [],
    main_entry_timestamp_s: null,
    main_shadow_region: null
  };
}

function ManualReview({ trial, busy, onClose, onNotice }: {
  trial: Trial;
  busy: boolean;
  onClose: () => void;
  onNotice: (notice: string) => void;
}) {
  const [review, setReview] = useState<ManualGroundTruth>(() => emptyManualReview(trial));
  const [mode, setMode] = useState<ReviewMode>("corner");
  const [reviewSource, setReviewSource] = useState<"drone" | "phone">("phone");
  const [shadowStart, setShadowStart] = useState<ManualPoint | null>(null);
  const [selectingShadow, setSelectingShadow] = useState(false);
  const [truthTime, setTruthTime] = useState(0);
  const [mainTime, setMainTime] = useState(0);
  const [truthAspect, setTruthAspect] = useState(16 / 9);
  const [mainAspect, setMainAspect] = useState(16 / 9);
  const [saving, setSaving] = useState(false);
  const [loadingReview, setLoadingReview] = useState(true);
  const truthRef = useRef<HTMLVideoElement>(null);
  const mainRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let active = true;
    setLoadingReview(true);
    setReview(emptyManualReview(trial));
    setMode("corner");
    setReviewSource("phone");
    setShadowStart(null);
    setSelectingShadow(false);
    void request<ManualGroundTruth>(`/trials/${trial.id}/manual-ground-truth`)
      .then((saved) => { if (active) setReview(saved); })
      .catch(() => undefined)
      .finally(() => { if (active) setLoadingReview(false); });
    return () => { active = false; };
  }, [trial.id]);

  function pointFromClick(event: MouseEvent<HTMLElement>, video: HTMLVideoElement | null): ManualPoint {
    const bounds = (video ?? event.currentTarget).getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height))
    };
  }

  function markTruth(event: MouseEvent<HTMLElement>) {
    const point = pointFromClick(event, truthRef.current);
    if (mode === "corner") {
      setReview((current) => ({ ...current, corner: point }));
      setMode("far");
    } else if (mode === "far") {
      setReview((current) => ({ ...current, far_point: point }));
      setMode("walker");
    } else {
      const sample: ManualTrackSample = { ...point, timestamp_s: truthRef.current?.currentTime ?? truthTime };
      setReview((current) => ({
        ...current,
        samples: [...current.samples.filter((item) => Math.abs(item.timestamp_s - sample.timestamp_s) > 0.12), sample]
          .sort((first, second) => first.timestamp_s - second.timestamp_s)
      }));
    }
  }

  function markEntry() {
    const timestamp = mainRef.current?.currentTime ?? mainTime;
    setReview((current) => ({ ...current, main_entry_timestamp_s: timestamp }));
  }

  function markShadowRegion(event: MouseEvent<HTMLElement>) {
    const point = pointFromClick(event, mainRef.current);
    if (!shadowStart) {
      setShadowStart(point);
      return;
    }
    const region: ManualRegion = {
      x: Math.min(shadowStart.x, point.x),
      y: Math.min(shadowStart.y, point.y),
      width: Math.abs(point.x - shadowStart.x),
      height: Math.abs(point.y - shadowStart.y)
    };
    if (region.width <= 0.02 || region.height <= 0.02) {
      onNotice("Select a larger pavement area with two opposite corners.");
      setShadowStart(null);
      return;
    }
    setReview((current) => ({ ...current, main_shadow_region: region }));
    setShadowStart(null);
    setSelectingShadow(false);
  }

  async function save() {
    const truthReady = review.corner && review.far_point && review.samples.length > 0;
    if (!truthReady && !review.main_shadow_region && review.main_entry_timestamp_s === null) {
      onNotice("Select the shadow pavement on the phone shot or add drone route labels before saving.");
      return;
    }
    setSaving(true);
    try {
      const saved = await request<ManualGroundTruth>(`/trials/${trial.id}/manual-ground-truth`, {
        method: "PUT",
        body: JSON.stringify(review)
      });
      setReview(saved);
      onNotice("Review saved. Re-run analysis to use the phone shadow area and any drone labels.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Could not save manual labels");
    } finally {
      setSaving(false);
    }
  }

  const points: Array<{ label: string; point: ManualPoint; className: string }> = [
    ...(review.corner ? [{ label: "Corner", point: review.corner, className: "corner" }] : []),
    ...(review.far_point ? [{ label: "Far", point: review.far_point, className: "far" }] : []),
    ...review.samples.map((sample, index) => ({ label: `Walker ${index + 1}`, point: sample, className: "walker" }))
  ];
  const disabled = busy || saving || loadingReview;

  return <section className="manual-review panel">
    <div className="panel-heading"><div><p className="eyebrow">Scene review</p><h2>Manual review — {trial.name}</h2></div><button className="button ghost" disabled={disabled} onClick={onClose}>Close</button></div>
    <div className="review-source-tabs"><button className={`button ${reviewSource === "phone" ? "primary" : "secondary"}`} onClick={() => setReviewSource("phone")}>Phone shot · shadow</button><button className={`button ${reviewSource === "drone" ? "primary" : "secondary"}`} onClick={() => setReviewSource("drone")}>Drone shot · route truth</button></div>
    <div className="review-grid">
      <div className={`review-pane ${reviewSource === "drone" ? "" : "inactive"}`}>
        <p className="hint">Pause the drone video. Click the route corner and far endpoint, then mark the walker’s feet in several frames.</p>
        <div className="review-toolbar">
          {(["corner", "far", "walker"] as ReviewMode[]).map((item) => <button key={item} className={`button ${mode === item ? "primary" : "secondary"}`} disabled={disabled} onClick={() => setMode(item)}>Mark {item === "far" ? "far point" : item}</button>)}
          <button className="text-button" disabled={disabled || review.samples.length === 0} onClick={() => setReview((current) => ({ ...current, samples: current.samples.slice(0, -1) }))}>Undo last walker</button>
        </div>
        <div className="review-video" style={{ maxWidth: `${Math.round(360 * truthAspect)}px` }}>
          <video ref={truthRef} controls src={`${API}/media/${trial.ground_truth_media_id}/stream`} onLoadedMetadata={(event) => setTruthAspect(event.currentTarget.videoWidth / event.currentTarget.videoHeight)} onTimeUpdate={(event) => setTruthTime(event.currentTarget.currentTime)} />
          <button className="review-click-surface" type="button" onClick={markTruth} aria-label={`Click truth video to mark ${mode}`} />
          {points.map(({ label, point, className }) => <span key={`${label}-${point.x}-${point.y}`} className={`manual-point ${className}`} style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}>{label}</span>)}
        </div>
        <p className="review-time">Truth frame: {truthTime.toFixed(2)} s · mode: {mode}</p>
      </div>
      <div className={`review-pane ${reviewSource === "phone" ? "" : "inactive"}`}>
        <p className="hint">Select the sunlit pavement where the approaching shadow first appears. Use two clicks for opposite corners of the area. Pause when any part of the walker first enters this camera and mark the time. Umbra estimates the hidden-side overlay automatically when it can find a nearby wall edge.</p>
        <div className="review-toolbar"><button className={`button ${selectingShadow ? "primary" : "secondary"}`} disabled={disabled} onClick={() => { setSelectingShadow(true); setShadowStart(null); }}>Select shadow pavement</button><button className="text-button" disabled={disabled || !review.main_shadow_region} onClick={() => setReview((current) => ({ ...current, main_shadow_region: null }))}>Clear area</button></div>
        <div className="review-video" style={{ maxWidth: `${Math.round(360 * mainAspect)}px` }}><video ref={mainRef} controls src={`${API}/media/${trial.main_media_id}/stream`} onLoadedMetadata={(event) => setMainAspect(event.currentTarget.videoWidth / event.currentTarget.videoHeight)} onTimeUpdate={(event) => setMainTime(event.currentTarget.currentTime)} />
          {selectingShadow && <button className="review-click-surface" type="button" onClick={markShadowRegion} aria-label="Click two corners of the shadow pavement area" />}
          {review.main_shadow_region && <span className="manual-region" style={{ left: `${review.main_shadow_region.x * 100}%`, top: `${review.main_shadow_region.y * 100}%`, width: `${review.main_shadow_region.width * 100}%`, height: `${review.main_shadow_region.height * 100}%` }} />}
          {shadowStart && <span className="manual-point corner" style={{ left: `${shadowStart.x * 100}%`, top: `${shadowStart.y * 100}%` }}>Start</span>}
        </div>
        <p className="review-time">Phone frame: {mainTime.toFixed(2)} s · shadow area: {review.main_shadow_region ? "selected" : selectingShadow ? shadowStart ? "click opposite corner" : "click first corner" : "not selected"}</p>
        <div className="review-toolbar"><button className="button primary" disabled={disabled} onClick={markEntry}>Use current time as body entry</button><button className="text-button" disabled={disabled || review.main_entry_timestamp_s === null} onClick={() => setReview((current) => ({ ...current, main_entry_timestamp_s: null }))}>Clear entry time</button></div>
        <p className="review-time">Body entry: {review.main_entry_timestamp_s === null ? "not set" : `${review.main_entry_timestamp_s.toFixed(2)} s`}. The first 1.8 seconds of the phone shot should contain empty pavement.</p>
      </div>
    </div>
    <div className="review-footer"><span>{loadingReview ? "Loading saved review…" : review.main_shadow_region ? "Phone shadow area ready" : "No phone shadow area"} · {review.samples.length} drone points</span><button className="button primary" disabled={disabled} onClick={() => void save()}>{saving ? "Saving…" : "Save review"}</button></div>
  </section>;
}

export default function App() {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [detail, setDetail] = useState<SceneDetail | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [notice, setNotice] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [mlAvailable, setMlAvailable] = useState(false);
  const [form, setForm] = useState<SceneForm>(newSceneForm);
  const [locationStatus, setLocationStatus] = useState<"checking" | "ready" | "unavailable">("checking");
  const [trialName, setTrialName] = useState("Trial 1");
  const [trackLength, setTrackLength] = useState("");
  const [manualTrialId, setManualTrialId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [captureRole, setCaptureRole] = useState<MediaRole | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const mediaByRole = useMemo(() => {
    const source = detail?.media ?? [];
    return Object.fromEntries(source.map((media) => [media.role, media])) as Partial<Record<MediaRole, MediaAsset>>;
  }, [detail]);

  async function refreshScenes() {
    const values = await request<Scene[]>("/scenes");
    setScenes(values);
  }

  async function loadScene(sceneId: string) {
    const next = await request<SceneDetail>(`/scenes/${sceneId}`);
    setDetail(next);
    setResult(null);
    setManualTrialId(null);
  }

  async function deleteScene(scene: Scene) {
    const accepted = window.confirm(
      `Delete “${scene.name}”? This permanently removes its footage, trials, and local reports.`
    );
    if (!accepted) return;
    setBusy(true);
    try {
      await request<{ scene_id: string }>(`/scenes/${scene.id}`, { method: "DELETE" });
      if (detail?.scene.id === scene.id) {
        stopCamera();
        setDetail(null);
        setResult(null);
        setJob(null);
      }
      await refreshScenes();
      setNotice(`Deleted “${scene.name}” and its local data.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not delete scene");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTrial(trial: Trial) {
    const accepted = window.confirm(
      `Delete trial “${trial.name}”? Its saved analyses and generated videos will be removed. Your uploaded videos stay in this scene.`
    );
    if (!accepted || !detail) return;
    setBusy(true);
    try {
      await request<{ trial_id: string }>(`/trials/${trial.id}`, { method: "DELETE" });
      if (manualTrialId === trial.id) setManualTrialId(null);
      setResult(null);
      await loadScene(detail.scene.id);
      setNotice(`Deleted trial “${trial.name}”. The uploaded videos were kept.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not delete trial");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAnalysis(analysisId: string, trialName: string) {
    const accepted = window.confirm(`Delete this saved analysis for “${trialName}”? Its report and annotated videos will be removed.`);
    if (!accepted || !detail) return;
    setBusy(true);
    try {
      await request<{ analysis_id: string }>(`/analyses/${analysisId}`, { method: "DELETE" });
      if (result?.analysis_id === analysisId) setResult(null);
      await loadScene(detail.scene.id);
      setNotice(`Deleted saved analysis for “${trialName}”.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not delete analysis");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void Promise.all([
      refreshScenes(),
      request<{ ml_available: boolean }>("/health").then((health) => setMlAvailable(health.ml_available))
    ]).catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Could not load Umbra"));
    fillBrowserMetadata(true);
    return () => streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function watchJob(jobId: string) {
    for (let attempt = 0; attempt < 180; attempt += 1) {
      await sleep(900);
      const next = await request<Job>(`/jobs/${jobId}`);
      setJob(next);
      if (next.status === "succeeded") {
        const analysisId = next.result?.analysis_id;
        if (typeof analysisId === "string") {
          const payload = await request<{ result: AnalysisResult }>(`/analyses/${analysisId}`);
          const sceneId = next.result?.scene_id;
          if (typeof sceneId === "string") await loadScene(sceneId);
          setResult(payload.result);
          setNotice("Local analysis complete. Review the evidence and export below.");
        } else if (next.kind === "synthetic_training") {
          setNotice("Synthetic temporal model checkpoint is ready. New analyses will show it as advisory evidence.");
        } else {
          setNotice("Local job complete.");
        }
        return;
      }
      if (next.status === "failed") {
        throw new Error(next.error?.split("\n")[0] ?? "The background job failed");
      }
    }
    throw new Error("The analysis took too long to finish. Check the local server log.");
  }

  async function beginDemo() {
    setBusy(true);
    setNotice("");
    try {
      const next = await request<Job>("/demo", {
        method: "POST",
        body: JSON.stringify({ lighting: "directional", seed: 7, frames: 120, target_present: true })
      });
      setJob(next);
      await watchJob(next.id);
      await refreshScenes();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create the synthetic demo");
    } finally {
      setBusy(false);
    }
  }

  async function trainModel() {
    if (!mlAvailable) {
      setNotice("Install the ML extra first: uv sync --extra dev --extra ml");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const next = await request<Job>("/models/train", {
        method: "POST",
        body: JSON.stringify({ examples: 24, epochs: 4 })
      });
      setJob(next);
      await watchJob(next.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not train the temporal model");
    } finally {
      setBusy(false);
    }
  }

  async function createScene(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const scene = await request<Scene>("/scenes", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          notes: form.notes,
          latitude: form.latitude ? Number(form.latitude) : null,
          longitude: form.longitude ? Number(form.longitude) : null,
          recorded_at: new Date(form.recorded_at || localDateTimeValue()).toISOString()
        })
      });
      await refreshScenes();
      await loadScene(scene.id);
      setForm(newSceneForm());
      fillBrowserMetadata(true);
      setNotice("Scene created. Import footage or record calibration and main-camera clips.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create scene");
    } finally {
      setBusy(false);
    }
  }

  function fillBrowserMetadata(silent = false) {
    setForm((current) => ({ ...current, recorded_at: localDateTimeValue() }));
    if (!navigator.geolocation) {
      setLocationStatus("unavailable");
      if (!silent) setNotice("This browser does not provide location permission. Enter approximate coordinates instead.");
      return;
    }
    setLocationStatus("checking");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((current) => ({
          ...current,
          latitude: String(position.coords.latitude),
          longitude: String(position.coords.longitude)
        }));
        setLocationStatus("ready");
        if (!silent) setNotice("Browser time and location updated for sun metadata.");
      },
      () => {
        setLocationStatus("unavailable");
        if (!silent) setNotice("Location was not granted. You can type approximate latitude and longitude.");
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 }
    );
  }

  async function upload(role: MediaRole, file: File) {
    if (!detail) return;
    setBusy(true);
    setNotice(`Uploading ${roleLabel[role].toLowerCase()} locally…`);
    try {
      const body = new FormData();
      body.append("file", file);
      await request<MediaAsset>(`/scenes/${detail.scene.id}/media/${role}`, { method: "POST", body });
      await loadScene(detail.scene.id);
      setNotice(`${roleLabel[role]} is ready.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not import video");
    } finally {
      setBusy(false);
    }
  }

  async function startCamera() {
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: true });
      } catch {
        // A desktop browser may not expose an environment-facing camera or microphone.
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setStreaming(true);
      setNotice("Camera ready. Record an empty calibration first, then a visible-side trial.");
    } catch {
      setNotice("Camera or microphone permission was not granted. Import a local video instead.");
    }
  }

  function stopCamera() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStreaming(false);
  }

  function record(role: MediaRole) {
    const stream = streamRef.current;
    if (!stream || !detail) return;
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus") ? "video/webm;codecs=vp8,opus" : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
    recorder.onstop = () => {
      const file = new File([new Blob(chunksRef.current, { type: mimeType })], `${role}-${Date.now()}.webm`, { type: mimeType });
      setCaptureRole(null);
      void upload(role, file);
    };
    recorderRef.current = recorder;
    recorder.start();
    setCaptureRole(role);
    setNotice(`Recording ${roleLabel[role].toLowerCase()}…`);
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  async function createTrial() {
    if (!detail || !mediaByRole.calibration || !mediaByRole.main) return;
    setBusy(true);
    try {
      const trial = await request<Trial>(`/scenes/${detail.scene.id}/trials`, {
        method: "POST",
        body: JSON.stringify({
          name: trialName,
          calibration_media_id: mediaByRole.calibration.id,
          main_media_id: mediaByRole.main.id,
          ground_truth_media_id: mediaByRole.ground_truth?.id ?? null,
          track_length_m: trackLength ? Number(trackLength) : null
        })
      });
      await loadScene(detail.scene.id);
      setNotice(`Trial “${trial.name}” is ready to analyse.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create trial");
    } finally {
      setBusy(false);
    }
  }

  async function analyse(trial: Trial) {
    setBusy(true);
    setNotice("");
    try {
      const next = await request<Job>(`/trials/${trial.id}/analysis`, { method: "POST", body: JSON.stringify({ include_baselines: true }) });
      setJob(next);
      await watchJob(next.id);
      if (detail) setDetail(await request<SceneDetail>(`/scenes/${detail.scene.id}`));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not analyse trial");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand"><span className="brand-mark">◒</span><span>UMBRA</span><small>Local research workspace</small></div>
        <div className="app-actions">
          <span className="local-status">● Local only</span>
          <button className="button secondary" disabled={busy || !mlAvailable} title={mlAvailable ? "Pretrain the compact temporal model locally" : "Run uv sync --extra dev --extra ml to enable training"} onClick={() => void trainModel()}>{mlAvailable ? "Pretrain model" : "ML unavailable"}</button>
          <button className="button primary" disabled={busy} onClick={() => void beginDemo()}>{busy ? "Working…" : "Run demo"}</button>
        </div>
      </header>

      {notice && <div className={`notice ${notice.includes("complete") || notice.includes("ready") ? "good" : ""}`}>{notice}</div>}
      {job && job.status !== "succeeded" && <section className="job-card"><div><strong>{job.message}</strong><span>{Math.round(job.progress * 100)}%</span></div><progress value={job.progress} max="1" /></section>}

      <div className="app-layout">
        <aside className="sidebar">
          <div className="sidebar-heading"><span>Scenes</span><small>{scenes.length}</small></div>
          <div className="scene-list">
            {scenes.length === 0 && <p className="empty">No scenes yet.</p>}
            {scenes.map((scene) => (
              <div className={detail?.scene.id === scene.id ? "scene-item active" : "scene-item"} key={scene.id}>
                <button disabled={busy || captureRole !== null} className="scene" onClick={() => void loadScene(scene.id).catch((error: Error) => setNotice(error.message))}>
                  <strong>{scene.name}</strong><span>{new Date(scene.created_at).toLocaleString()}</span>
                </button>
                <button className="scene-delete" type="button" disabled={busy || captureRole !== null} title={`Permanently delete ${scene.name}`} aria-label={`Delete ${scene.name}`} onClick={() => void deleteScene(scene)}>Delete</button>
              </div>
            ))}
          </div>
          <details className="new-scene" open={scenes.length === 0}>
            <summary>New scene</summary>
            <form className="scene-form" onSubmit={(event) => void createScene(event)}>
              <label>Scene name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="North courtyard corner" /></label>
              <label>Notes<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Surface, weather, setup notes…" /></label>
              <div className="form-row"><label>Latitude<input type="number" step="any" value={form.latitude} onChange={(event) => setForm({ ...form, latitude: event.target.value })} /></label><label>Longitude<input type="number" step="any" value={form.longitude} onChange={(event) => setForm({ ...form, longitude: event.target.value })} /></label></div>
              <p className={`metadata-status ${locationStatus}`}>{locationStatus === "ready" ? "Browser location ready • stored locally with this scene" : locationStatus === "checking" ? "Getting browser location for sun metadata…" : "Location unavailable • enter coordinates if needed"}</p>
              <button className="text-button" type="button" onClick={() => fillBrowserMetadata()}>Refresh browser time & location</button>
              <label>Capture time (browser local)<input type="datetime-local" value={form.recorded_at} onChange={(event) => setForm({ ...form, recorded_at: event.target.value })} /></label>
              <button className="button primary" disabled={busy} type="submit">Create scene</button>
            </form>
          </details>
        </aside>

        <section className="workbench">
          {!detail && <section className="empty-workspace panel"><p className="eyebrow">No active scene</p><h1>Select a scene or create one.</h1><p>Use the sidebar to import calibration and trial footage, then run an analysis.</p></section>}
          {detail && <>
            <div className="active-scene"><div><p className="eyebrow">Active scene</p><h1>{detail.scene.name}</h1><p>{detail.scene.notes || "No setup notes"}</p></div><span>{detail.scene.latitude !== null ? "Sun metadata available" : "Visual geometry only"}</span></div>
            <div className="capture-grid">
              <section className="panel capture-panel">
                <div className="panel-heading"><h2>Camera capture</h2><span className="step">1</span></div>
                <div className="camera-stage">
                  <video ref={videoRef} autoPlay muted playsInline className={streaming ? "camera active" : "camera"} />
                  {streaming && <LiveShadowOverlay videoRef={videoRef} calibrationId={mediaByRole.calibration?.id} />}
                </div>
                <p className="hint">The live estimate tracks pavement-shadow movement against the empty calibration and projects a moving position marker. It does not infer a real pose through the wall; keep the camera fixed after calibration.</p>
                <div className="capture-actions">
                  {!streaming ? <button className="button secondary" disabled={busy} onClick={() => void startCamera()}>Enable camera</button> : <button className="button ghost" onClick={stopCamera}>Stop camera</button>}
                  {streaming && !captureRole && <><button className="button secondary" disabled={busy} onClick={() => record("calibration")}>Record calibration</button><button className="button primary" disabled={busy} onClick={() => record("main")}>Record trial</button></>}
                  {captureRole && <button className="button danger" onClick={stopRecording}>Stop {roleLabel[captureRole]}</button>}
                </div>
              </section>
              <section className="panel import-panel">
                <div className="panel-heading"><h2>Local files</h2><span className="step">2</span></div>
                <div className="media-list">
                  {(["calibration", "main", "ground_truth"] as MediaRole[]).map((role) => <MediaSlot key={role} role={role} media={mediaByRole[role]} disabled={busy} onUpload={upload} />)}
                </div>
                <p className="hint">Ground truth is optional for the warning. Use it to score hidden-path position. Marker 10 is the corner; 11 is far.</p>
              </section>
            </div>

            <section className="panel trial-panel">
              <div><h2>Trial</h2><p>Umbra selects a shadow region automatically. Use Manual review to choose the pavement on the phone shot if it picks the wrong place.</p></div>
              <div className="trial-controls"><label>Trial name<input value={trialName} onChange={(event) => setTrialName(event.target.value)} /></label><label>Track length (m)<input type="number" min="0" step="0.1" value={trackLength} onChange={(event) => setTrackLength(event.target.value)} /></label><button className="button primary" disabled={busy || !mediaByRole.calibration || !mediaByRole.main} onClick={() => void createTrial()}>Register</button></div>
            </section>
            {detail.trials.length > 0 && <section className="trial-list panel"><div className="panel-heading"><h2>Registered trials</h2><span>{detail.trials.length}</span></div>{detail.trials.map((trial) => <div className="trial-row" key={trial.id}><div><strong>{trial.name}</strong><span>{trial.ground_truth_media_id ? "Ground truth attached" : "Inference only"}</span></div><div className="trial-actions"><button className="button danger row-delete" disabled={busy} onClick={() => void deleteTrial(trial)}>Delete</button>{trial.ground_truth_media_id && <button className="button ghost" disabled={busy} onClick={() => setManualTrialId(trial.id)}>Manual review</button>}<button className="button secondary" disabled={busy} onClick={() => void analyse(trial)}>Analyse</button></div></div>)}</section>}
            {manualTrialId && detail.trials.find((trial) => trial.id === manualTrialId) && <ManualReview trial={detail.trials.find((trial) => trial.id === manualTrialId)!} busy={busy} onClose={() => setManualTrialId(null)} onNotice={setNotice} />}
            {(detail.analyses ?? []).length > 0 && <section className="trial-list panel"><h2>Saved analyses</h2>{detail.analyses.map((analysis) => <div className="trial-row" key={analysis.id}><div><strong>{analysis.trial_name}</strong><span>{new Date(analysis.created_at).toLocaleString()}</span></div><div className="trial-actions"><button className="button danger row-delete" disabled={busy} onClick={() => void deleteAnalysis(analysis.id, analysis.trial_name)}>Delete</button><button className="button secondary" disabled={busy} onClick={() => void request<{ result: AnalysisResult }>(`/analyses/${analysis.id}`).then((value) => setResult(value.result)).catch((error: Error) => setNotice(error.message))}>Review result</button></div></div>)}</section>}
          </>}
          {result && <ResultPanel result={result} />}
        </section>
      </div>
      <footer><span>Experimental sensing workspace · local research only</span><span>v0.1</span></footer>
    </main>
  );
}
