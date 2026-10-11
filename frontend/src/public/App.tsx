import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  NavLink,
  Outlet,
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  Copy,
  Plus,
  KeyRound,
  ScanLine,
  CreditCard,
  Settings,
  BookOpen,
  LogOut,
  ChevronRight,
  Menu,
  X,
  Terminal,
} from "lucide-react";
import {
  api,
  APIError,
  base,
  date,
  stateName,
  type Analysis,
  type Config,
  type User,
} from "./api";
import {
  NewAnalysis,
  AnalysisDetail,
  Keys,
  Billing,
  StoredMedia,
} from "./Dashboard";
import Landing from "./Marketing";
import CornerShowcase from "../components/CornerShowcase";

const client = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) =>
        !(error instanceof APIError && error.status < 500) && count < 1,
      staleTime: 15_000,
      refetchOnWindowFocus: true,
    },
  },
});
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api<User>("/me"),
    retry: false,
  });
}
export function useConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: () => api<Config>("/config"),
  });
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`notice ${error ? "error" : ""}`}
      role={error ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
export function Pending() {
  return (
    <div className="loading" role="status">
      <span className="spinner" />
      Loading…
    </div>
  );
}
export function Logo() {
  return (
    <Link to="/" className="brand" aria-label="Umbra home">
      <svg width="29" height="29" viewBox="0 0 32 32" aria-hidden="true">
        <path
          d="M26.8 21.5A12 12 0 1 1 21.5 5.2 9.1 9.1 0 0 0 26.8 21.5Z"
          fill="currentColor"
        />
      </svg>
      <span>
        umbra<span className="brand-period">.</span>
      </span>
    </Link>
  );
}
export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <button
      className="copy"
      aria-label={copied ? "Copied" : "Copy code"}
      onClick={() =>
        navigator.clipboard
          .writeText(value)
          .then(() => {
            setCopied(true);
            setError(false);
          })
          .catch(() => setError(true))
      }
    >
      {copied ? <Check size={16} /> : <Copy size={16} />}
      {copied ? "Copied" : error ? "Select to copy" : "Copy"}
    </button>
  );
}
export function Code({
  value,
  label = "Terminal",
}: {
  value: string;
  label?: string;
}) {
  return (
    <div className="code-panel">
      <div className="code-header">
        <span>
          <Terminal size={15} />
          {label}
        </span>
        <CopyButton value={value} />
      </div>
      <pre>
        <code>{value}</code>
      </pre>
    </div>
  );
}
function PublicLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return (
    <>
      <header className="public-header">
        <div className="container nav-row">
          <Logo />
          <nav
            className={open ? "public-nav open" : "public-nav"}
            aria-label="Main navigation"
          >
            <NavLink to="/docs">Developers</NavLink>
            <NavLink to="/pricing">Pricing</NavLink>
            <Link to="/login" className="nav-login">
              Sign in
            </Link>
            <Link to="/signup" className="button small">
              Get started <ArrowUpRight size={15} />
            </Link>
          </nav>
          <button
            className="mobile-menu icon-button"
            aria-label={open ? "Close navigation" : "Open navigation"}
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      <Outlet />
      <footer className="public-footer container">
        <div className="footer-top">
          <p>
            New ways of seeing.
            <br />
            Grounded in evidence.
          </p>
          <div>
            <Link to="/docs">Documentation</Link>
            <Link to="/pricing">Pricing</Link>
            <Link to="/login">Sign in</Link>
          </div>
        </div>
        <div className="footer-wordmark" aria-hidden="true">
          umbra<span>.</span>
        </div>
        <div className="footer-bottom">
          <span>Experimental video intelligence</span>
          <span>© {new Date().getFullYear()} Umbra</span>
        </div>
      </footer>
    </>
  );
}

const example = `curl -X POST "${window.location.origin}/api/v1/analyses" \\\n  -H "Authorization: Bearer $UMBRA_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -H "Idempotency-Key: corner-trial-001" \\\n  -d '{"name":"Corner trial",\n       "calibration_media_id":"CALIBRATION_ID",\n       "main_media_id":"TRIAL_ID"}'`;

