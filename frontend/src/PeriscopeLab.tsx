import { useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { API, request } from "./api";
import { calibrationLabels, calibrationPattern, labelName } from "./periscope-types";
import type { Experiment, Reconstruction, Region } from "./periscope-types";

const root = "/periscope";
const fullRegion: Region = { x: 0, y: 0, width: 1, height: 1 };

function Pattern({ cells, side, onToggle }: { cells: number[]; side: number; onToggle?: (index: number) => void }) {
  const style = { gridTemplateColumns: `repeat(${side}, 1fr)` };
  return <div className="optics-pattern" style={style} role={onToggle ? "group" : "img"} aria-label={onToggle ? "Hidden target editor" : "Grayscale image grid"}>
    {cells.map((value, index) => onToggle
      ? <button key={index} aria-label={`Target cell ${index + 1}`} aria-pressed={value > 0} onClick={() => onToggle(index)} style={{ background: `rgb(${value * 255} ${value * 255} ${value * 255})` }} />
      : <span key={index} style={{ background: `rgb(${Math.round(value * 255)} ${Math.round(value * 255)} ${Math.round(value * 255)})` }} />)}
  </div>;
}

function HiddenDisplay({ experimentId }: { experimentId: string }) {
  const [pattern, setPattern] = useState<{ cells: number[]; grid_side: number } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let timeout = 0;
    let acknowledged = "";
    async function poll() {
      try {
        const data = await request<{ cells: number[]; grid_side: number; revision: string }>(`${root}/${experimentId}/display`, { signal: controller.signal });
        if (!controller.signal.aborted) {
          setPattern(data); setError("");
          if (data.revision !== "initial" && acknowledged !== data.revision) {
            // Allow React and the browser to paint before confirming the pattern.
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            if (!controller.signal.aborted && !document.hidden) {
              await request(`${root}/${experimentId}/display/ack`, { method: "POST", body: JSON.stringify({ revision: data.revision }), signal: controller.signal });
              acknowledged = data.revision;
            }
          }
        }
      } catch (caught) {
        if (!controller.signal.aborted) { setError((caught as Error).message); setPattern(null); }
      }
      if (!controller.signal.aborted) timeout = window.setTimeout(poll, 400);
    }
    void poll();
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [experimentId]);
  return <main className="optics-display" onDoubleClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}>
    {pattern ? <Pattern cells={pattern.cells} side={pattern.grid_side} /> : <p role="alert">{error || "Loading display…"}</p>}
    <span className="optics-display-help">Double-click for fullscreen · keep brightness fixed</span>
  </main>;
}

async function jpeg(source: CanvasImageSource, width: number, height: number): Promise<Blob> {
  const scale = Math.min(1, 960 / width, 720 / height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The browser could not prepare this photograph");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not prepare JPEG")), "image/jpeg", 0.94));
}

function Result({ result, experimentId }: { result: Reconstruction; experimentId: string }) {
  const fileRoot = `${API}${root}/${experimentId}/files`;
  return <article className="optics-result">
    <div className="optics-section-title"><h3>{result.status === "estimated" ? "Recovered image" : "Estimate withheld"}</h3><time>{new Date(result.created_at).toLocaleString()}</time></div>
    <div className="optics-result-pair">
      <figure><img src={`${fileRoot}/${result.measurement_file}`} alt="Receiving surface photograph supplied to the solver" /><figcaption>Camera measurement</figcaption></figure>
      <figure>{result.values ? <Pattern cells={result.values} side={result.grid_side} /> : <div className="optics-no-estimate">{result.status === "no_signal" ? "No useful signal" : "Measurement mismatch"}</div>}<figcaption>Hidden region · {result.grid_side} × {result.grid_side}</figcaption></figure>
    </div>
    <p>{result.reason}</p>
    <div className="optics-result-footer"><span>Fit residual: {(result.fit_residual * 100).toFixed(1)}% · consistency only</span><div>{result.values && <a className="button secondary" href={`${fileRoot}/${result.id}.png`} download>Download image</a>}<a className="button secondary" href={`${fileRoot}/${result.id}.json`} download>Download evidence</a></div></div>
  </article>;
}

