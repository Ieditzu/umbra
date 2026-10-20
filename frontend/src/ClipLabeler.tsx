import { useEffect, useRef, useState, type ReactNode } from "react";
import { Upload, Download, FileJson, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import type { Split, TrialLabel, Zone } from "./labels";
import { fromManifest, parseTags, roundTime, stem, toManifest, trialProblems, uniqueId } from "./labels";

const STORAGE_KEY = "umbra.clip-labels.v1";
const FRAME_S = 1 / 30;

type Clip = { file: File; url: string };
type Draft = TrialLabel & { tagText: string };

function stored(): { labels: TrialLabel[]; tolerance: number } {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (value && Array.isArray(value.labels)) return { labels: value.labels, tolerance: Number(value.tolerance) || 0.5 };
  } catch { /* Storage unavailable: start empty. */ }
  return { labels: [], tolerance: 0.5 };
}

function blankDraft(video: string, labels: TrialLabel[], previous?: Draft | null): Draft {
  const existing = labels.find(item => item.video === video);
  if (existing) return { ...existing, tagText: existing.tags.join(", ") };
  return {
    id: uniqueId(stem(video), labels.map(item => item.id)), video, approach: true,
    first_cue_s: undefined, first_visible_s: null, clear_s: null,
    // Keep the session's split, zone and tags: clips are usually labelled in batches.
    split: previous?.split ?? "tune", zone: previous?.zone ?? "ground",
    tags: previous?.tags ?? [], tagText: previous?.tagText ?? "",
  };
}

function seconds(value: number | null | undefined) {
  return typeof value === "number" ? `${value.toFixed(3)} s` : value === null ? "none" : "—";
}

