import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { API, request } from "./api";
import type {
  AnalysisResult,
  Job,
  MediaAsset,
  MediaRole,
  Scene,
  SceneDetail,
  State,
  Trial
} from "./types";

const roleLabel: Record<MediaRole, string> = {
  calibration: "Empty-scene calibration",
  main: "Visible-side trial",
  ground_truth: "Ground-truth track"
};

const stateLabel: Record<State, string> = {
  no_coverage: "No coverage",
  no_reliable_signal: "No reliable signal",
  possible_motion: "Possible motion",
  strong_motion: "Strong motion"
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
        <Metric label="Motion evidence" value={result.presence_probability == null ? "—" : `${Math.round(result.presence_probability * 100)}%`} />
        <Metric label="Position range" value={positions} />
        <Metric label="Direction" value={result.direction.replaceAll("_", " ")} detail={result.speed_class} />
      </div>
      <p className="privacy-note"><strong>{result.evidence?.kind === "synthetic" ? "Synthetic demonstration" : "Experimental video analysis"}.</strong> {result.evidence?.limitation ?? "Field performance has not been established."} Position is an unvalidated image-derived track proxy.</p>
      <div className="chart-card">
        <div className="chart-label"><span>Temporal motion evidence</span><span>{result.timeline.length} samples</span></div>
        <SignalChart result={result} />
      </div>
      <div className="result-columns">
        <div>
          <h3>Why this result</h3>
          <ul className="reason-list">{result.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        </div>
        <div>
          <h3>Automatic scene setup</h3>
          <dl className="compact-dl">
            <div><dt>Coverage</dt><dd>{fmt(result.scene_assessment.coverage_score)}</dd></div>
            <div><dt>Calibration stability</dt><dd>{fmt(result.scene_assessment.calibration_stability)}</dd></div>
            <div><dt>ROI quality</dt><dd>{fmt(result.scene_assessment.roi_score)}</dd></div>
            <div><dt>Selected ROI</dt><dd>{result.scene_assessment.roi ? "Automatic" : "None"}</dd></div>
          </dl>
        </div>
      </div>
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
      <p className="privacy-note">Umbra reports coarse anonymous motion only. It does not identify a person, reconstruct appearance, or infer pose.</p>
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
                <video ref={videoRef} autoPlay muted playsInline className={streaming ? "camera active" : "camera"} />
                <p className="hint">Record an empty calibration, then a visible-side trial. Analysis starts after recording ends.</p>
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
                <p className="hint">Ground truth is optional for inference and required for position-error metrics. Marker 10 is the corner side; marker 11 is the far endpoint.</p>
              </section>
            </div>

            <section className="panel trial-panel">
              <div><h2>Trial</h2><p>Umbra auto-selects the edge and visible-side region. A poor scene returns no coverage instead of accepting a manual ROI.</p></div>
              <div className="trial-controls"><label>Trial name<input value={trialName} onChange={(event) => setTrialName(event.target.value)} /></label><label>Track length (m)<input type="number" min="0" step="0.1" value={trackLength} onChange={(event) => setTrackLength(event.target.value)} /></label><button className="button primary" disabled={busy || !mediaByRole.calibration || !mediaByRole.main} onClick={() => void createTrial()}>Register</button></div>
            </section>
            {detail.trials.length > 0 && <section className="trial-list panel"><div className="panel-heading"><h2>Registered trials</h2><span>{detail.trials.length}</span></div>{detail.trials.map((trial) => <div className="trial-row" key={trial.id}><div><strong>{trial.name}</strong><span>{trial.ground_truth_media_id ? "Ground truth attached" : "Inference only"}</span></div><button className="button secondary" disabled={busy} onClick={() => void analyse(trial)}>Analyse</button></div>)}</section>}
            {(detail.analyses ?? []).length > 0 && <section className="trial-list panel"><h2>Saved analyses</h2>{detail.analyses.map((analysis) => <div className="trial-row" key={analysis.id}><div><strong>{analysis.trial_name}</strong><span>{new Date(analysis.created_at).toLocaleString()}</span></div><button className="button secondary" disabled={busy} onClick={() => void request<{ result: AnalysisResult }>(`/analyses/${analysis.id}`).then((value) => setResult(value.result)).catch((error: Error) => setNotice(error.message))}>Review result</button></div>)}</section>}
          </>}
          {result && <ResultPanel result={result} />}
        </section>
      </div>
      <footer><span>Experimental sensing workspace · local research only</span><span>v0.1</span></footer>
    </main>
  );
}
