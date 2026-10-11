import { FormEvent, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { API, request } from "./api";
import { Camera, ScanLine, ArrowUpRight, Layers, Aperture, Plus, Check } from "lucide-react";
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
  SunPosition,
  Trial
} from "./types";

const roleLabel: Record<MediaRole, string> = {
  calibration: "Empty scene",
  main: "Corner trial",
  ground_truth: "Reference path"
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

function frozenClockKey(sceneId: string): string {
  return `umbra:frozen-clock:${sceneId}`;
}

function savedFrozenClock(sceneId: string): string | null {
  const value = window.localStorage.getItem(frozenClockKey(sceneId));
  return value && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime()) ? value : null;
}

function newSceneForm(): SceneForm {
  return { name: "", notes: "", latitude: "", longitude: "", recorded_at: localDateTimeValue() };
}

function StatePill({ state }: { state: State }) {
  return <span className={`state-pill ${state}`}>{stateLabel[state]}</span>;
}

function ResultPanel({ result, title }: { result: AnalysisResult; title: string }) {
  const reportUrl = `${API}/analyses/${result.analysis_id}/report`;
  const predictionsUrl = `${API}/analyses/${result.analysis_id}/predictions`;
  return (
    <section className="review-screen" aria-live="polite">
      <div className="review-state"><StatePill state={result.state} /></div>
      <h1>{title}</h1>
      <div className="review-metrics">
        <article><span>Lead time</span><strong>{result.lead_time_s == null ? "—" : `${result.lead_time_s.toFixed(2)} s`}</strong></article>
        <article><span>Shadow signal</span><strong>{result.presence_probability == null ? "—" : `${Math.round(result.presence_probability * 100)}%`}</strong></article>
      </div>
      {result.sun?.status === "estimated" && <p className="solar-reading">Sun at recording: elevation {result.sun.elevation_deg}° · bearing {result.sun.azimuth_deg}°{result.illumination?.source === "streetlamp" ? " · streetlamp area used" : result.sun.above_horizon === false ? " · shadow warning withheld" : ""}</p>}
      {(result.visualizations?.corner_trial_available || result.visualization?.available) && <div className="review-videos">
        <div className="review-clip"><h2>Corner trial</h2><video key={`corner-${result.analysis_id}`} controls preload="metadata" className="analysis-video"><source src={`${API}/analyses/${result.analysis_id}/visualization`} type="video/mp4" /></video><a className="button secondary" href={`${API}/analyses/${result.analysis_id}/visualization`} download={`corner-trial-${result.analysis_id}.mp4`}>Download video</a></div>
        {result.visualizations?.hidden_path_available && <div className="review-clip"><h2>Hidden path</h2><video key={`hidden-${result.analysis_id}`} controls preload="metadata" className="analysis-video"><source src={`${API}/analyses/${result.analysis_id}/hidden-path-visualization`} type="video/mp4" /></video><a className="button secondary" href={`${API}/analyses/${result.analysis_id}/hidden-path-visualization`} download={`hidden-path-${result.analysis_id}.mp4`}>Download video</a></div>}
      </div>}
      <div className="review-downloads"><a className="button ghost" href={`${API}/analyses/${result.analysis_id}/bundle`}>Download files</a><a className="button ghost" href={predictionsUrl}>Predictions CSV</a><a className="button ghost" href={reportUrl} target="_blank" rel="noreferrer">Report</a></div>
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
      <span className="slot-icon">{media ? <Check size={15} /> : <Plus size={15} />}</span>
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
  const sectionRef = useRef<HTMLElement>(null);
  const truthRef = useRef<HTMLVideoElement>(null);
  const mainRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    sectionRef.current?.scrollIntoView({ block: "start" });
    let active = true;
    setLoadingReview(true);
    setReview(emptyManualReview(trial));
    setMode("corner");
    setReviewSource("phone");
    setShadowStart(null);
    setSelectingShadow(false);
    const savedReview = trial.ground_truth_media_id
      ? request<ManualGroundTruth>(`/trials/${trial.id}/manual-ground-truth`)
      : request<ManualRegion>(`/trials/${trial.id}/shadow-region`);
    void savedReview
      .then((saved) => { if (active) setReview(trial.ground_truth_media_id ? saved as ManualGroundTruth : { ...emptyManualReview(trial), main_shadow_region: saved as ManualRegion }); })
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
    if (!trial.ground_truth_media_id) {
      if (!review.main_shadow_region) {
        onNotice("Select the lamp-lit pavement area before saving.");
        return;
      }
      setSaving(true);
      try {
        const region = await request<ManualRegion>(`/trials/${trial.id}/shadow-region`, {
          method: "PUT",
          body: JSON.stringify(review.main_shadow_region)
        });
        setReview((current) => ({ ...current, main_shadow_region: region }));
        onNotice("Shadow area saved. Re-run analysis to use it.");
      } catch (error) {
        onNotice(error instanceof Error ? error.message : "Could not save shadow area");
      } finally {
        setSaving(false);
      }
      return;
    }
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

  async function clearShadowArea() {
    if (trial.ground_truth_media_id) {
      setReview((current) => ({ ...current, main_shadow_region: null }));
      return;
    }
    setSaving(true);
    try {
      await request<{ trial_id: string }>(`/trials/${trial.id}/shadow-region`, { method: "DELETE" });
      setReview((current) => ({ ...current, main_shadow_region: null }));
      onNotice("Shadow area cleared.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Could not clear shadow area");
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

  return <section ref={sectionRef} className="manual-review panel">
    <div className="panel-heading"><div><p className="eyebrow">Scene review</p><h2>Manual review — {trial.name}</h2></div><button className="button ghost" disabled={disabled} onClick={onClose}>Close</button></div>
    {trial.ground_truth_media_id && <div className="review-source-tabs"><button className={`button ${reviewSource === "phone" ? "primary" : "secondary"}`} onClick={() => setReviewSource("phone")}>Phone shot · shadow</button><button className={`button ${reviewSource === "drone" ? "primary" : "secondary"}`} onClick={() => setReviewSource("drone")}>Drone shot · route truth</button></div>}
    <div className="review-grid">
      {trial.ground_truth_media_id && <div className={`review-pane ${reviewSource === "drone" ? "" : "inactive"}`}>
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
      </div>}
      <div className={`review-pane ${reviewSource === "phone" ? "" : "inactive"}`}>
        <p className="hint">Select the pavement where the approaching shadow first appears. At night, mark the lit ground under a streetlamp, not the lamp itself. Use two clicks for opposite corners; keep the first 1.8 seconds empty for calibration.</p>
        <div className="review-toolbar"><button className={`button ${selectingShadow ? "primary" : "secondary"}`} disabled={disabled} onClick={() => { setSelectingShadow(true); setShadowStart(null); }}>Select shadow pavement</button><button className="text-button" disabled={disabled || !review.main_shadow_region} onClick={() => void clearShadowArea()}>Clear area</button></div>
        <div className="review-video" style={{ maxWidth: `${Math.round(360 * mainAspect)}px` }}><video ref={mainRef} controls src={`${API}/media/${trial.main_media_id}/stream`} onLoadedMetadata={(event) => setMainAspect(event.currentTarget.videoWidth / event.currentTarget.videoHeight)} onTimeUpdate={(event) => setMainTime(event.currentTarget.currentTime)} />
          {selectingShadow && <button className="review-click-surface" type="button" onClick={markShadowRegion} aria-label="Click two corners of the shadow pavement area" />}
          {review.main_shadow_region && <span className="manual-region" style={{ left: `${review.main_shadow_region.x * 100}%`, top: `${review.main_shadow_region.y * 100}%`, width: `${review.main_shadow_region.width * 100}%`, height: `${review.main_shadow_region.height * 100}%` }} />}
          {shadowStart && <span className="manual-point corner" style={{ left: `${shadowStart.x * 100}%`, top: `${shadowStart.y * 100}%` }}>Start</span>}
        </div>
        <p className="review-time">Phone frame: {mainTime.toFixed(2)} s · shadow area: {review.main_shadow_region ? "selected" : selectingShadow ? shadowStart ? "click opposite corner" : "click first corner" : "not selected"}</p>
        {trial.ground_truth_media_id && <><div className="review-toolbar"><button className="button primary" disabled={disabled} onClick={markEntry}>Use current time as body entry</button><button className="text-button" disabled={disabled || review.main_entry_timestamp_s === null} onClick={() => setReview((current) => ({ ...current, main_entry_timestamp_s: null }))}>Clear entry time</button></div>
        <p className="review-time">Body entry: {review.main_entry_timestamp_s === null ? "not set" : `${review.main_entry_timestamp_s.toFixed(2)} s`}. The first 1.8 seconds of the phone shot should contain empty pavement.</p></>}
      </div>
    </div>
    <div className="review-footer"><span>{loadingReview ? "Loading saved review…" : review.main_shadow_region ? "Shadow area ready" : "No shadow area"}{trial.ground_truth_media_id && ` · ${review.samples.length} drone points`}</span><button className="button primary" disabled={disabled} onClick={() => void save()}>{saving ? "Saving…" : trial.ground_truth_media_id ? "Save review" : "Save area"}</button></div>
  </section>;
}

export default function App() {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [detail, setDetail] = useState<SceneDetail | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [reviewTitle, setReviewTitle] = useState("");
  const [screen, setScreen] = useState<"camera" | "review">("camera");
  const [notice, setNotice] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<SceneForm>(newSceneForm);
  const [locationStatus, setLocationStatus] = useState("");
  const [trialName, setTrialName] = useState("Trial 1");
  const [showNewScene, setShowNewScene] = useState(false);
  const [manualTrialId, setManualTrialId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const [frozenClock, setFrozenClock] = useState<{ sceneId: string; value: string } | null>(null);
  const [sunPosition, setSunPosition] = useState<SunPosition | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const mediaByRole = useMemo(() => {
    const source = detail?.media ?? [];
    return Object.fromEntries(source.map((media) => [media.role, media])) as Partial<Record<MediaRole, MediaAsset>>;
  }, [detail]);
  const importedVideoCount = Object.values(mediaByRole).filter(Boolean).length;
  const videosComplete = Boolean(mediaByRole.calibration && mediaByRole.main);
  const frozenTime = frozenClock && frozenClock.sceneId === detail?.scene.id ? frozenClock.value : null;
  const displayedClock = frozenTime ? new Date(frozenTime) : clock;
  const sunMoment = frozenTime ?? localDateTimeValue(clock);

  useEffect(() => {
    let timer: number;
    const updateClock = () => {
      setClock(new Date());
      timer = window.setTimeout(updateClock, 60_000 - Date.now() % 60_000);
    };
    timer = window.setTimeout(updateClock, 60_000 - Date.now() % 60_000);
    const refreshOnReturn = () => {
      if (document.visibilityState === "visible") {
        window.clearTimeout(timer);
        updateClock();
      }
    };
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, []);

  useEffect(() => {
    const sceneId = detail?.scene.id;
    if (!sceneId) {
      setSunPosition(null);
      return;
    }
    setSunPosition(null);
    let active = true;
    const at = new Date(sunMoment).toISOString();
    void request<SunPosition>(`/scenes/${sceneId}/sun?at=${encodeURIComponent(at)}`)
      .then((position) => { if (active) setSunPosition(position); })
      .catch(() => { if (active) setSunPosition(null); });
    return () => { active = false; };
  }, [detail?.scene.id, sunMoment]);

  useEffect(() => {
    if (detail) setTrialName(`Trial ${detail.trials.length + 1}`);
  }, [detail?.scene.id, detail?.trials.length]);

  async function refreshScenes() {
    const values = await request<Scene[]>("/scenes");
    setScenes(values);
    if (!detail && values.length) await loadScene(values[0].id);
  }

  async function loadScene(sceneId: string) {
    const next = await request<SceneDetail>(`/scenes/${sceneId}`);
    const savedTime = savedFrozenClock(sceneId);
    setFrozenClock(savedTime ? { sceneId, value: savedTime } : null);
    setDetail(next);
    setResult(null);
    setManualTrialId(null);
    setScreen("camera");
  }

  async function deleteScene(scene: Scene) {
    const accepted = window.confirm(
      `Delete “${scene.name}”? This permanently removes its footage, trials, and local reports.`
    );
    if (!accepted) return;
    setBusy(true);
    try {
      await request<{ scene_id: string }>(`/scenes/${scene.id}`, { method: "DELETE" });
      window.localStorage.removeItem(frozenClockKey(scene.id));
      if (detail?.scene.id === scene.id) {
        stopCamera();
        setDetail(null);
        setResult(null);
        setScreen("camera");
      }
      const remainingScenes = await request<Scene[]>("/scenes");
      setScenes(remainingScenes);
      if (detail?.scene.id === scene.id && remainingScenes[0]) await loadScene(remainingScenes[0].id);
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
      if (result?.analysis_id === analysisId) {
        setResult(null);
        setScreen("camera");
      }
      await loadScene(detail.scene.id);
      setNotice(`Deleted saved analysis for “${trialName}”.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not delete analysis");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refreshScenes().catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Could not load scenes"));
    return () => streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    if (screen === "camera" && streaming && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [screen, streaming]);

  async function watchJob(jobId: string, resultTitle = "Analysis result") {
    for (let attempt = 0; attempt < 180; attempt += 1) {
      await sleep(900);
      const next = await request<Job>(`/jobs/${jobId}`);
      if (next.status === "succeeded") {
        const analysisId = next.result?.analysis_id;
        if (typeof analysisId === "string") {
          const payload = await request<{ result: AnalysisResult }>(`/analyses/${analysisId}`);
          const sceneId = next.result?.scene_id;
          if (typeof sceneId === "string") await loadScene(sceneId);
          setResult(payload.result);
          setReviewTitle(resultTitle);
          setScreen("review");
        }
        return;
      }
      if (next.status === "failed") {
        throw new Error(next.error?.split("\n")[0] ?? "The background job failed");
      }
    }
    throw new Error("The analysis took too long to finish. Check the local server log.");
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
          recorded_at: new Date(form.recorded_at).toISOString()
        })
      });
      await refreshScenes();
      await loadScene(scene.id);
      setForm(newSceneForm());
      setShowNewScene(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create scene");
    } finally {
      setBusy(false);
    }
  }

  function fillBrowserMetadata() {
    setForm((current) => ({ ...current, recorded_at: localDateTimeValue() }));
    if (!navigator.geolocation) {
      setLocationStatus("Location unavailable. Enter the coordinates manually.");
      return;
    }
    setLocationStatus("Getting location…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((current) => ({
          ...current,
          latitude: String(position.coords.latitude),
          longitude: String(position.coords.longitude)
        }));
        setLocationStatus("Location filled in. Check that it matches where you filmed.");
      },
      () => setLocationStatus("Location unavailable. Enter the coordinates manually."),
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 }
    );
  }

  function setSceneFrozenTime(value: string) {
    if (!detail) return;
    window.localStorage.setItem(frozenClockKey(detail.scene.id), value);
    setFrozenClock({ sceneId: detail.scene.id, value });
  }

  function toggleFrozenTime() {
    if (!detail) return;
    if (frozenTime) {
      window.localStorage.removeItem(frozenClockKey(detail.scene.id));
      setFrozenClock(null);
      setClock(new Date());
    } else {
      setSceneFrozenTime(localDateTimeValue());
    }
  }

  async function upload(role: MediaRole, file: File) {
    if (!detail) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      await request<MediaAsset>(`/scenes/${detail.scene.id}/media/${role}`, { method: "POST", body });
      await loadScene(detail.scene.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not import video");
    } finally {
      setBusy(false);
    }
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setStreaming(true);
    } catch {
      setNotice("Camera access was blocked. Allow camera access in your browser settings.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStreaming(false);
  }

  async function createTrial() {
    if (!detail || !mediaByRole.calibration || !mediaByRole.main) return;
    setBusy(true);
    try {
      await request<Trial>(`/scenes/${detail.scene.id}/trials`, {
        method: "POST",
        body: JSON.stringify({
          name: trialName,
          calibration_media_id: mediaByRole.calibration.id,
          main_media_id: mediaByRole.main.id,
          ground_truth_media_id: mediaByRole.ground_truth?.id ?? null,
          track_length_m: null
        })
      });
      await loadScene(detail.scene.id);
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
      await watchJob(next.id, trial.name);
      if (detail) setDetail(await request<SceneDetail>(`/scenes/${detail.scene.id}`));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not analyse trial");
    } finally {
      setBusy(false);
    }
  }

  async function reviewAnalysis(analysisId: string, title: string) {
    setBusy(true);
    try {
      const value = await request<{ result: AnalysisResult }>(`/analyses/${analysisId}`);
      setResult(value.result);
      setReviewTitle(title);
      setScreen("review");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not open result");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="research-brand-group"><a className="brand" href="/research.html" aria-label="Umbra research home"><span className="brand-mark">◒</span><span>umbra<span className="brand-period">.</span></span></a><span className="research-brand-divider"/><span className="research-brand-label">Research studio</span></div>
        {screen === "review" ? <button className="button ghost review-tab" onClick={() => { setScreen("camera"); setResult(null); }}>← Back to camera <span aria-hidden="true">×</span></button> : <div className="scene-switcher">
          <label htmlFor="scene-select">Scene</label>
          <select id="scene-select" value={detail?.scene.id ?? ""} onChange={(event) => event.target.value && void loadScene(event.target.value).catch((error: Error) => setNotice(error.message))}>
            {!detail && <option value="">Choose scene</option>}
            {scenes.map((scene) => <option key={scene.id} value={scene.id}>{scene.name}</option>)}
          </select>
          {detail && <button className="icon-button scene-delete-button" title="Delete scene" aria-label="Delete scene" disabled={busy} onClick={() => void deleteScene(detail.scene)}>×</button>}
          <button className="button secondary" onClick={() => { if (!showNewScene) fillBrowserMetadata(); setShowNewScene((value) => !value); }}>{showNewScene ? "Cancel" : "New scene"}</button>
        </div>}
      </header>

      {notice && <div className="notice" role="status">{notice}</div>}

      {screen === "review" && result ? <ResultPanel result={result} title={reviewTitle} /> : <div className="studio-layout">
        <section className="camera-workspace">
          <div className="research-heading"><div><span className="research-kicker">Observation workspace</span><h1>A closer look<br/>at what comes next.</h1></div><span className="local-workspace-note"><Layers size={15} />Local research</span></div>
          <div className="camera-clock" aria-label={frozenTime ? "Frozen scene date and time" : "Local date and time"}>
            {frozenTime ? <>
              <input aria-label="Frozen date" type="date" value={frozenTime.slice(0, 10)} onChange={(event) => event.target.value && setSceneFrozenTime(`${event.target.value}T${frozenTime.slice(11)}`)} />
              <input aria-label="Frozen time" type="time" value={frozenTime.slice(11)} onChange={(event) => event.target.value && setSceneFrozenTime(`${frozenTime.slice(0, 10)}T${event.target.value}`)} />
            </> : <>
              <time dateTime={localDateTimeValue(displayedClock).slice(0, 10)}>{displayedClock.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</time>
              <time dateTime={displayedClock.toISOString()}>{displayedClock.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</time>
            </>}
            <button className={frozenTime ? "button unfreeze-button" : "button freeze-button"} type="button" disabled={!detail} onClick={toggleFrozenTime}>{frozenTime ? "Unfreeze" : "Freeze"}</button>
          </div>
          <div className="workspace-heading"><h2><Camera size={16} strokeWidth={1.5} />Live camera</h2><span className={streaming ? "camera-status on" : "camera-status"}>{streaming ? "Live" : "Off"}</span></div>
          {sunPosition?.status === "estimated" && <p className={sunPosition.above_horizon ? "solar-reading" : "solar-reading below-horizon"}>{sunPosition.above_horizon ? `Sun ${sunPosition.elevation_deg}° high · bearing ${sunPosition.azimuth_deg}°` : "Sun below horizon · use a streetlamp-lit shadow area for recorded trials"}</p>}
          <div className="camera-stage main-camera">
            <video ref={videoRef} autoPlay muted playsInline className={streaming ? "camera active" : "camera"} />
            {!streaming && <div className="camera-placeholder"><div className="camera-aperture"><Aperture size={47} strokeWidth={.8} /></div><strong>Your perspective starts here.</strong><p>Position the camera so the corner and its pavement are in view.</p><button className="button primary" disabled={busy} onClick={() => void startCamera()}>Start camera <ArrowUpRight size={15} /></button><span className="camera-local-note">Camera access stays in this browser.</span></div>}
          </div>
          {streaming && <button className="button ghost camera-stop" onClick={stopCamera}>Stop camera</button>}
          {busy && <div className="working-line"><span className="spinner" />Working…</div>}
          {manualTrialId && detail?.trials.find((trial) => trial.id === manualTrialId) && <ManualReview trial={detail.trials.find((trial) => trial.id === manualTrialId)!} busy={busy} onClose={() => setManualTrialId(null)} onNotice={setNotice} />}
        </section>

        <aside className="side-workspace">
          <div className="research-sidebar-heading"><ScanLine size={16}/><div><span>Scene workspace</span><strong>{detail?.scene.name ?? "Set up your scene"}</strong></div></div>
          {showNewScene && <form className="new-scene-form panel" onSubmit={(event) => void createScene(event)}>
            <div className="panel-heading"><h2>New scene</h2><button className="icon-button" type="button" aria-label="Close new scene form" onClick={() => setShowNewScene(false)}>×</button></div>
            <label>Scene name<input required autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Courtyard" /></label>
            <p className="scene-sun-hint">For the sun position, use the place and local date/time when you filmed the corner trial.</p>
            <div className="form-row">
              <label>Latitude<input required type="number" min="-90" max="90" step="any" value={form.latitude} onChange={(event) => setForm({ ...form, latitude: event.target.value })} placeholder="44.176" /></label>
              <label>Longitude<input required type="number" min="-180" max="180" step="any" value={form.longitude} onChange={(event) => setForm({ ...form, longitude: event.target.value })} placeholder="28.638" /></label>
            </div>
            <label>Recording date and time<input required type="datetime-local" value={form.recorded_at} onChange={(event) => setForm({ ...form, recorded_at: event.target.value })} /></label>
            <button className="button secondary" type="button" onClick={fillBrowserMetadata}>Use current location and time</button>
            {locationStatus && <p className="metadata-status" role="status">{locationStatus}</p>}
            <label>Notes <span className="optional">optional</span><input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="" /></label>
            <button className="button primary" disabled={busy} type="submit">Create scene</button>
          </form>}
          {!detail ? !showNewScene && <section className="panel side-card"><h2>Start here</h2><p>Create a scene to add videos and trials.</p><button className="button primary" onClick={() => { fillBrowserMetadata(); setShowNewScene(true); }}>New scene</button></section> : <>
            <details className="panel side-card videos-card" open={!videosComplete}>
              <summary className="side-summary"><h2>Videos</h2><span>{importedVideoCount}/3</span></summary>
              <div className="media-list">
                {(["calibration", "main", "ground_truth"] as MediaRole[]).map((role) => <MediaSlot key={role} role={role} media={mediaByRole[role]} disabled={busy} onUpload={upload} />)}
              </div>
            </details>
            <section className="panel side-card trial-side-card">
              <div className="panel-heading"><h2>Trials</h2></div>
              <div className="trial-create-row"><input aria-label="Trial name" value={trialName} onChange={(event) => setTrialName(event.target.value)} /><button className="button primary" disabled={busy || !mediaByRole.calibration || !mediaByRole.main} onClick={() => void createTrial()}>Add trial</button></div>
              {detail.trials.length === 0 ? <p className="side-empty">Import an empty scene and corner trial video to add a trial.</p> : <div className="trial-side-list">{detail.trials.map((trial) => {
                const analyses = (detail.analyses ?? []).filter((analysis) => analysis.trial_id === trial.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
                return <article className="trial-card" key={trial.id}>
                  <div className="trial-card-head"><strong>{trial.name}</strong><button className="icon-button delete-icon" title="Delete trial" aria-label={`Delete ${trial.name}`} disabled={busy} onClick={() => void deleteTrial(trial)}>×</button></div>
                  <div className="trial-card-actions"><button className="button secondary" disabled={busy} onClick={() => void analyse(trial)}>Analyze</button><button className="button ghost" disabled={busy} onClick={() => setManualTrialId(trial.id)}>{trial.ground_truth_media_id ? "Labels" : "Shadow area"}</button></div>
                  {analyses.length > 0 && <div className="saved-result-row"><span>Latest · {new Date(analyses[0].created_at).toLocaleString()}</span><div><button className="button primary" disabled={busy} onClick={() => void reviewAnalysis(analyses[0].id, trial.name)}>Review result</button><button className="icon-button delete-icon" title="Delete latest result" aria-label="Delete latest result" disabled={busy} onClick={() => void deleteAnalysis(analyses[0].id, trial.name)}>×</button></div></div>}
                  {analyses.length > 1 && <details className="older-results"><summary>Older results ({analyses.length - 1})</summary>{analyses.slice(1).map((analysis) => <div className="saved-result-row" key={analysis.id}><span>{new Date(analysis.created_at).toLocaleString()}</span><div><button className="button secondary" disabled={busy} onClick={() => void reviewAnalysis(analysis.id, trial.name)}>Review</button><button className="icon-button delete-icon" title="Delete result" aria-label="Delete result" disabled={busy} onClick={() => void deleteAnalysis(analysis.id, trial.name)}>×</button></div></div>)}</details>}
                </article>;
              })}</div>}
            </section>
          </>}
        </aside>
      </div>}
    </main>
  );
}
