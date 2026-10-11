"use client";

import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useCallback,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  animate,
  useInView,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import {
  Box,
  Camera,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  ScanLine,
} from "lucide-react";
import "./corner-showcase.css";

const CornerWorld = lazy(() => import("./CornerWorld"));
export type SceneView = "perspective" | "camera" | "overhead";
export type SceneLabels = {
  corner: RefObject<HTMLSpanElement | null>;
  region: RefObject<HTMLSpanElement | null>;
  camera: RefObject<HTMLSpanElement | null>;
};
export const SCENE_DURATION = 10;
const stages = [
  {
    title: "Outside the frame",
    detail:
      "The subject approaches behind the corner. The camera sees only the empty pavement.",
    progress: 0.06,
  },
  {
    title: "The shadow arrives",
    detail:
      "A cast shadow reaches the visible ground while the subject is still behind the corner.",
    progress: 0.35,
  },
  {
    title: "The subject enters",
    detail:
      "The subject clears the corner. Umbra compares this moment with the earlier shadow signal.",
    progress: 0.82,
  },
];

export function SceneFallback({ loading = false }: { loading?: boolean }) {
  return (
    <div className="scene-fallback">
      <Box size={32} strokeWidth={1} />
      <p>
        {loading ? "Preparing the corner scene" : "The 3D scene needs WebGL"}
      </p>
      <span>
        {loading
          ? "Geometry, light, and a different perspective."
          : "Use the sequence controls below to explore what happens."}
      </span>
    </div>
  );
}
class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <SceneFallback /> : this.props.children;
  }
}

export default function CornerShowcase({
  compact = false,
  autoPlay = false,
}: {
  compact?: boolean;
  autoPlay?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const cornerLabel = useRef<HTMLSpanElement>(null);
  const regionLabel = useRef<HTMLSpanElement>(null);
  const cameraLabel = useRef<HTMLSpanElement>(null);
  const active = useInView(root, { margin: "100px" });
  const reduced = useReducedMotion();
  const progress = useMotionValue(autoPlay ? 0 : 0.35);
  const [readout, setReadout] = useState(autoPlay ? 0 : 0.35);
  const [playing, setPlaying] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const autoplayHandled = useRef(false);
  const handleSceneReady = useCallback(() => setSceneReady(true), []);
  const [view, setView] = useState<SceneView>("perspective");
  const [reset, setReset] = useState(0);
  const [pageVisible, setPageVisible] = useState(true);
  const stage = readout < 0.28 ? 0 : readout < 0.49 ? 1 : 2;
  useEffect(() => {
    let last = 0;
    return progress.on("change", (value) => {
      const now = performance.now();
      if (now - last > 80 || value === 0 || value === 1 || !playing) {
        setReadout(value);
        last = now;
      }
    });
  }, [progress, playing]);
  useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (!active || !pageVisible || reduced) setPlaying(false);
  }, [active, pageVisible, reduced]);
  useEffect(() => {
    if (
      !autoPlay ||
      autoplayHandled.current ||
      !sceneReady ||
      !active ||
      !pageVisible ||
      reduced === null
    )
      return;
    autoplayHandled.current = true;
    if (!reduced) setPlaying(true);
  }, [autoPlay, sceneReady, active, pageVisible, reduced]);
  useEffect(() => {
    if (!playing) return;
    const playback = animate(progress, 1, {
      duration: Math.max(0, 1 - progress.get()) * SCENE_DURATION,
      ease: "linear",
      onComplete: () => setPlaying(false),
    });
    return () => playback.stop();
  }, [playing, progress]);
  const seek = (value: number) => {
    autoplayHandled.current = true;
    setPlaying(false);
    progress.set(value);
    setReadout(value);
  };
  const views: { id: SceneView; label: string; icon: typeof Box }[] = [
    { id: "perspective", label: "3D scene", icon: Box },
    { id: "camera", label: "Camera view", icon: Camera },
    { id: "overhead", label: "Top view", icon: Maximize2 },
  ];
  return (
    <div ref={root} className={`corner-showcase ${compact ? "compact" : ""}`}>
      <div
        className="scene-view-tabs"
        role="group"
        aria-label="Scene viewpoint"
      >
        {views.map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            key={id}
            aria-pressed={view === id}
            onClick={() => {
              setView(id);
              setReset((value) => value + 1);
            }}
          >
            <Icon size={14} strokeWidth={1.5} />
            {label}
          </button>
        ))}
        <button
          type="button"
          className="scene-reset"
          aria-label="Reset scene view"
          onClick={() => {
            setView("perspective");
            setReset((value) => value + 1);
          }}
        >
          <RotateCcw size={14} />
        </button>
      </div>
      <div
        className="scene-canvas"
        role="img"
        aria-label="Interactive three-dimensional model of a camera watching a concrete corner, with a walking subject casting a shadow onto visible pavement. Drag to orbit; use the viewpoint buttons or sequence controls for keyboard access."
      >
        <SceneBoundary>
          <Suspense fallback={<SceneFallback loading />}>
            <CornerWorld
              labels={{
                corner: cornerLabel,
                region: regionLabel,
                camera: cameraLabel,
              }}
              progress={progress}
              onReady={handleSceneReady}
              view={view}
              reset={reset}
              reduced={!!reduced}
            />
          </Suspense>
        </SceneBoundary>
        <span
          ref={cornerLabel}
          className="world-label-projected"
          aria-hidden="true"
        >
          <span className="world-label">Occluding corner</span>
        </span>
        <span
          ref={regionLabel}
          className="world-label-projected"
          aria-hidden="true"
        >
          <span className="world-label accent">Shadow region</span>
        </span>
        <span
          ref={cameraLabel}
          className="world-label-projected"
          aria-hidden="true"
        >
          <span className="world-label">Corner camera</span>
        </span>
        <span className="scene-orbit-hint">Drag to explore</span>
      </div>
      <div className="scene-transport">
        <button
          type="button"
          className="scene-play"
          aria-label={playing ? "Pause sequence" : "Play sequence"}
          onClick={() => {
            autoplayHandled.current = true;
            if (progress.get() >= 0.99) progress.set(0);
            setPlaying((value) => !value);
          }}
        >
          {playing ? (
            <Pause size={15} fill="currentColor" />
          ) : (
            <Play size={15} fill="currentColor" />
          )}
        </button>
        <span className="scene-time">
          {(readout * SCENE_DURATION).toFixed(1)}
          <span> / {SCENE_DURATION}.0 s</span>
        </span>
        <input
          type="range"
          aria-label="Scene sequence position"
          min="0"
          max="1"
          step="0.001"
          value={readout}
          onChange={(event) => seek(Number(event.target.value))}
        />
        <span className="scene-stage-state">
          <ScanLine size={14} />
          {stages[stage].title}
        </span>
      </div>
      {!compact && (
        <div
          className="scene-story"
          role="group"
          aria-label="Explore the sequence"
        >
          {stages.map((item, index) => (
            <button
              type="button"
              key={item.title}
              className={stage === index ? "selected" : ""}
              aria-pressed={stage === index}
              onClick={() => seek(item.progress)}
            >
              <span>{item.title}</span>
              <p>{item.detail}</p>
            </button>
          ))}
        </div>
      )}
      <p className="scene-disclaimer">
        Illustrative 3D simulation. Actual results depend on your footage and
        lighting.
      </p>
    </div>
  );
}