export function PeriscopeLab() {
  const displayId = new URLSearchParams(window.location.search).get("display");
  return displayId ? <HiddenDisplay experimentId={displayId} /> : <ExperimentWorkspace />;
}

function ExperimentWorkspace() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [name, setName] = useState("");
  const [side, setSide] = useState(4);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("dark");
  const [stage, setStage] = useState<"calibrate" | "reconstruct">("calibrate");
  const [pattern, setPattern] = useState<number[]>([]);
  const [preview, setPreview] = useState("");
  const [region, setRegion] = useState<Region>(fullRegion);
  const [selecting, setSelecting] = useState(false);
  const [firstPoint, setFirstPoint] = useState<{ x: number; y: number } | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [shownAt, setShownAt] = useState(0);
  const [displayRevision, setDisplayRevision] = useState("");
  const [displayReady, setDisplayReady] = useState(false);
  const [now, setNow] = useState(Date.now());
  const video = useRef<HTMLVideoElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const previewRef = useRef("");
  const streamRef = useRef<MediaStream | null>(null);
  const importGeneration = useRef(0);

  useEffect(() => {
    let active = true;
    void request<Experiment[]>(root).then(data => {
      if (!active) return;
      setExperiments(data);
      const savedId = window.localStorage.getItem("umbra:periscope-experiment");
      const saved = data.find(item => item.id === savedId) ?? data[0];
      if (saved) choose(saved);
    }).catch(error => { if (active) setNotice(error.message); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!experiment || !displayRevision) return;
    const controller = new AbortController();
    let timeout = 0;
    async function poll() {
      try {
        const state = await request<{ revision: string; acknowledged_revision?: string }>(`${root}/${experiment!.id}/display`, { signal: controller.signal });
        if (!controller.signal.aborted) setDisplayReady(state.revision === displayRevision && state.acknowledged_revision === displayRevision);
      } catch { if (!controller.signal.aborted) setDisplayReady(false); }
      if (!controller.signal.aborted) timeout = window.setTimeout(poll, 700);
    }
    void poll();
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [experiment?.id, displayRevision]);
  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  function setPhoto(blob: Blob) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = URL.createObjectURL(blob);
    setPreview(previewRef.current);
  }

  function choose(data: Experiment) {
    importGeneration.current += 1;
    setExperiment(data); setRegion(data.region); setSelecting(false); setFirstPoint(null);
    setPattern(Array(data.grid_side ** 2).fill(0));
    setLabel(calibrationLabels(data.grid_side).find(item => !data.captures[item]) ?? "dark");
    setStage(data.calibration ? "reconstruct" : "calibrate");
    setPreview(""); setShownAt(0); setNotice(""); setDisplayRevision(""); setDisplayReady(false);
    if (previewRef.current) { URL.revokeObjectURL(previewRef.current); previewRef.current = ""; }
    window.localStorage.setItem("umbra:periscope-experiment", data.id);
  }

  function updated(data: Experiment) {
    setExperiment(data);
    setExperiments(items => [data, ...items.filter(item => item.id !== data.id)]);
  }

  async function action(operation: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setNotice("");
    try { await operation(); } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }

  async function show(cells: number[], nextLabel?: string) {
    if (!experiment) return;
    const data = await request<{ revision: string }>(`${root}/${experiment.id}/display`, { method: "PUT", body: JSON.stringify({ cells }) });
    setDisplayRevision(data.revision); setDisplayReady(false);
    setShownAt(Date.now());
    if (nextLabel) setLabel(nextLabel);
  }

  async function create() {
    const data = await request<Experiment>(root, { method: "POST", body: JSON.stringify({ name: name.trim() || "Hidden image experiment", grid_side: side }) });
    setExperiments(items => [data, ...items]); choose(data); setName("");
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access requires localhost or HTTPS. You can also import photographs.");
    const media = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    streamRef.current = media; setStream(media);
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null; setStream(null);
  }

  async function submitPhoto(blob: Blob) {
    if (!experiment) return;
    const form = new FormData(); form.append("file", blob, "surface.jpg");
    if (stage === "calibrate") {
      const data = await request<Experiment>(`${root}/${experiment.id}/captures/${label}`, { method: "POST", body: form });
      updated(data); setPhoto(blob);
      const labels = calibrationLabels(data.grid_side);
      const next = labels[labels.indexOf(label) + 1];
      if (next) await show(calibrationPattern(next, data.grid_side), next);
    } else {
      await request(`${root}/${experiment.id}/reconstruct`, { method: "POST", body: form });
      updated(await request<Experiment>(`${root}/${experiment.id}`)); setPhoto(blob);
    }
  }

  async function captureCamera() {
    const element = video.current;
    if (!element?.videoWidth) throw new Error("Wait for the camera to deliver a frame");
    await submitPhoto(await jpeg(element, element.videoWidth, element.videoHeight));
  }

  async function importPhoto(file: File) {
    const generation = importGeneration.current;
    const bitmap = await createImageBitmap(file);
    try {
      const blob = await jpeg(bitmap, bitmap.width, bitmap.height);
      if (generation === importGeneration.current) await submitPhoto(blob);
    } finally { bitmap.close(); }
  }

  function markRegion(event: MouseEvent<HTMLButtonElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const point = { x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)), y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)) };
    if (!firstPoint) { setFirstPoint(point); return; }
    const next = { x: Math.min(firstPoint.x, point.x), y: Math.min(firstPoint.y, point.y), width: Math.abs(point.x - firstPoint.x), height: Math.abs(point.y - firstPoint.y) };
    setFirstPoint(null);
    if (next.width < 0.05 || next.height < 0.05) { setNotice("Select a larger receiving-surface rectangle."); return; }
    setRegion(next); setSelecting(false);
  }

  const labels = experiment ? calibrationLabels(experiment.grid_side) : [];
  const captureCount = experiment ? Object.keys(experiment.captures).length : 0;
  const calibrationReady = experiment && captureCount === labels.length;
  const regionChanged = experiment && JSON.stringify(region) !== JSON.stringify(experiment.region);
  const regionStyle: CSSProperties = { left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` };
  const surfaceImage = preview || (experiment?.captures.dark ? `${API}${root}/${experiment.id}/files/${experiment.captures.dark.file}` : "");

  return <main className="app-shell optics-shell">
    <header className="app-header"><div className="research-brand-group"><a className="brand" href="/research.html"><span className="brand-mark">◒</span><span>umbra.</span></a><span className="research-brand-label">Hidden image lab</span></div><a className="button ghost" href="/research.html">← Back to camera</a></header>
    <div className="optics-intro"><div><h1>Recover a hidden image.</h1><p>Measure the light on a visible surface. Reconstruct a coarse image of the hidden screen.</p></div><span className="optics-tag">Experimental · grayscale</span></div>
    {notice && <div className="notice" role="alert">{notice}</div>}
    <div className="optics-layout">
      <aside className="optics-sidebar">
        <label htmlFor="optics-experiment">Experiment</label>
        <select id="optics-experiment" disabled={busy} value={experiment?.id ?? ""} onChange={event => { const data = experiments.find(item => item.id === event.target.value); if (data) choose(data); }}><option value="" disabled>Choose an experiment</option>{experiments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        {experiment && <div className="optics-experiment-actions"><a className="text-button" href={`${API}${root}/${experiment.id}/bundle`} download>Download experiment</a><button className="text-button optics-archive" disabled={busy} onClick={() => {
          if (!window.confirm(`Remove “${experiment.name}” from the lab? Files will be archived locally and can be recovered.`)) return;
          void action(async () => {
            await request(`${root}/${experiment.id}`, { method: "DELETE" });
            const remaining = experiments.filter(item => item.id !== experiment.id);
            setExperiments(remaining);
            if (remaining.length) choose(remaining[0]);
            else { setExperiment(null); window.localStorage.removeItem("umbra:periscope-experiment"); }
          });
        }}>Remove</button></div>}
        <details open={!experiment}><summary>New experiment</summary><div className="optics-create"><input aria-label="Experiment name" placeholder="e.g. cardboard corner" value={name} onChange={event => setName(event.target.value)} maxLength={100} /><label htmlFor="optics-grid">Hidden image resolution</label><select id="optics-grid" value={side} onChange={event => setSide(Number(event.target.value))}><option value={2}>2 × 2 · easiest to separate</option><option value={3}>3 × 3</option><option value={4}>4 × 4 · 19 captures</option></select><button className="button primary" disabled={busy} onClick={() => void action(create)}>Create experiment</button></div></details>
        <details className="optics-setup" open><summary>Set up the experiment</summary><ol><li>Hide the display behind a cardboard barrier. Keep a matte white surface visible to the camera.</li><li>Let the barrier's edge block different parts of the light reaching that surface.</li><li>Fix the camera, screen brightness and lighting. Lock camera exposure and white balance when possible.</li><li>Open the hidden display on the screen behind the barrier. It must stay outside the camera view.</li></ol><p>Use a dim room. The camera photographs the receiving surface, not the target. This lab does not yet detect pedestrians or traffic.</p></details>
        {experiment && <><a className="button secondary optics-display-link" href={`/periscope.html?display=${experiment.id}`} target="_blank" rel="noreferrer" onClick={event => {
          const popup = window.open(event.currentTarget.href, `umbra-display-${experiment.id}`, "popup,width=900,height=900");
          if (popup) { event.preventDefault(); popup.opener = null; }
        }}>Open hidden display ↗</a><p className="optics-hint">Move this separate window to the hidden screen. Double-click it for fullscreen. Wait until each pattern appears before photographing.</p><div className="optics-progress"><span>{captureCount} / {labels.length} calibration captures</span><progress max={labels.length} value={captureCount} /></div>{experiment.calibration && <p className="optics-ready">Calibration saved · {experiment.calibration.diagnostics.effective_rank} distinguishable cells</p>}</>}
      </aside>
      <section className="optics-workspace">
        {!experiment ? <div className="optics-empty"><h2>Start with a fixed tabletop setup.</h2><p>Create an experiment, open its hidden display and photograph the white receiving surface for each calibration pattern.</p></div> : <>
          <nav className="optics-tabs" aria-label="Experiment steps"><button disabled={busy} aria-current={stage === "calibrate" ? "step" : undefined} onClick={() => setStage("calibrate")}>1 · Calibrate light response</button><button disabled={busy || !experiment.calibration} aria-current={stage === "reconstruct" ? "step" : undefined} onClick={() => setStage("reconstruct")}>2 · Reconstruct image</button></nav>
          <div className="optics-capture-grid">
            <section className="optics-card">
              <div className="optics-section-title"><h2>Receiving surface</h2><button className="button secondary" disabled={busy} onClick={() => stream ? stopCamera() : void action(startCamera)}>{stream ? "Stop camera" : "Use camera"}</button></div>
              <div className="optics-surface">
                {stream ? <video ref={video} autoPlay muted playsInline /> : surfaceImage ? <img src={surfaceImage} alt="Receiving surface for crop selection" /> : <div className="optics-surface-placeholder">Import the black-reference photograph or start a camera.</div>}
                {(stream || surfaceImage) && <span className="optics-roi" style={regionStyle} />}
                {selecting && <button className="optics-select-surface" aria-label="Select two corners of the receiving surface" onClick={markRegion} />}
              </div>
              <div className="optics-crop-controls"><button className="text-button" disabled={busy || (!stream && !surfaceImage)} onClick={() => { setSelecting(value => !value); setFirstPoint(null); }}>{selecting ? "Cancel selection" : "Select receiving area"}</button><button className="text-button" disabled={busy} onClick={() => setRegion(fullRegion)}>Use full image</button>{regionChanged && <button className="button secondary" disabled={busy} onClick={() => void action(async () => { updated(await request<Experiment>(`${root}/${experiment.id}/region`, { method: "PUT", body: JSON.stringify(region) })); setStage("calibrate"); })}>Save area · refit required</button>}</div>
              {selecting && <p className="optics-hint">{firstPoint ? "Click the opposite corner." : "Click the first corner of the white receiving surface."}</p>}
              <input ref={photoInput} type="file" accept="image/*" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void action(() => importPhoto(file)); }} />
              <div className="optics-actions"><button className="button primary" disabled={busy || !!regionChanged || (stage === "reconstruct" && !experiment.calibration)} onClick={() => photoInput.current?.click()}>{busy ? "Working…" : stage === "calibrate" ? "Import photograph for this step" : "Import surface photo and reconstruct"}</button>{stream && <button className="button secondary" disabled={busy || !!regionChanged || !shownAt || now - shownAt < 1500 || !displayReady} onClick={() => void action(captureCamera)}>{stage === "calibrate" ? "Capture camera + next" : "Capture and reconstruct"}</button>}</div>
              {shownAt > 0 && <p className="optics-hint optics-display-status" role="status">{displayReady ? "Hidden display confirmed. Wait for exposure to settle before capture." : "Waiting for the hidden display window. Keep it visible on the target screen."}</p>}
            </section>
            <section className="optics-card optics-pattern-card">
              {stage === "calibrate" ? <><h2>{labelName(label, experiment.grid_side)}</h2><Pattern cells={calibrationPattern(label, experiment.grid_side)} side={experiment.grid_side} /><button className="button secondary" disabled={busy} onClick={() => void action(() => show(calibrationPattern(label, experiment.grid_side)))}>Show this calibration pattern</button><p className="optics-hint">Photograph the receiving surface while the hidden screen shows this pattern. Import advances to the next step.</p><div className="optics-capture-list">{labels.map((item, index) => <button key={item} disabled={busy} className={item === label ? "selected" : ""} onClick={() => void action(() => show(calibrationPattern(item, experiment.grid_side), item))}><span>{experiment.captures[item] ? "✓" : index + 1}</span>{labelName(item, experiment.grid_side)}</button>)}</div><button className="button primary" disabled={busy || !calibrationReady || !!regionChanged} onClick={() => void action(async () => { const data = await request<Experiment>(`${root}/${experiment.id}/fit`, { method: "POST" }); updated(data); setStage("reconstruct"); })}>Fit measured light response</button></> : <><h2>Choose an unseen target</h2><Pattern cells={pattern} side={experiment.grid_side} onToggle={index => setPattern(items => items.map((value, i) => i === index ? 1 - value : value))} /><div className="optics-actions"><button className="button secondary" disabled={busy} onClick={() => setPattern(Array.from({ length: experiment.grid_side ** 2 }, () => crypto.getRandomValues(new Uint8Array(1))[0] % 2))}>Random pattern</button><button className="button secondary" disabled={busy} onClick={() => setPattern(Array.from({ length: experiment.grid_side ** 2 }, (_, i) => i % experiment.grid_side === 0 || i >= experiment.grid_side * (experiment.grid_side - 1) ? 1 : 0))}>Letter L</button></div><button className="button primary" disabled={busy} onClick={() => void action(() => show(pattern))}>Show target on hidden display</button><p className="optics-hint">The solver receives only the surface photograph and calibration. The selected target is not sent to reconstruction.</p><p className="optics-hint">Keep the same camera and framing. Recalibrate after moving anything or changing the lighting.</p></>}
            </section>
          </div>
          {experiment.calibration && <details className="optics-diagnostics"><summary>Calibration measurements</summary><dl><div><dt>Distinguishable cells</dt><dd>{experiment.calibration.diagnostics.effective_rank} / {experiment.calibration.diagnostics.cell_count}</dd></div><div><dt>Condition number</dt><dd>{experiment.calibration.diagnostics.condition_number}</dd></div><div><dt>White additivity error</dt><dd>{(experiment.calibration.diagnostics.white_additivity_error * 100).toFixed(1)}%</dd></div></dl><p>{experiment.calibration.diagnostics.interpretation}</p><a className="button secondary" href={`${API}${root}/${experiment.id}/files/${experiment.calibration.id}.npz`} download>Download measured model</a></details>}
          <section className="optics-results" aria-live="polite"><h2>Saved reconstructions <span>{experiment.results.length}</span></h2>{experiment.results.length ? experiment.results.map(result => <Result key={result.id} result={result} experimentId={experiment.id} />) : <p>New results will appear here after a valid calibration and a test photograph.</p>}</section>
        </>}
      </section>
    </div>
  </main>;
}