export function ClipLabeler() {
  const initial = useRef(stored());
  const [labels, setLabels] = useState<TrialLabel[]>(initial.current.labels);
  const [tolerance, setTolerance] = useState(String(initial.current.tolerance));
  const [clips, setClips] = useState<Clip[]>([]);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [now, setNow] = useState(0);
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const importer = useRef<HTMLInputElement>(null);
  const clip = clips[index];

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ labels, tolerance: Number(tolerance) || 0.5 })); }
    catch { /* Not remembered across reloads; export to keep labels. */ }
  }, [labels, tolerance]);

  useEffect(() => () => clips.forEach(item => URL.revokeObjectURL(item.url)), [clips]);

  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (!video.current || (event.target as HTMLElement).closest("input, select, textarea")) return;
      if (event.key === ",") step(-FRAME_S);
      else if (event.key === ".") step(FRAME_S);
      else return;
      event.preventDefault();
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  function openClip(list: Clip[], next: number, previous = draft) {
    setIndex(next); setNow(0); setSaved(""); setNotice("");
    setDraft(list[next] ? blankDraft(list[next].file.name, labels, previous) : null);
  }

  function chooseClips(files: FileList | null) {
    if (!files?.length) return;
    const list = [...files].map(file => ({ file, url: URL.createObjectURL(file) }));
    setClips(list); openClip(list, 0);
  }

  function step(delta: number) {
    const element = video.current;
    if (!element) return;
    element.pause();
    element.currentTime = Math.max(0, Math.min(element.duration || Infinity, element.currentTime + delta));
  }

  function mark(field: "first_cue_s" | "first_visible_s" | "clear_s") {
    const element = video.current;
    if (!element || !draft) return;
    element.pause();
    setDraft({ ...draft, approach: true, [field]: roundTime(element.currentTime) });
    setSaved("");
  }

  function seek(value: number | null | undefined) {
    if (typeof value === "number" && video.current) { video.current.pause(); video.current.currentTime = value; }
  }

  function save(advance: boolean) {
    if (!draft) return;
    const { tagText, ...label } = { ...draft, tags: parseTags(draft.tagText), id: draft.id.trim() };
    const clash = labels.find(item => item.id === label.id && item.video !== label.video);
    const problems = [...trialProblems(label), ...(clash ? [`The id ${label.id} is already used by ${clash.video}.`] : [])];
    if (problems.length) { setNotice(problems[0]); return; }
    const next = [...labels.filter(item => item.video !== label.video), label];
    setLabels(next); setNotice(""); setSaved(`Saved ${label.id}`);
    if (advance && index + 1 < clips.length) {
      setIndex(index + 1); setNow(0);
      setDraft(blankDraft(clips[index + 1].file.name, next, { ...draft, tags: label.tags, tagText }));
    }
  }

  function download() {
    try {
      const manifest = toManifest(labels, Number(tolerance));
      const blob = new Blob([JSON.stringify(manifest, null, 2) + "\n"], { type: "application/json" });
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = "manifest.json"; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("");
    } catch (error) { setNotice((error as Error).message); }
  }

  async function importManifest(file: File | undefined) {
    if (!file) return;
    try {
      const loaded = fromManifest(JSON.parse(await file.text()));
      const videos = new Set(loaded.labels.map(item => item.video));
      setLabels([...labels.filter(item => !videos.has(item.video)), ...loaded.labels]);
      setTolerance(String(loaded.tolerance)); setNotice("");
      setSaved(`Loaded ${loaded.labels.length} labels`);
      if (clip) setDraft(blankDraft(clip.file.name, [...labels.filter(item => !videos.has(item.video)), ...loaded.labels], draft));
    } catch (error) { setNotice(`Could not load that manifest: ${(error as Error).message}`); }
  }

  function remove(target: TrialLabel) {
    setLabels(labels.filter(item => item !== target));
    if (draft?.video === target.video) setDraft(blankDraft(target.video, labels.filter(item => item !== target), draft));
  }

  const update = (patch: Partial<Draft>) => { if (draft) { setDraft({ ...draft, ...patch }); setSaved(""); } };
  const done = new Set(labels.map(item => item.video));

  return <main className="parking-shell labeler">
    <header className="parking-header"><a href="/parking.html" className="brand"><span className="brand-mark">◒</span>umbra.</a><span>Label clips</span><a className="button ghost labeler-back" href="/parking.html">Parking camera</a></header>
    <p className="labeler-intro">Mark what you see in each recording. No detection runs on this page, so labels stay independent of the warnings. Save the exported <code>manifest.json</code> in the same folder as the videos, then run <code>make evaluate</code>.</p>
    {notice && <div className="notice" role="alert">{notice}</div>}
    <div className="labeler-layout">
      <section className="labeler-player">
        <div className="parking-feed">
          {clip ? <video ref={video} src={clip.url} controls playsInline muted onTimeUpdate={event => setNow(event.currentTarget.currentTime)} onSeeked={event => setNow(event.currentTarget.currentTime)} onError={() => setNotice("This video cannot be played by your browser. Try an H.264 MP4.")} />
            : <div className="parking-placeholder"><Upload size={40} strokeWidth={1} /><h1>Choose recordings to label.</h1><p>Select one clip or a whole batch.</p><button className="button primary" onClick={() => picker.current?.click()}>Choose videos</button></div>}
        </div>
        {clip && <div className="labeler-transport">
          <button className="button ghost" disabled={index === 0} onClick={() => openClip(clips, index - 1)} aria-label="Previous clip"><ChevronLeft size={16} /></button>
          <span className="labeler-clip">{index + 1}/{clips.length} · {clip.file.name}{done.has(clip.file.name) ? " · labelled" : ""}</span>
          <button className="button ghost" disabled={index + 1 >= clips.length} onClick={() => openClip(clips, index + 1)} aria-label="Next clip"><ChevronRight size={16} /></button>
          <span className="labeler-steps"><button className="button ghost" onClick={() => step(-1)}>−1 s</button><button className="button ghost" onClick={() => step(-FRAME_S)} title="Comma key">−1 frame</button><time>{now.toFixed(3)} s</time><button className="button ghost" onClick={() => step(FRAME_S)} title="Period key">+1 frame</button><button className="button ghost" onClick={() => step(1)}>+1 s</button></span>
        </div>}
      </section>
      <section className="labeler-form" aria-label="Clip label">
        {draft ? <>
          <div className="labeler-kind"><button className={draft.approach ? "selected" : ""} onClick={() => update({ approach: true })}>Someone approaches</button><button className={!draft.approach ? "selected" : ""} onClick={() => update({ approach: false })}>Nobody came</button></div>
          {draft.approach && <div className="labeler-marks">
            <Mark title="Shadow starts" hint="First frame with a useful moving shadow or light change from the road user." value={draft.first_cue_s} onMark={() => mark("first_cue_s")} onSeek={() => seek(draft.first_cue_s)} extra={<button className={`button ghost ${draft.first_cue_s === null ? "chosen" : ""}`} onClick={() => update({ first_cue_s: null })}>No useful shadow</button>} />
            <Mark title="Visible" hint="First frame where any part of the person or vehicle is directly visible." value={draft.first_visible_s} onMark={() => mark("first_visible_s")} onSeek={() => seek(draft.first_visible_s)} />
            <Mark title="Gone" hint="When the road user no longer matters for the exit." value={draft.clear_s} onMark={() => mark("clear_s")} onSeek={() => seek(draft.clear_s)} />
          </div>}
          <div className="labeler-fields">
            <label>Clip id<input value={draft.id} onChange={event => update({ id: event.target.value })} /></label>
            <label>Use for<select value={draft.split} onChange={event => update({ split: event.target.value as Split })}><option value="tune">Tuning</option><option value="test">Testing</option></select></label>
            <label>Visible ground<select value={draft.zone} onChange={event => update({ zone: event.target.value as Zone })}><option value="ground">All lower ground</option><option value="left">Left ground</option><option value="right">Right ground</option></select></label>
            <label className="wide">Tags (comma separated)<input placeholder="left, walk, cloudy, session-1" value={draft.tagText} onChange={event => update({ tagText: event.target.value })} /></label>
          </div>
          <p className="labeler-hint">Tuning clips choose each method's settings; testing clips are scored with those settings fixed. Put later sessions and new locations in testing.</p>
          <div className="labeler-actions"><button className="button primary" onClick={() => save(true)}>{index + 1 < clips.length ? "Save and next" : "Save"}</button>{saved && <span>{saved}</span>}</div>
        </> : <p className="labeler-hint">Choose videos to start. Labels are kept in this browser until you clear them; export a manifest to keep a copy.</p>}
      </section>
    </div>
    <section className="labeler-list" aria-label="Saved labels">
      <div className="labeler-list-heading"><h2>Saved labels · {labels.length}</h2><span>{labels.filter(item => item.approach).length} approaches · {labels.filter(item => !item.approach).length} empty · {labels.filter(item => item.split === "tune").length} tuning · {labels.filter(item => item.split === "test").length} testing</span>
        <div className="labeler-buttons"><button className="button secondary" onClick={() => picker.current?.click()}><Upload size={15} />Choose videos</button><button className="button ghost" onClick={() => importer.current?.click()}><FileJson size={15} />Load manifest</button><label className="labeler-tolerance">Tolerance (s)<input type="number" min="0" max="5" step="0.1" value={tolerance} onChange={event => setTolerance(event.target.value)} /></label><button className="button primary" disabled={!labels.length} onClick={download}><Download size={15} />Export manifest</button></div></div>
      {labels.length > 0 && <div className="labeler-table"><table><thead><tr><th>Clip</th><th>Video</th><th>Use</th><th>Kind</th><th>Shadow</th><th>Visible</th><th>Gone</th><th>Tags</th><th /></tr></thead><tbody>
        {labels.map(item => <tr key={item.video + item.id}><td>{item.id}</td><td>{item.video}</td><td>{item.split}</td><td>{item.approach ? "approach" : "empty"}</td><td>{item.approach ? seconds(item.first_cue_s) : ""}</td><td>{item.approach ? seconds(item.first_visible_s) : ""}</td><td>{item.approach ? seconds(item.clear_s) : ""}</td><td>{item.tags.join(", ")}</td><td><button className="button ghost" aria-label={`Delete label ${item.id}`} onClick={() => remove(item)}><Trash2 size={14} /></button></td></tr>)}
      </tbody></table></div>}
    </section>
    <p className="parking-footnote">Shortcuts: comma and period step one frame (assumes 30 fps). Labels are human annotations; the evaluation never uses warnings to set them.</p>
    <input ref={picker} type="file" accept="video/*" multiple hidden onChange={event => { chooseClips(event.target.files); event.target.value = ""; }} />
    <input ref={importer} type="file" accept="application/json,.json" hidden onChange={event => { void importManifest(event.target.files?.[0]); event.target.value = ""; }} />
  </main>;
}

function Mark({ title, hint, value, onMark, onSeek, extra }: { title: string; hint: string; value: number | null | undefined; onMark: () => void; onSeek: () => void; extra?: ReactNode }) {
  return <div className="labeler-mark">
    <div><strong>{title}</strong><span>{hint}</span></div>
    <div className="labeler-mark-controls"><button className="button secondary" onClick={onMark}>{title} here</button>{extra}<button className="button ghost" disabled={typeof value !== "number"} onClick={onSeek}>{seconds(value)}</button></div>
  </div>;
}