function Pricing() {
  const config = useConfig();
  return (
    <main className="container page-public">
      <div className="page-intro">
        <span className="intro">Pricing</span>
        <h1>
          One analysis.
          <br />
          One credit.
        </h1>
        <p>
          Start with 10 free analyses after email verification. No subscription
          and no payment card to try Umbra.
        </p>
      </div>
      <div className="pricing-layout">
        <article className="price-card">
          <h2>Analysis credits</h2>
          <div className="price">
            €10<span>/ 100 credits</span>
          </div>
          <p>For your next batch of corner trials.</p>
          <ul className="check-list">
            {[
              "Full shadow-analysis pipeline",
              "Structured JSON and evidence reports",
              "Dashboard and public API access",
              "30-day footage and artifact retention",
            ].map((x) => (
              <li key={x}>
                <Check size={17} />
                {x}
              </li>
            ))}
          </ul>
          <Link to="/signup" className="button wide">
            Get started <ArrowUpRight size={16} />
          </Link>
          <p className="fine-print">
            {config.data?.billing_enabled
              ? "Purchase additional credits from your dashboard."
              : "Paid credit purchases are not available yet. Starter credits are available."}
          </p>
        </article>
        <div className="pricing-notes">
          <h2>What counts as an analysis?</h2>
          <p>
            Each completed trial costs one credit, including valid “no coverage”
            or “no reliable signal” results. These are useful measurements of
            the scene’s limitations.
          </p>
          <h3>What if processing fails?</h3>
          <p>
            A credit is reserved when a job starts. If processing fails or times
            out, it is released. Retrying an identical request with the same
            idempotency key creates no additional charge.
          </p>
          <h3>What can I upload?</h3>
          <p>
            MP4, WebM or MOV. Up to{" "}
            {config.data
              ? Math.round(config.data.max_upload_bytes / 1024 / 1024)
              : 250}{" "}
            MB per clip, 18 seconds for calibration and 60 seconds for trial or
            reference footage.
          </p>
          <h3>Who is it for?</h3>
          <p>
            Researchers and developers working with consented footage. Umbra is
            experimental software; it is not validated for safety-critical use.
          </p>
        </div>
      </div>
    </main>
  );
}

function Auth({
  mode,
}: {
  mode: "signup" | "login" | "forgot-password" | "reset-password" | "verify";
}) {
  const navigate = useNavigate();
  const query = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const token =
    new URLSearchParams(useLocation().hash.slice(1)).get("token") ?? "";
  const mutation = useMutation({
    mutationFn: () =>
      api<{ message: string }>(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(
          mode === "verify"
            ? { token }
            : mode === "reset-password"
              ? { token, password }
              : mode === "forgot-password"
                ? { email }
                : { email, password },
        ),
      }),
    onSuccess: async (data) => {
      if (mode === "signup" || mode === "login") {
        query.clear();
        navigate("/dashboard");
      } else {
        setMessage(data.message);
        await query.invalidateQueries({ queryKey: ["me"] });
      }
    },
  });
  const titles = {
    signup: "Start with the evidence.",
    login: "Welcome back.",
    "forgot-password": "Recover your account.",
    "reset-password": "Choose a new password.",
    verify: "Verify your email.",
  };
  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }
  return (
    <main className="auth-layout container">
      <div className="auth-context">
        <span className="intro">A new perspective starts here</span>
        <h1>
          Follow
          <br />
          the evidence.
        </h1>
        <p>Bring your footage. Measure the shadow. Keep the evidence.</p>
        <div className="auth-art">
          <CornerShowcase compact />
        </div>
        <div className="auth-benefits">
          <span>
            <Check size={16} />
            10 starter analyses
          </span>
          <span>
            <Check size={16} />
            Dashboard and API access
          </span>
          <span>
            <Check size={16} />
            No payment card required
          </span>
        </div>
      </div>
      <section className="auth-card">
        <h2>{titles[mode]}</h2>
        <p>
          {mode === "signup"
            ? "Create an account to get 10 credits after verification."
            : mode === "verify"
              ? "Confirm your email to unlock your starter credits."
              : "Access your analyses, API keys and credits."}
        </p>
        {mutation.error && <Notice error>{mutation.error.message}</Notice>}
        {message ? (
          <>
            <Notice>{message}</Notice>
            <Link
              className="button wide"
              to={mode === "verify" ? "/dashboard" : "/login"}
            >
              {mode === "verify" ? "Open dashboard" : "Sign in"}
            </Link>
          </>
        ) : (
          <form onSubmit={submit}>
            {["signup", "login", "forgot-password"].includes(mode) && (
              <label>
                Email address
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
            )}
            {["signup", "login", "reset-password"].includes(mode) && (
              <label>
                Password
                <input
                  type="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  required
                  minLength={mode === "login" ? undefined : 12}
                  maxLength={72}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {mode !== "login" && <small>Use 12–72 characters.</small>}
              </label>
            )}
            {["verify", "reset-password"].includes(mode) && !token && (
              <Notice error>
                This link is missing its token. Request a new email.
              </Notice>
            )}
            <button
              className="button wide"
              disabled={
                mutation.isPending ||
                (["verify", "reset-password"].includes(mode) && !token)
              }
            >
              {mutation.isPending
                ? "Please wait…"
                : mode === "signup"
                  ? "Create account"
                  : mode === "login"
                    ? "Sign in"
                    : mode === "verify"
                      ? "Verify email"
                      : mode === "reset-password"
                        ? "Save password"
                        : "Send recovery email"}
              <ArrowRight size={17} />
            </button>
          </form>
        )}
        {mode === "login" && (
          <div className="auth-links">
            <Link to="/forgot-password">Forgot password?</Link>
            <Link to="/signup">Create an account</Link>
          </div>
        )}
        {mode === "signup" && (
          <p className="auth-bottom">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        )}
      </section>
    </main>
  );
}

