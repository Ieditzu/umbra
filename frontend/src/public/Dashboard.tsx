import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  CreditCard,
  Download,
  KeyRound,
  Plus,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import {
  api,
  base,
  date,
  stateName,
  type Analysis,
  type Media,
  type Result,
} from "./api";
import {
  Code,
  CopyButton,
  Notice,
  Pending,
  Status,
  useConfig,
  useMe,
} from "./App";

function Confirm({
  trigger,
  title,
  children,
  action,
  pending = false,
  error,
  confirmWord = "DELETE",
  actionLabel = "Confirm deletion",
}: {
  trigger: ReactNode;
  title: string;
  children: ReactNode;
  action: () => void;
  pending?: boolean;
  error?: string;
  confirmWord?: string;
  actionLabel?: string;
}) {
  const [text, setText] = useState("");
  return (
    <Dialog.Root onOpenChange={() => setText("")}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            document.getElementById("confirm-input")?.focus();
          }}
        >
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description asChild>
            <div className="dialog-description">{children}</div>
          </Dialog.Description>
          <label>
            Type {confirmWord} to confirm
            <input
              id="confirm-input"
              autoComplete="off"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          {error && <Notice error>{error}</Notice>}
          <div className="dialog-actions">
            <Dialog.Close className="button secondary">Cancel</Dialog.Close>
            <button
              className="button danger"
              disabled={text !== confirmWord || pending}
              onClick={action}
            >
              {pending ? "Please wait…" : actionLabel}
            </button>
          </div>
          <Dialog.Close
            className="dialog-close icon-button"
            aria-label="Close dialog"
          >
            <X size={18} />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function NewAnalysis() {
  const navigate = useNavigate();
  const query = useQueryClient();
  const me = useMe();
  const config = useConfig();
  const [name, setName] = useState("");
  const [files, setFiles] = useState<Record<string, File>>({});
  const [media, setMedia] = useState<Record<string, Media>>({});
  const [phase, setPhase] = useState("");
  const [recordedAt, setRecordedAt] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [region, setRegion] = useState({ x: "", y: "", width: "", height: "" });
  const [review, setReview] = useState(false);
  const idem = useRef({ payload: "", key: "" });
  const mutation = useMutation({
    mutationFn: async () => {
      if (!files.calibration || !files.main)
        throw new Error("Choose calibration and trial clips.");
      if ((latitude === "") !== (longitude === ""))
        throw new Error(
          "Provide both latitude and longitude, or leave both empty.",
        );
      if (review && Object.values(region).some((x) => !x.trim()))
        throw new Error("Provide all four shadow-region coordinates.");
      const uploaded = { ...media };
      for (const role of ["calibration", "main", "ground_truth"]) {
        if (files[role] && !uploaded[role]) {
          setPhase(
            `Uploading ${role === "main" ? "trial" : role === "ground_truth" ? "reference" : "calibration"}…`,
          );
          const form = new FormData();
          form.append("role", role);
          form.append("file", files[role]);
          uploaded[role] = await api<Media>("/media", {
            method: "POST",
            body: form,
          });
          setMedia({ ...uploaded });
        }
      }
      const payload = JSON.stringify({
        name: name.trim(),
        calibration_media_id: uploaded.calibration.id,
        main_media_id: uploaded.main.id,
        ...(uploaded.ground_truth
          ? { ground_truth_media_id: uploaded.ground_truth.id }
          : {}),
        ...(recordedAt
          ? { recorded_at: new Date(recordedAt).toISOString() }
          : {}),
        ...(latitude !== ""
          ? { latitude: Number(latitude), longitude: Number(longitude) }
          : {}),
        ...(review
          ? {
              shadow_region: Object.fromEntries(
                Object.entries(region).map(([key, value]) => [
                  key,
                  Number(value),
                ]),
              ),
            }
          : {}),
      });
      if (idem.current.payload !== payload)
        idem.current = { payload, key: crypto.randomUUID() };
      setPhase("Queueing analysis…");
      return api<{ id: string }>("/analyses", {
        method: "POST",
        headers: { "Idempotency-Key": idem.current.key },
        body: payload,
      });
    },
    onSuccess: async (data) => {
      await Promise.all([
        query.invalidateQueries({ queryKey: ["me"] }),
        query.invalidateQueries({ queryKey: ["analyses"] }),
      ]);
      navigate(`/dashboard/analyses/${data.id}`);
    },
    onSettled: () => setPhase(""),
  });
  const remove = useMutation({
    mutationFn: ({ role, clip }: { role: string; clip: Media }) =>
      api(`/media/${clip.id}`, { method: "DELETE" }).then(() => {
        setMedia((current) => {
          const next = { ...current };
          delete next[role];
          return next;
        });
        setFiles((current) => {
          const next = { ...current };
          delete next[role];
          return next;
        });
      }),
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }
  function choose(role: string, file?: File) {
    if (!file) return;
    if (file.size > (config.data?.max_upload_bytes ?? 250 * 1024 * 1024)) {
      setPhase("This clip exceeds the upload size limit.");
      return;
    }
    setFiles((current) => ({ ...current, [role]: file }));
    setMedia((current) => {
      const next = { ...current };
      delete next[role];
      return next;
    });
    setPhase("");
  }
  return (
    <>
      <Link to="/dashboard" className="back-link">
        <ArrowLeft size={15} />
        All analyses
      </Link>
      <div className="page-heading">
        <div>
          <h1>New analysis</h1>
          <p>Compare a trial with an empty scene from the same fixed camera.</p>
        </div>
        <span className="pill neutral">1 credit</span>
      </div>
      <form className="analysis-form" onSubmit={submit}>
        <section className="form-section">
          <h2>Trial details</h2>
          <label>
            Analysis name
            <input
              required
              maxLength={100}
              placeholder="e.g. West entrance, afternoon trial"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={mutation.isPending}
            />
          </label>
        </section>
        <section className="form-section">
          <div className="section-top">
            <div>
              <h2>Source footage</h2>
              <p>
                MP4, WebM or MOV · up to{" "}
                {config.data
                  ? Math.round(config.data.max_upload_bytes / 1024 / 1024)
                  : 250}{" "}
                MB per clip
              </p>
            </div>
            <Link to="/docs#uploads">
              Recording guide <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="upload-grid">
            {[
              {
                role: "calibration",
                title: "Empty calibration",
                limit: "Up to 18 seconds",
                help: "The same scene and lighting, with nobody in view.",
                required: true,
              },
              {
                role: "main",
                title: "Corner trial",
                limit: "Up to 60 seconds",
                help: "Keep the first 1.8 seconds empty before the approach.",
                required: true,
              },
              {
                role: "ground_truth",
                title: "Reference clip",
                limit: "Optional · up to 60 seconds",
                help: "A second view of the hidden route for independent labels.",
                required: false,
              },
            ].map(({ role, title, limit, help, required }) => (
              <div className="upload-group" key={role}>
                <h3>
                  {title}
                  {required && <span>Required</span>}
                </h3>
                <label
                  className={`upload-target ${files[role] ? "selected" : ""}`}
                >
                  <input
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
                    aria-label={title}
                    disabled={mutation.isPending || !!media[role]}
                    onChange={(e) => {
                      choose(role, e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  {files[role] ? (
                    <>
                      <Video size={25} />
                      <strong>{files[role].name}</strong>
                      <span>
                        {(files[role].size / 1024 / 1024).toFixed(1)} MB{" "}
                        {media[role] && "· Uploaded"}
                      </span>
                    </>
                  ) : (
                    <>
                      <Upload size={25} />
                      <strong>Choose a video</strong>
                      <span>{limit}</span>
                    </>
                  )}
                </label>
                <p>{help}</p>
                {files[role] && (
                  <button
                    type="button"
                    className="inline-button"
                    disabled={mutation.isPending || remove.isPending}
                    onClick={() => {
                      if (media[role]) {
                        remove.mutate({ role, clip: media[role] });
                      } else {
                        setFiles((current) => {
                          const next = { ...current };
                          delete next[role];
                          return next;
                        });
                      }
                    }}
                  >
                    Remove clip
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
        <section className="form-section">
          <h2>
            Scene context <span className="optional">Optional</span>
          </h2>
          <p>Recording time and location help interpret the available light.</p>
          <div className="form-columns">
            <label>
              Recording time
              <input
                type="datetime-local"
                value={recordedAt}
                onChange={(e) => setRecordedAt(e.target.value)}
                disabled={mutation.isPending}
              />
              <small>Interpreted in your current time zone.</small>
            </label>
            <label>
              Latitude
              <input
                type="number"
                min="-90"
                max="90"
                step="any"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="44.4268"
                disabled={mutation.isPending}
              />
            </label>
            <label>
              Longitude
              <input
                type="number"
                min="-180"
                max="180"
                step="any"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="26.1025"
                disabled={mutation.isPending}
              />
            </label>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={review}
              onChange={(e) => setReview(e.target.checked)}
              disabled={mutation.isPending}
            />
            Provide a reviewed shadow region
          </label>
          {review && (
            <>
              <p className="small-copy">
                Use normalized coordinates (0–1) for a lit pavement rectangle
                inside the trial frame. Required for streetlamp analysis when
                the recording time places the sun below the horizon.
              </p>
              <div className="region-grid">
                {Object.keys(region).map((key) => (
                  <label key={key}>
                    {key === "x"
                      ? "Left (x)"
                      : key === "y"
                        ? "Top (y)"
                        : key === "width"
                          ? "Width"
                          : "Height"}
                    <input
                      type="number"
                      required
                      min={key === "x" || key === "y" ? 0 : 0.021}
                      max="1"
                      step="any"
                      value={region[key as keyof typeof region]}
                      onChange={(e) =>
                        setRegion((current) => ({
                          ...current,
                          [key]: e.target.value,
                        }))
                      }
                      disabled={mutation.isPending}
                    />
                  </label>
                ))}
              </div>
            </>
          )}
        </section>
        {mutation.error && <Notice error>{mutation.error.message}</Notice>}
        {remove.error && <Notice error>{remove.error.message}</Notice>}
        {phase && <Notice>{phase}</Notice>}
        {me.data?.available === 0 && (
          <Notice>
            You have no available credits.{" "}
            <Link to="/dashboard/billing">Manage credits</Link>
          </Notice>
        )}
        <div className="form-footer">
          <p>
            One credit per completed result. Processing failures release your
            credit.
            <br />
            Footage and evidence files expire after 30 days.
          </p>
          <button
            className="button"
            disabled={
              mutation.isPending ||
              !me.data?.verified ||
              (me.data?.available ?? 0) < 1
            }
          >
            {mutation.isPending ? phase : "Run analysis"}
            <ChevronRight size={17} />
          </button>
        </div>
      </form>
    </>
  );
}

function SignalChart({ result }: { result: Result }) {
  const timeline = result.timeline ?? [];
  if (!timeline.length) return null;
  const last = timeline[timeline.length - 1].timestamp_s || 1;
  const line = (key: "presence_probability" | "los_probability") =>
    timeline
      .map(
        (point, i) =>
          `${i ? "L" : "M"}${40 + (point.timestamp_s / last) * 710},${190 - Math.min(1, Math.max(0, point[key])) * 150}`,
      )
      .join(" ");
  return (
    <section className="result-section">
      <div className="section-top">
        <h2>Signal over time</h2>
        <div className="chart-legend">
          <span className="shadow-legend">Shadow signal</span>
          <span>Entry into view</span>
        </div>
      </div>
      <svg
        className="signal-chart"
        viewBox="0 0 790 235"
        role="img"
        aria-label="Measured shadow signal and entry probability over time"
      >
        {[0, 0.5, 1].map((value) => (
          <g key={value}>
            <line
              x1="40"
              y1={190 - value * 150}
              x2="750"
              y2={190 - value * 150}
              stroke="var(--border)"
            />
            <text
              x="5"
              y={195 - value * 150}
              fill="var(--muted-foreground)"
              fontSize="12"
            >
              {value}
            </text>
          </g>
        ))}
        <path
          d={line("los_probability")}
          fill="none"
          stroke="#9daeb7"
          strokeWidth="2"
        />
        <path
          d={line("presence_probability")}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2.5"
        />
        <text x="40" y="220" fill="var(--muted-foreground)" fontSize="12">
          0 s
        </text>
        <text x="710" y="220" fill="var(--muted-foreground)" fontSize="12">
          {last.toFixed(1)} s
        </text>
      </svg>
    </section>
  );
}
export function AnalysisDetail() {
  const { id } = useParams();
  const query = useQueryClient();
  const navigate = useNavigate();
  const data = useQuery({
    queryKey: ["analysis", id],
    queryFn: () => api<Analysis>(`/analyses/${id}`),
    refetchInterval: (query) =>
      ["queued", "running"].includes(query.state.data?.status ?? "")
        ? 2500
        : false,
  });
  useEffect(() => {
    if (data.data && ["succeeded", "failed"].includes(data.data.status)) {
      query.invalidateQueries({ queryKey: ["me"] });
      query.invalidateQueries({ queryKey: ["analyses"] });
    }
  }, [data.data?.status, query]);
  const deletion = useMutation({
    mutationFn: () => api(`/analyses/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await query.invalidateQueries({ queryKey: ["analyses"] });
      navigate("/dashboard");
    },
  });
  const sourceDeletion = useMutation({
    mutationFn: async () => {
      const request = data.data?.request;
      for (const field of [
        "calibration_media_id",
        "main_media_id",
        "ground_truth_media_id",
      ]) {
        if (request?.[field])
          await api(`/media/${request[field]}`, { method: "DELETE" }).catch(
            (error) => {
              if (error.status !== 404) throw error;
            },
          );
      }
    },
    onSuccess: () => {
      query.invalidateQueries({ queryKey: ["media"] });
    },
  });
  if (data.isPending) return <Pending />;
  if (data.error || !data.data)
    return (
      <Notice error>{data.error?.message ?? "Analysis unavailable"}</Notice>
    );
  const analysis = data.data;
  const result = analysis.result;
  const running = ["queued", "running"].includes(analysis.status);
  const fileURL = (kind: string) => `${base}/analyses/${id}/artifacts/${kind}`;
  return (
    <>
      <Link to="/dashboard" className="back-link">
        <ArrowLeft size={15} />
        All analyses
      </Link>
      <div className="page-heading">
        <div>
          <h1>{analysis.name}</h1>
          <p>
            Created {date(analysis.created_at)} · Files expire{" "}
            {date(analysis.expires_at)}
          </p>
        </div>
        <Status status={analysis.status} />
      </div>
      {running ? (
        <section className="processing-panel">
          <div className="scan-animation">
            <Video size={30} />
          </div>
          <h2>{analysis.message}</h2>
          <p>Your credit is reserved while we process the footage.</p>
          <progress max="1" value={analysis.progress} />
          <span>{Math.round(analysis.progress * 100)}%</span>
        </section>
      ) : analysis.status === "failed" ? (
        <>
          <Notice error>{analysis.message}</Notice>
          <Link to="/dashboard/new" className="button">
            Create a new analysis
          </Link>
        </>
      ) : (
        result && (
          <>
            <section className="result-summary">
              <div>
                <span>Analysis result</span>
                <h2>{stateName(result.state)}</h2>
                <p>{result.evidence?.limitation}</p>
              </div>
              <div className="result-numbers">
                <div>
                  <span>Lead time</span>
                  <strong>
                    {result.lead_time_s == null
                      ? "—"
                      : result.lead_time_s.toFixed(2)}
                    <small>{result.lead_time_s != null && "s"}</small>
                  </strong>
                </div>
                <div>
                  <span>Confidence score</span>
                  <strong>
                    {Math.round(result.confidence * 100)}
                    <small>%</small>
                  </strong>
                </div>
              </div>
            </section>
            <SignalChart result={result} />
            <section className="result-section">
              <h2>What the evidence says</h2>
              <ul className="reason-list">
                {(result.reasons ?? []).map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
              <div className="timing-row">
                <span>
                  Shadow onset{" "}
                  <strong>
                    {result.shadow_onset_s == null
                      ? "Not established"
                      : `${result.shadow_onset_s.toFixed(2)} s`}
                  </strong>
                </span>
                <span>
                  Entry into view{" "}
                  <strong>
                    {result.los_onset_s == null
                      ? "Not established"
                      : `${result.los_onset_s.toFixed(2)} s`}
                  </strong>
                </span>
              </div>
            </section>
            {analysis.artifacts_expired ? (
              <Notice>
                Footage and evidence files have expired. This summary remains
                available.
              </Notice>
            ) : (
              <>
                <div className="evidence-videos">
                  {result.visualization?.available && (
                    <section className="result-section">
                      <h2>Corner trial evidence</h2>
                      <video
                        controls
                        preload="metadata"
                        src={fileURL("visualization")}
                      />
                    </section>
                  )}
                  {result.visualizations?.hidden_path_available && (
                    <section className="result-section">
                      <h2>Reference path</h2>
                      <video
                        controls
                        preload="metadata"
                        src={fileURL("hidden_path_visualization")}
                      />
                    </section>
                  )}
                </div>
                <section className="result-section">
                  <div className="section-top">
                    <div>
                      <h2>Evidence files</h2>
                      <p>Download the complete bundle for offline review.</p>
                    </div>
                    <a className="button" href={fileURL("bundle")} download>
                      <Download size={17} />
                      Download bundle
                    </a>
                  </div>
                  <div className="download-links">
                    {[
                      ["result", "Result JSON"],
                      ["predictions", "Timeline CSV"],
                      ["report", "HTML report"],
                    ].map(([kind, label]) => (
                      <a
                        key={kind}
                        className="button secondary"
                        href={fileURL(kind)}
                        download
                      >
                        <Download size={15} />
                        {label}
                      </a>
                    ))}
                  </div>
                </section>
              </>
            )}
          </>
        )
      )}
      {!running && (
        <section className="danger-section">
          <div>
            <h2>Delete analysis data</h2>
            <p>
              Generated files and uploaded source clips can be removed
              independently.
            </p>
          </div>
          <div className="danger-actions">
            <Confirm
              title="Delete source clips?"
              trigger={
                <button
                  className="button secondary"
                  disabled={sourceDeletion.isSuccess}
                >
                  Delete source clips
                </button>
              }
              action={() => sourceDeletion.mutate()}
              pending={sourceDeletion.isPending}
              error={sourceDeletion.error?.message}
            >
              <p>
                Removes the calibration, trial and reference uploads for this
                analysis. Any future analysis using those clips will need new
                uploads. Generated evidence remains available.
              </p>
              {sourceDeletion.isSuccess && (
                <Notice>Source clips deleted.</Notice>
              )}
            </Confirm>
            <Confirm
              title="Delete this analysis?"
              trigger={
                <button className="button secondary">
                  <Trash2 size={15} />
                  Delete analysis
                </button>
              }
              action={() => deletion.mutate()}
              pending={deletion.isPending}
              error={deletion.error?.message}
            >
              <p>
                Permanently removes this result and generated evidence files.
                Credit transactions are retained and credits are not refunded.
              </p>
            </Confirm>
          </div>
        </section>
      )}
    </>
  );
}

type APIKey = {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  revoked_at: string | null;
};

export function StoredMedia() {
  const query = useQueryClient();
  const clips = useQuery({
    queryKey: ["media"],
    queryFn: () => api<{ items: Media[] }>("/media"),
  });
  const [selected, setSelected] = useState("");
  const deletion = useMutation({
    mutationFn: (id: string) => api(`/media/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      query.invalidateQueries({ queryKey: ["media"] });
      setSelected("");
    },
  });
  return (
    <section className="settings-section">
      <div className="table-heading">
        <h2>Stored source clips</h2>
        <span>{clips.data?.items.length ?? 0} / 20 clips</span>
      </div>
      <p>
        Remove unused or abandoned uploads here. Clips used by an active
        analysis cannot be deleted.
      </p>
      {clips.isPending ? (
        <Pending />
      ) : clips.error ? (
        <Notice error>{clips.error.message}</Notice>
      ) : !clips.data?.items.length ? (
        <p>No stored footage.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Clip</th>
                <th>Role</th>
                <th>Expires</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {clips.data.items.map((clip) => (
                <tr key={clip.id}>
                  <td>
                    {clip.name}
                    <span className="table-sub">
                      {clip.metadata.duration_s?.toFixed(1)} s
                    </span>
                  </td>
                  <td>
                    {clip.role === "main"
                      ? "Trial"
                      : clip.role === "calibration"
                        ? "Calibration"
                        : "Reference"}
                  </td>
                  <td>{date(clip.expires_at)}</td>
                  <td>
                    <Confirm
                      title="Delete this source clip?"
                      trigger={
                        <button
                          className="text-button"
                          onClick={() => {
                            setSelected(clip.id);
                            deletion.reset();
                          }}
                        >
                          Delete
                        </button>
                      }
                      action={() => deletion.mutate(clip.id)}
                      pending={deletion.isPending}
                      error={
                        selected === clip.id
                          ? deletion.error?.message
                          : undefined
                      }
                    >
                      <p>
                        Permanently removes {clip.name}. Generated analysis
                        evidence remains available until its expiry. Upload this
                        clip again if you need it for a future trial.
                      </p>
                      {deletion.isSuccess && <Notice>Clip deleted.</Notice>}
                    </Confirm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function Keys() {
  const query = useQueryClient();
  const me = useMe();
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");
  const keys = useQuery({
    queryKey: ["keys"],
    queryFn: () => api<{ items: APIKey[] }>("/keys"),
  });
  const create = useMutation({
    mutationFn: () =>
      api<{ token: string }>("/keys", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: (data) => {
      setSecret(data.token);
      setName("");
      query.invalidateQueries({ queryKey: ["keys"] });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/keys/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      query.invalidateQueries({ queryKey: ["keys"] });
    },
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>API keys</h1>
          <p>Connect Umbra to your own video-analysis workflow.</p>
        </div>
        <Link to="/docs" className="text-link">
          API documentation <ArrowUpRight size={16} />
        </Link>
      </div>
      <section className="settings-section">
        <h2>Create a key</h2>
        <p>
          Keys can access all analyses and credits in your account. Store them
          on your server, never in a public frontend.
        </p>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <label>
            Key name
            <input
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Development server"
            />
          </label>
          <button
            className="button"
            disabled={create.isPending || !me.data?.verified}
          >
            <Plus size={16} />
            {create.isPending ? "Creating…" : "Create key"}
          </button>
        </form>
        {create.error && <Notice error>{create.error.message}</Notice>}
        {secret && (
          <div className="secret-panel">
            <h3>Save your key now</h3>
            <p>This is the only time the full key is displayed.</p>
            <div>
              <code>{secret}</code>
              <CopyButton value={secret} />
            </div>
            <button className="inline-button" onClick={() => setSecret("")}>
              I’ve saved my key
            </button>
          </div>
        )}
      </section>
      <section>
        <div className="table-heading">
          <h2>Your keys</h2>
          <span>
            {keys.data?.items.filter((key) => !key.revoked_at).length ?? 0}{" "}
            active
          </span>
        </div>
        {keys.isPending ? (
          <Pending />
        ) : keys.error ? (
          <Notice error>{keys.error.message}</Notice>
        ) : keys.data?.items.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Key prefix</th>
                  <th>Created</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {keys.data.items.map((key) => (
                  <tr key={key.id}>
                    <td>{key.name}</td>
                    <td>
                      <code>{key.prefix}…</code>
                    </td>
                    <td>{date(key.created_at)}</td>
                    <td>
                      <span
                        className={`pill ${key.revoked_at ? "neutral" : "succeeded"}`}
                      >
                        {key.revoked_at ? "Revoked" : "Active"}
                      </span>
                    </td>
                    <td>
                      {!key.revoked_at && (
                        <Confirm
                          title="Revoke this API key?"
                          confirmWord="REVOKE"
                          actionLabel="Revoke key"
                          trigger={
                            <button
                              className="text-button"
                              onClick={() => revoke.reset()}
                            >
                              Revoke
                            </button>
                          }
                          action={() => revoke.mutate(key.id)}
                          pending={revoke.isPending}
                          error={revoke.error?.message}
                        >
                          <p>
                            Requests using {key.name} will fail immediately
                            after revocation. Create a replacement key first if
                            a client still depends on it.
                          </p>
                        </Confirm>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state compact">
            <KeyRound size={28} />
            <h3>No keys yet</h3>
            <p>Create a key above to make your first API request.</p>
          </div>
        )}
        {revoke.error && <Notice error>{revoke.error.message}</Notice>}
      </section>
      <Code
        value={`curl "${window.location.origin}${base}/me" \\\n  -H "Authorization: Bearer $UMBRA_API_KEY"`}
        label="Test your API key"
      />
    </>
  );
}

type Transaction = {
  id: string;
  amount: number;
  kind: string;
  description: string;
  created_at: string;
};
export function Billing() {
  const me = useMe();
  const config = useConfig();
  const [params] = useSearchParams();
  const transactions = useQuery({
    queryKey: ["billing"],
    queryFn: () => api<{ items: Transaction[] }>("/billing"),
    refetchInterval: params.get("checkout") === "complete" ? 5000 : false,
  });
  const query = useQueryClient();
  useEffect(() => {
    if (transactions.data) query.invalidateQueries({ queryKey: ["me"] });
  }, [transactions.data, query]);
  const checkout = useMutation({
    mutationFn: () =>
      api<{ url: string }>("/billing/checkout", { method: "POST" }),
    onSuccess: (data) => {
      const url = new URL(data.url);
      if (url.protocol === "https:" && url.hostname === "checkout.stripe.com")
        window.location.assign(data.url);
    },
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Credits & billing</h1>
          <p>Pay for completed analyses. Keep track of every credit.</p>
        </div>
      </div>
      {params.get("checkout") === "complete" && (
        <Notice>
          Checkout finished. Credits appear after payment confirmation; this
          page updates automatically.
        </Notice>
      )}
      {params.get("checkout") === "cancelled" && (
        <Notice>Checkout was cancelled. Your balance is unchanged.</Notice>
      )}
      <div className="billing-overview">
        <div className="balance-panel">
          <span>Available credits</span>
          <strong>{me.data?.available.toLocaleString() ?? "—"}</strong>
          <p>{me.data?.reserved ?? 0} reserved for processing</p>
          <span className="balance-note">1 completed analysis = 1 credit</span>
        </div>
        <section className="purchase-panel">
          <div className="section-top">
            <CreditCard size={22} />
            <span className="pill neutral">Pay as you go</span>
          </div>
          <h2>100 analysis credits</h2>
          <div className="purchase-price">
            €10<span>€0.10 per analysis</span>
          </div>
          <p>Includes complete results and downloadable evidence.</p>
          <button
            className="button wide"
            disabled={
              !config.data?.billing_enabled ||
              !me.data?.verified ||
              checkout.isPending
            }
            onClick={() => checkout.mutate()}
          >
            {checkout.isPending
              ? "Opening checkout…"
              : config.data?.billing_enabled
                ? "Buy 100 credits"
                : "Purchases unavailable"}
            <ArrowUpRight size={16} />
          </button>
          {!config.data?.billing_enabled && (
            <p className="fine-print">
              Paid purchases aren’t enabled yet. Use your starter credits in the
              meantime.
            </p>
          )}
          {checkout.error && <Notice error>{checkout.error.message}</Notice>}
          {config.error && <Notice error>{config.error.message}</Notice>}
        </section>
      </div>
      <div className="table-heading">
        <h2>Credit history</h2>
        <span>Latest 100 transactions</span>
      </div>
      {transactions.isPending ? (
        <Pending />
      ) : transactions.error ? (
        <Notice error>{transactions.error.message}</Notice>
      ) : transactions.data?.items.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Transaction</th>
                <th>Date</th>
                <th className="align-right">Credits</th>
              </tr>
            </thead>
            <tbody>
              {transactions.data.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.description}
                    <span className="table-sub">
                      {item.kind === "starter"
                        ? "Starter allowance"
                        : item.kind === "analysis"
                          ? "Analysis usage"
                          : item.kind === "purchase"
                            ? "Credit purchase"
                            : "Operator adjustment"}
                    </span>
                  </td>
                  <td>{date(item.created_at)}</td>
                  <td
                    className={`align-right ${item.amount > 0 ? "positive" : ""}`}
                  >
                    {item.amount > 0 ? "+" : ""}
                    {item.amount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state compact">
          <CreditCard size={28} />
          <h3>No transactions yet</h3>
          <p>
            Your starter-credit grant appears here after email verification.
          </p>
        </div>
      )}
      <div className="billing-explanation">
        <Check size={18} />
        <p>
          Credits are reserved at submission and spent only when analysis
          completes. Valid no-signal results count as completed work. Processing
          failures release the reservation.
        </p>
      </div>
    </>
  );
}
