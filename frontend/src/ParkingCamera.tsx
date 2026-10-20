import { useEffect, useRef, useState } from "react";
import { Camera, Video, Square, Volume2, VolumeX, Upload, ArrowLeft, ArrowRight } from "lucide-react";
import { request } from "./api";
import type { ParkingObservation, ParkingEvidence as Evidence } from "./parking-types";
import { parkingMessage, screenBox } from "./parking-types";
import { ParkingEvidence } from "./ParkingEvidence";

type Session = { id: string; source: "browser" | "network" };
type Source = "camera" | "video" | "network";

export function ParkingCamera() {
  const [source, setSource] = useState<Source>("camera");
  const [session, setSession] = useState<Session | null>(null);
  const [starting, setStarting] = useState(false);
  const [running, setRunning] = useState(false);
  const [observation, setObservation] = useState<ParkingObservation | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [videoURL, setVideoURL] = useState("");
  const [filename, setFilename] = useState("");
  const [cameraURL, setCameraURL] = useState("");
  const [mirrored, setMirrored] = useState(false);
  const [guides, setGuides] = useState(true);
  const [objects, setObjects] = useState(false);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [zone, setZone] = useState("ground");
  const [sound, setSound] = useState(false);
  const [notice, setNotice] = useState("");
  const [status, setStatus] = useState("Camera off");
  const [aspect, setAspect] = useState(16 / 9);
  const [clock, setClock] = useState(new Date());
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState("");
  const element = useRef<HTMLVideoElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const current = useRef<Session | null>(null);
  const startController = useRef<AbortController | null>(null);
  const objectURL = useRef("");
  const audio = useRef<AudioContext | null>(null);
  const alarmTime = useRef(0);
  const mounted = useRef(true);
  const log = useRef<Record<string, unknown>[]>([]);
  const logSource = useRef<Record<string, unknown>>({});
  const evidenceSegments = useRef(new Map<string, Evidence>());
  const latestObservation = useRef<ParkingObservation | null>(null);

  function stop() {
    startController.current?.abort(); startController.current = null;
    const previous = current.current; current.current = null;
    if (previous) void request(`/parking/sessions/${previous.id}`, { method: "DELETE" }).catch(() => {});
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    if (element.current) { element.current.pause(); element.current.srcObject = null; }
    setSession(null); setStarting(false); setRunning(false); setObservation(null); setImage(null); setStatus("Camera off");
  }

  useEffect(() => {
    mounted.current = true;
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => {
      mounted.current = false; stop(); window.clearInterval(timer);
      if (objectURL.current) URL.revokeObjectURL(objectURL.current);
      void audio.current?.close();
    };
  }, []);

  async function start() {
    if (starting || current.current) return;
    const controller = new AbortController(); startController.current = controller;
    setStarting(true); setNotice(""); setStatus("Preparing camera and detector…");
    let media: MediaStream | null = null;
    const timeout = window.setTimeout(() => controller.abort(), 65_000);
    try {
      if (source === "camera") {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Use localhost or HTTPS for camera access, or import a video.");
        media = await navigator.mediaDevices.getUserMedia({ video: device ? { deviceId: { exact: device } } : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (controller.signal.aborted || !mounted.current) { media.getTracks().forEach(track => track.stop()); return; }
        stream.current = media;
        if (element.current) { element.current.srcObject = media; await element.current.play(); }
        setRunning(true);
        setDevices((await navigator.mediaDevices.enumerateDevices()).filter(item => item.kind === "videoinput"));
      }
      if (source === "video" && !videoURL) throw new Error("Choose a parking video first");
      const next = await request<Session>("/parking/sessions", { method: "POST", body: JSON.stringify({ camera_url: source === "network" ? cameraURL : null }), signal: controller.signal });
      if (controller.signal.aborted || !mounted.current) {
        void request(`/parking/sessions/${next.id}`, { method: "DELETE" }).catch(() => {});
        media?.getTracks().forEach(track => track.stop()); return;
      }
      current.current = next; setSession(next); setRunning(true); setStatus("Waiting for camera frames…");
      log.current = []; evidenceSegments.current.clear(); setEvidence(null); setZone("ground");
      logSource.current = { source, video_name: source === "video" ? filename : undefined, started_at: new Date().toISOString(), method: "parking-indirect-shadow-v2", model: "OpenCV Zoo YOLOX 2022nov", guides: { x_min: 0.34, x_max: 0.66, ground_y_min: 0.42 } };
      if (source === "video") await element.current?.play();
    } catch (error) {
      media?.getTracks().forEach(track => track.stop());
      if (mounted.current && startController.current === controller) {
        const message = controller.signal.aborted ? "Camera setup timed out. Check the server and try again." : (error as Error).message;
        setNotice(message); stop();
      }
    } finally {
      window.clearTimeout(timeout);
      if (startController.current === controller && mounted.current) setStarting(false);
    }
  }

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    const canvas = document.createElement("canvas");
    let timer = 0, staleTimer = 0, lastVideoTime = -1;
    const clearHidden = () => { if (document.hidden) { setObservation(null); setImage(null); setStatus("Paused while this window is hidden"); } };
    document.addEventListener("visibilitychange", clearHidden);
    async function poll() {
      if (controller.signal.aborted || current.current?.id !== session!.id) return;
      let timeout = 0;
      try {
        if (document.hidden) return;
        let next: ParkingObservation;
        const sentAt = performance.now();
        timeout = window.setTimeout(() => controller.abort(), 8000);
        if (session!.source === "network") {
          next = await request<ParkingObservation>(`/parking/sessions/${session!.id}/frame`, { signal: controller.signal });
        } else {
          const video = element.current;
          if (!video || video.readyState < 2 || !video.videoWidth) return;
          if (source === "video" && (video.paused || video.ended || Math.abs(video.currentTime - lastVideoTime) < 0.035)) {
            setObservation(null); setStatus(video.ended ? "Video finished" : "Video paused"); return;
          }
          const ratio = Math.min(1, 960 / video.videoWidth, 720 / video.videoHeight);
          canvas.width = Math.round(video.videoWidth * ratio); canvas.height = Math.round(video.videoHeight * ratio);
          canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
          const timestamp = source === "video" ? video.currentTime : performance.now() / 1000;
          const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.85));
          if (!blob || controller.signal.aborted) return;
          const body = new FormData(); body.append("file", blob, "parking.jpg");
          if (source === "video") { body.append("timestamp_s", String(timestamp)); lastVideoTime = timestamp; }
          next = await request<ParkingObservation>(`/parking/sessions/${session!.id}/frame`, { method: "POST", body, signal: controller.signal });
        }
        if (controller.signal.aborted || document.hidden || current.current?.id !== session!.id) return;
        const { image: _previewImage, evidence: nextEvidence, ...event } = next;
        latestObservation.current = next;
        saveEvidence(nextEvidence);
        if (log.current.length < 10_000) log.current.push({ ...event, segment_id: nextEvidence.segment_id, received_at: new Date().toISOString() });
        window.clearTimeout(staleTimer);
        if (performance.now() - sentAt > 2000) { setObservation(null); setStatus("Processing is delayed · check surroundings"); return; }
        setObservation(next); setStatus("Observing · check surroundings"); setAspect(next.frame_aspect);
        if (next.image) setImage(next.image);
        staleTimer = window.setTimeout(() => { setObservation(null); setImage(null); setStatus("No fresh detection · check surroundings"); }, 2000);
      } catch (error) {
        if (!controller.signal.aborted) setNotice((error as Error).message);
        if (current.current?.id === session!.id) { stop(); setStatus("Camera disconnected"); }
      } finally {
        window.clearTimeout(timeout);
        if (controller.signal.aborted && current.current?.id === session!.id) { stop(); setNotice("Camera processing timed out. Start again."); }
        if (!controller.signal.aborted && current.current?.id === session!.id) timer = window.setTimeout(() => void poll(), 120);
      }
    }
    void poll();
    return () => { controller.abort(); window.clearTimeout(timer); window.clearTimeout(staleTimer); document.removeEventListener("visibilitychange", clearHidden); };
  }, [session, source]);

  useEffect(() => {
    if (!sound || !observation || !["obstacle", "cross_traffic", "shadow_cue"].includes(observation.state) || Date.now() - alarmTime.current < 2500 || document.hidden) return;
    const context = audio.current;
    if (!context || context.state !== "running") return;
    alarmTime.current = Date.now();
    for (const delay of [0, 0.22]) {
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.frequency.value = observation.state === "shadow_cue" ? 450 : 700; gain.gain.value = 0.045;
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(context.currentTime + delay); oscillator.stop(context.currentTime + delay + 0.12);
    }
  }, [observation, sound]);

  function selectSource(next: Source) {
    stop(); setSource(next); setNotice("");
  }

  function importVideo(file: File) {
    stop(); setSource("video");
    if (objectURL.current) URL.revokeObjectURL(objectURL.current);
    objectURL.current = URL.createObjectURL(file); setVideoURL(objectURL.current); setFilename(file.name); setNotice("");
  }

  function downloadLog() {
    const blob = new Blob([JSON.stringify({ ...logSource.current, exported_at: new Date().toISOString(), evidence_segments: [...evidenceSegments.current.values()], frames: log.current }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = "umbra-parking-session.json"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function saveEvidence(next: Evidence) {
    evidenceSegments.current.set(next.segment_id, next);
    if (evidenceSegments.current.size > 20) evidenceSegments.current.delete(evidenceSegments.current.keys().next().value!);
    setEvidence(next);
  }

  async function reviewCue(id: number, outcome: "first_visible" | "unrelated" | "unreviewed", visible?: number) {
    if (!session || !evidence) return;
    const sessionId = session.id;
    try {
      const timestamp = outcome === "first_visible" ? visible ?? element.current?.currentTime : undefined;
      const next = await request<Evidence>(`/parking/sessions/${sessionId}/episodes/${id}/review`, { method: "POST", body: JSON.stringify({ outcome, visible_s: timestamp, segment_id: evidence.segment_id }) });
      if (current.current?.id !== sessionId) return;
      saveEvidence(next); setNotice("");
      if (log.current.length < 10_000) log.current.push({ type: "manual_review", segment_id: next.segment_id, event_id: id, outcome, visible_s: timestamp, received_at: new Date().toISOString() });
    } catch (error) { setNotice((error as Error).message); }
  }

  async function changeZone(nextZone: string) {
    if (!session) return;
    try {
      await request(`/parking/sessions/${session.id}/shadow-zone`, { method: "PUT", body: JSON.stringify({ zone: nextZone }) });
      setZone(nextZone); setObservation(null);
      if (log.current.length < 10_000) log.current.push({ type: "shadow_zone", zone: nextZone, timestamp_s: latestObservation.current?.timestamp_s, received_at: new Date().toISOString() });
    } catch (error) { setNotice((error as Error).message); }
  }

  const warning = observation && ["obstacle", "cross_traffic"].includes(observation.state);
  const message = observation ? parkingMessage(observation, mirrored) : status;
  const boxHeight = 1000 / aspect;
  const shadowRegion = observation?.shadow.region ? screenBox(observation.shadow.region, mirrored) : null;
  const direction = observation?.alerts.map(item => mirrored ? item.side === "left" ? "right" : "left" : item.side) ?? [];

  return <main className="parking-shell">
    <header className="parking-header"><a href="/parking.html" className="brand"><span className="brand-mark">◒</span>umbra.</a><span>Parking camera</span><div className="parking-clock"><span>{clock.toLocaleDateString()}</span><time>{clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div><a className="button ghost" href="/research.html">Saved trials</a></header>
    <div className="parking-toolbar"><div className="parking-sources" aria-label="Camera source"><button className={source === "camera" ? "selected" : ""} disabled={starting} onClick={() => selectSource("camera")}><Camera size={16} />Camera</button><button className={source === "video" ? "selected" : ""} disabled={starting} onClick={() => selectSource("video")}><Video size={16} />Video</button><button className={source === "network" ? "selected" : ""} disabled={starting} onClick={() => selectSource("network")}>LAN camera</button></div><div className="parking-options"><label><input type="checkbox" checked={mirrored} onChange={event => setMirrored(event.target.checked)} />Mirror</label><label><input type="checkbox" checked={guides} onChange={event => setGuides(event.target.checked)} />Guides</label><label><input type="checkbox" checked={objects} onChange={event => setObjects(event.target.checked)} />Objects</label><button className="button ghost" aria-pressed={sound} aria-label={sound ? "Mute warnings" : "Enable warning sound"} onClick={() => { if (!audio.current) audio.current = new AudioContext(); void audio.current.resume(); setSound(value => !value); }}>{sound ? <Volume2 size={17} /> : <VolumeX size={17} />}</button></div></div>
    {notice && <div className="notice" role="alert">{notice}</div>}
    <section className={`parking-feed ${warning ? "warning" : ""}`} aria-label="Parking camera feed">
      <video ref={element} src={source === "video" ? videoURL || undefined : undefined} autoPlay={source === "camera"} muted playsInline controls={source === "video"} className={mirrored ? "mirrored" : ""} onLoadedMetadata={event => setAspect(event.currentTarget.videoWidth / event.currentTarget.videoHeight)} onError={() => setNotice("This video cannot be played by your browser. Try an H.264 MP4.")} />
      {image && <img className={mirrored ? "mirrored" : ""} src={image} alt="LAN parking camera frame" />}
      {!running && (source !== "video" || !videoURL) && <div className="parking-placeholder"><Camera size={44} strokeWidth={1} /><h1>See what is approaching.</h1><p>Connect a rear-facing camera or test a parking video.</p>{source === "camera" && <button className="button primary" disabled={starting} onClick={() => void start()}>{starting ? "Preparing detector…" : "Start camera"}</button>}{source === "video" && <button className="button primary" onClick={() => input.current?.click()}>Choose video</button>}</div>}
      {running && <svg className="parking-overlay" viewBox={`0 0 1000 ${boxHeight}`} preserveAspectRatio="xMidYMid meet" aria-label="Detected road users and exit path">
        {guides && <g className="parking-guides"><path d={`M340 ${boxHeight * .42} V${boxHeight * .94} M660 ${boxHeight * .42} V${boxHeight * .94}`} /><path d={`M340 ${boxHeight * .55} H660`} stroke="#66d9a0" /><path d={`M340 ${boxHeight * .72} H660`} stroke="#edcd6c" /><path d={`M340 ${boxHeight * .90} H660`} stroke="#ed8d80" /></g>}
        {guides && shadowRegion && <rect x={shadowRegion[0] * 1000} y={shadowRegion[1] * boxHeight} width={shadowRegion[2] * 1000} height={shadowRegion[3] * boxHeight} fill="#e7b65108" stroke="#e7b65155" strokeWidth="1" strokeDasharray="3 8" />}
        {objects && observation?.detections.map(item => {
          const [x, y, w, h] = screenBox(item.box, mirrored), colour = item.risk === "observed" ? "#a3e6df" : "#ff786f";
          return <g key={item.id}><rect x={x * 1000} y={y * boxHeight} width={w * 1000} height={h * boxHeight} rx="3" fill="none" stroke={colour} strokeWidth="2.5" /><text x={Math.max(5, x * 1000)} y={Math.max(20, y * boxHeight - 8)} fill={colour} stroke="#07100d" strokeWidth="4" paintOrder="stroke" fontSize="17">{item.label} · {Math.round(item.score * 100)}%</text></g>;
        })}
        {observation?.shadow.cues.map(cue => { const box = screenBox(cue.box, mirrored); return <g key={cue.id}><polygon points={cue.contour.map(([x, y]) => `${(mirrored ? 1 - x : x) * 1000},${y * boxHeight}`).join(" ")} fill="#ffd07422" stroke="#ffd074" strokeWidth="2.5" /><text x={box[0] * 1000} y={Math.max(20, box[1] * boxHeight - 9)} fill="#ffd074" stroke="#17130b" strokeWidth="4" paintOrder="stroke" fontSize="16">moving shadow · source unconfirmed</text></g>; })}
      </svg>}
      {running && <span className="parking-feed-label">{source === "video" ? "VIDEO REPLAY" : "LIVE"} · {observation ? `${observation.processing_ms} ms` : "waiting"}</span>}
    </section>
    <div className={`parking-status ${warning ? "danger" : observation?.state === "shadow_cue" ? "caution" : ""}`} role="status" aria-live="polite"><span className="parking-status-icon">{direction.includes("left") && warning ? <ArrowLeft size={24} /> : <span className="parking-status-dot" />}</span><strong>{message}</strong><span>{direction.includes("right") && warning && <ArrowRight size={24} />}</span></div>
    {observation && <div className="parking-signal-status"><span>Indirect: {observation.shadow.message}{observation.shadow.progress !== undefined ? ` · ${Math.round(observation.shadow.progress * 100)}%` : ""}</span><span>Visible road users: {observation.detections.length}</span></div>}
    <footer className="parking-controls">
      <div className="parking-source-controls">
        {source === "camera" && devices.length > 1 && <select aria-label="Camera device" value={device} disabled={running || starting} onChange={event => setDevice(event.target.value)}><option value="">Default rear-facing camera</option>{devices.map(item => <option value={item.deviceId} key={item.deviceId}>{item.label || "Camera"}</option>)}</select>}
        {source === "video" && <><button className="button secondary" disabled={starting} onClick={() => input.current?.click()}><Upload size={15} />{filename ? "Change video" : "Choose video"}</button>{filename && <span className="parking-filename">{filename}</span>}</>}
        {source === "network" && <input className="parking-rtsp" type="password" aria-label="LAN camera RTSP address" placeholder="rtsp://192.168.1.20/stream" value={cameraURL} disabled={running || starting} onChange={event => setCameraURL(event.target.value)} />}
        {!running && <button className="button primary" disabled={starting || (source === "video" && !videoURL) || (source === "network" && !cameraURL.trim())} onClick={() => void start()}>{starting ? "Preparing detector…" : source === "video" ? "Start detection" : "Connect camera"}</button>}
        {(running || starting) && <button className="button secondary" onClick={stop}><Square size={13} />Stop</button>}
        {log.current.length > 0 && <button className="button ghost" onClick={downloadLog}>Download session log</button>}
      </div>
      <details className="parking-shadow-settings"><summary>Ground observation settings</summary><p>Shadow monitoring starts automatically once the camera is stopped and the visible ground is clear. Select only ground that is actually visible. Camera movement suspends indirect warnings; visible-object detection continues.</p><label>Watch <select aria-label="Ground observation zone" value={zone} disabled={!session || starting} onChange={event => void changeZone(event.target.value)}><option value="ground">All lower ground</option><option value="left">{mirrored ? "Right ground" : "Left ground"}</option><option value="right">{mirrored ? "Left ground" : "Right ground"}</option></select></label><button className="button secondary" disabled={!session || starting} onClick={() => { if (session) void request(`/parking/sessions/${session.id}/reference`, { method: "POST" }).then(() => { setObservation(null); if (log.current.length < 10_000) log.current.push({ type: "reference_reset", timestamp_s: latestObservation.current?.timestamp_s, received_at: new Date().toISOString() }); }).catch(error => setNotice(error.message)); }}>Relearn stopped view</button></details>
      <ParkingEvidence key={evidence?.segment_id ?? "none"} evidence={evidence} replay={source === "video"} active={!!session} mirrored={mirrored} onReview={reviewCue} />
      <p className="parking-footnote">Experimental parking view · guides are image references, not measured distances · always check surroundings.</p>
    </footer>
    <input ref={input} type="file" accept="video/*" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) importVideo(file); }} />
  </main>;
}