function DashboardLayout() {
  const me = useMe();
  const query = useQueryClient();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  useEffect(() => setMenu(false), [location.pathname]);
  useEffect(() => {
    if (!menu) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [menu]);
  const logout = useMutation({
    mutationFn: () => api("/auth/logout", { method: "POST" }),
    onSuccess: () => {
      query.clear();
      navigate("/login");
    },
  });
  const resend = useMutation({
    mutationFn: () =>
      api<{ message: string }>("/auth/resend-verification", { method: "POST" }),
  });
  if (me.isPending) return <Pending />;
  if (me.error instanceof APIError && me.error.status === 401)
    return <Navigate to="/login" replace />;
  if (me.error || !me.data)
    return (
      <div className="container">
        <Notice error>{me.error?.message ?? "Account unavailable"}</Notice>
        <button className="button" onClick={() => me.refetch()}>
          Retry
        </button>
      </div>
    );
  const user = me.data;
  return (
    <div className="dashboard-layout">
      {menu && (
        <button
          className="sidebar-backdrop"
          aria-label="Close dashboard navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`sidebar ${menu ? "visible" : ""}`}>
        <Logo />
        <button
          className="sidebar-dismiss icon-button"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        >
          <X size={19} />
        </button>
        <div className="workspace-label">
          <span className="avatar">{user.email[0].toUpperCase()}</span>
          <div>
            <strong>Personal workspace</strong>
            <span>{user.email}</span>
          </div>
        </div>
        <nav aria-label="Dashboard">
          {[
            { to: "/dashboard", label: "Analyses", icon: ScanLine, end: true },
            { to: "/dashboard/keys", label: "API keys", icon: KeyRound },
            {
              to: "/dashboard/billing",
              label: "Credits & billing",
              icon: CreditCard,
            },
            { to: "/dashboard/settings", label: "Account", icon: Settings },
          ].map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}>
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link to="/docs">
            <BookOpen size={17} />
            Documentation <ArrowUpRight size={14} />
          </Link>
          <button onClick={() => logout.mutate()} disabled={logout.isPending}>
            <LogOut size={17} />
            Sign out
          </button>
          {logout.error && <Notice error>{logout.error.message}</Notice>}
          <div className="sidebar-credit">
            <span>Available credits</span>
            <strong>{user.available.toLocaleString()}</strong>
            <Link to="/dashboard/billing">
              Manage credits <ChevronRight size={14} />
            </Link>
          </div>
        </div>
      </aside>
      <div className="dashboard-main">
        <header className="dashboard-header">
          <button
            className="mobile-menu icon-button"
            aria-label="Toggle dashboard navigation"
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span>
            Workspace <ChevronRight size={14} />
            <strong>
              {location.pathname.includes("keys")
                ? "API keys"
                : location.pathname.includes("billing")
                  ? "Credits & billing"
                  : location.pathname.includes("settings")
                    ? "Account"
                    : "Analyses"}
            </strong>
          </span>
          <Link to="/dashboard/new" className="button small">
            <Plus size={16} />
            New analysis
          </Link>
        </header>
        <main className="dashboard-content">
          {!user.verified && (
            <Notice>
              Verify your email to unlock 10 starter credits and run analyses.{" "}
              <button
                className="inline-button"
                disabled={resend.isPending}
                onClick={() => resend.mutate()}
              >
                Resend verification
              </button>
              {resend.isSuccess && <span> Email sent.</span>}
              {resend.error && <span>{resend.error.message}</span>}
            </Notice>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Analyses() {
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const parsedOffset = Number(params.get("offset") ?? 0);
  const offset =
    Number.isSafeInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
  const list = useQuery({
    queryKey: ["analyses", offset],
    queryFn: () =>
      api<{ items: Analysis[]; has_more: boolean }>(
        `/analyses?offset=${offset}&limit=20`,
      ),
    refetchInterval: (query) =>
      query.state.data?.items.some((x) =>
        ["queued", "running"].includes(x.status),
      )
        ? 3000
        : false,
  });
  useEffect(() => {
    if (list.data) client.invalidateQueries({ queryKey: ["me"] });
  }, [list.data]);
  function page(next: number) {
    const p = new URLSearchParams();
    if (next) p.set("offset", String(next));
    setParams(p);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Analyses</h1>
          <p>Your footage, results, and evidence in one place.</p>
        </div>
        <Link to="/dashboard/new" className="button">
          <Plus size={17} />
          New analysis
        </Link>
      </div>
      <div className="usage-summary">
        <div>
          <span>Available credits</span>
          <strong>
            {me.data?.available ?? "—"}
            <small>analyses</small>
          </strong>
        </div>
        <p>
          {me.data?.reserved
            ? `${me.data.reserved} credit${me.data.reserved > 1 ? "s" : ""} reserved for processing.`
            : "One completed analysis uses one credit."}
          <br />
          <Link to="/dashboard/billing">
            View credit history <ArrowUpRight size={14} />
          </Link>
        </p>
      </div>
      <div className="table-heading">
        <h2>Analysis history</h2>
        <span>Files retained for 30 days</span>
      </div>
      {list.isPending ? (
        <Pending />
      ) : list.error ? (
        <Notice error>{list.error.message}</Notice>
      ) : !list.data?.items.length ? (
        <div className="empty-state">
          <div className="empty-graphic">
            <ScanLine size={36} />
          </div>
          <h2>Your first result starts here.</h2>
          <p>
            Upload an empty calibration and a corner trial.
            <br />
            We’ll take care of the analysis and evidence report.
          </p>
          <Link className="button" to="/dashboard/new">
            <Plus size={16} />
            Create an analysis
          </Link>
          <Link to="/docs" className="text-link">
            Read the recording guide
          </Link>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Analysis</th>
                <th>Status</th>
                <th>Result</th>
                <th>Created</th>
                <th>
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link
                      to={`/dashboard/analyses/${item.id}`}
                      className="table-name"
                    >
                      {item.name}
                    </Link>
                    <span className="table-sub">{item.id.slice(0, 12)}</span>
                  </td>
                  <td>
                    <Status status={item.status} />
                  </td>
                  <td>
                    {stateName(item.state)}
                    {item.lead_time_s != null && (
                      <span className="table-sub">
                        {item.lead_time_s.toFixed(2)} s lead time
                      </span>
                    )}
                  </td>
                  <td>{date(item.created_at)}</td>
                  <td>
                    <Link
                      to={`/dashboard/analyses/${item.id}`}
                      className="icon-button"
                      aria-label={`Open ${item.name}`}
                    >
                      <ChevronRight size={18} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pagination">
            <span>
              Showing {offset + 1}–{offset + list.data.items.length}
            </span>
            <button
              disabled={offset === 0}
              onClick={() => page(Math.max(0, offset - 20))}
            >
              Previous
            </button>
            <button
              disabled={!list.data.has_more}
              onClick={() => page(offset + 20)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </>
  );
}
export function Status({ status }: { status: string }) {
  return (
    <span className={`pill ${status}`}>
      {status === "succeeded"
        ? "Complete"
        : status === "running"
          ? "Processing"
          : status === "failed"
            ? "Failed"
            : "Queued"}
    </span>
  );
}
function Account() {
  const me = useMe();
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Account</h1>
          <p>Your personal workspace and data preferences.</p>
        </div>
      </div>
      <section className="settings-section">
        <h2>Profile</h2>
        <div className="setting-row">
          <span>Email</span>
          <strong>{me.data?.email}</strong>
        </div>
        <div className="setting-row">
          <span>Email verification</span>
          <span
            className={`pill ${me.data?.verified ? "succeeded" : "queued"}`}
          >
            {me.data?.verified ? "Verified" : "Pending"}
          </span>
        </div>
        <div className="setting-row">
          <span>Password</span>
          <Link to="/forgot-password" className="text-link">
            Request password reset <ArrowUpRight size={15} />
          </Link>
        </div>
      </section>
      <section className="settings-section">
        <h2>Data retention</h2>
        <p>
          Uploaded clips and generated evidence files expire after 30 days.
          Analysis summaries and credit transactions remain in your workspace.
          You can delete completed analyses and their generated files from the
          result screen, and remove their source clips separately.
        </p>
        <p>
          Use consented footage. Umbra does not perform identity recognition or
          biometric classification.
        </p>
      </section>
      <StoredMedia />
    </>
  );
}

function Docs() {
  const origin = window.location.origin + base;
  return (
    <main className="container docs-layout">
      <aside className="docs-nav">
        <span>Documentation</span>
        <a href="#quickstart">Quickstart</a>
        <a href="#uploads">Upload footage</a>
        <a href="#analyse">Submit an analysis</a>
        <a href="#results">Read the result</a>
        <a href="#limits">Limits & billing</a>
        <a href={base + "/openapi.json"}>
          OpenAPI specification <ArrowUpRight size={13} />
        </a>
      </aside>
      <article className="docs-content">
        <span className="intro">Umbra API / v1</span>
        <h1>Follow the evidence.</h1>
        <p className="lead">
          A REST API for experimental pavement-shadow analysis. Upload two
          clips, submit a job, and inspect a structured result.
        </p>
        <section id="quickstart">
          <h2>Quickstart</h2>
          <p>
            <Link to="/signup">Create an account</Link>, verify your email and{" "}
            <Link to="/dashboard/keys">create an API key</Link>. Keep the key on
            your server. Every request below uses bearer authentication.
          </p>
          <Code
            value={`export UMBRA_API_KEY="your_api_key"\nexport UMBRA_API_URL="${origin}"`}
          />
        </section>
        <section id="uploads">
          <h2>Upload your footage</h2>
          <p>
            Keep the camera fixed and the pavement visible. Record an empty
            scene first, followed by a trial in the same lighting. The trial’s
            first 1.8 seconds should also be empty. Use daylight that casts a
            shadow onto visible pavement, or provide a reviewed lit shadow
            region for night footage.
          </p>
          <Code
            value={`curl "$UMBRA_API_URL/media" \\\n  -H "Authorization: Bearer $UMBRA_API_KEY" \\\n  -F "role=calibration" -F "file=@calibration.mp4"\n\ncurl "$UMBRA_API_URL/media" \\\n  -H "Authorization: Bearer $UMBRA_API_KEY" \\\n  -F "role=main" -F "file=@trial.mp4"`}
          />
          <p>
            Each upload returns an <code>id</code>, metadata, and expiry date.
            An optional reference clip uses <code>role=ground_truth</code>.
            Clips are private to your account.
          </p>
        </section>
        <section id="analyse">
          <h2>Submit an analysis</h2>
          <Code value={example} />
          <p>
            The response is <code>202 Accepted</code> with a job ID. One
            available credit is reserved. Repeating the same request with the
            same <code>Idempotency-Key</code> returns that job; changing the
            request under that key returns <code>409</code>.
          </p>
          <p>
            Optional fields: <code>ground_truth_media_id</code>, timezone-aware{" "}
            <code>recorded_at</code>, paired <code>latitude</code>/
            <code>longitude</code>, and a normalized <code>shadow_region</code>{" "}
            rectangle with <code>x</code>, <code>y</code>, <code>width</code>,{" "}
            <code>height</code>.
          </p>
        </section>
        <section id="results">
          <h2>Read the result</h2>
          <Code
            value={`curl "$UMBRA_API_URL/analyses/ANALYSIS_ID" \\\n  -H "Authorization: Bearer $UMBRA_API_KEY"\n\ncurl "$UMBRA_API_URL/analyses/ANALYSIS_ID/artifacts/bundle" \\\n  -H "Authorization: Bearer $UMBRA_API_KEY" \\\n  -o evidence.zip`}
          />
          <p>
            Poll every few seconds while status is <code>queued</code> or{" "}
            <code>running</code>. Completed jobs return <code>succeeded</code>{" "}
            and a result. Processing errors return <code>failed</code> and
            release the reserved credit.
          </p>
          <table>
            <thead>
              <tr>
                <th>State</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              {[
                [
                  "no_coverage",
                  "The camera scene does not support the shadow measurement.",
                ],
                [
                  "no_reliable_signal",
                  "Evidence is too weak for a reliable warning.",
                ],
                ["possible_motion", "A possible shadow signal is present."],
                ["strong_motion", "A stronger motion signal is present."],
                ["early_warning", "Shadow onset precedes entry into view."],
                [
                  "entered_view",
                  "The trial source has entered the camera view.",
                ],
              ].map(([state, meaning]) => (
                <tr key={state}>
                  <td>
                    <code>{state}</code>
                  </td>
                  <td>{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Lead time is the measured gap between shadow onset and entry into
            view. Confidence is a heuristic score, not a calibrated probability.
            Read refusal reasons and evidence limitations alongside the numbers.
          </p>
        </section>
        <section id="limits">
          <h2>Limits and billing</h2>
          <ul>
            <li>
              250 MB per clip; MP4, WebM or MOV; maximum 3840 × 2160 resolution.
            </li>
            <li>
              Calibration: 18 seconds. Trial/reference: 60 seconds. Longer clips
              are rejected.
            </li>
            <li>
              120 authenticated requests per minute, 20 uploads per hour, 20
              stored clips, two outstanding analyses per account.
            </li>
            <li>
              10 starter credits after verification; €10 for 100 additional
              credits when purchases are enabled.
            </li>
            <li>
              One credit per completed analysis, including valid no-signal
              results. Processing failures are free.
            </li>
            <li>
              Files expire after 30 days; expired downloads return{" "}
              <code>410</code>.
            </li>
          </ul>
          <p>
            Errors use <code>{'{"error":{"code":"…","message":"…"}}'}</code>.
            List analyses with <code>?limit=20&amp;offset=0</code>. Treat{" "}
            <code>429</code> as a signal to back off. Browser mutations
            additionally require the session’s <code>X-CSRF-Token</code>.
          </p>
          <a href={base + "/openapi.json"} className="button secondary">
            Download OpenAPI spec <ArrowUpRight size={16} />
          </a>
        </section>
      </article>
    </main>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<Landing />} />
            <Route path="pricing" element={<Pricing />} />
            <Route path="docs" element={<Docs />} />
            {(
              [
                "signup",
                "login",
                "forgot-password",
                "reset-password",
                "verify",
              ] as const
            ).map((mode) => (
              <Route
                key={mode}
                path={mode}
                element={<Auth key={mode} mode={mode} />}
              />
            ))}
            <Route
              path="*"
              element={
                <main className="container page-public">
                  <h1>Page not found.</h1>
                  <Link to="/">Return to Umbra</Link>
                </main>
              }
            />
          </Route>
          <Route path="dashboard" element={<DashboardLayout />}>
            <Route index element={<Analyses />} />
            <Route path="new" element={<NewAnalysis />} />
            <Route path="analyses/:id" element={<AnalysisDetail />} />
            <Route path="keys" element={<Keys />} />
            <Route path="billing" element={<Billing />} />
            <Route path="settings" element={<Account />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
