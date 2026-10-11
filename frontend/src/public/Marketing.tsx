import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  FileJson,
  Film,
  ScanLine,
  ShieldCheck,
} from "lucide-react";
import CornerShowcase from "../components/CornerShowcase";
import BlurText from "../components/react-bits/BlurText";
import SpotlightCard from "../components/react-bits/SpotlightCard";
import { Code } from "./App";
import "./marketing.css";

function EvidenceDiagram() {
  return (
    <div
      className="evidence-diagram"
      aria-label="Calibration and trial video are processed into structured results and evidence files"
    >
      <div>
        <Film size={22} strokeWidth={1.2} />
        <span>Calibration</span>
      </div>
      <span className="diagram-plus">+</span>
      <div>
        <Film size={22} strokeWidth={1.2} />
        <span>Corner trial</span>
      </div>
      <ArrowRight className="diagram-arrow" size={22} strokeWidth={1} />
      <div className="diagram-output">
        <FileJson size={24} strokeWidth={1.2} />
        <span>Evidence</span>
      </div>
    </div>
  );
}

export default function Landing() {
  const example = `curl -X POST "${window.location.origin}/api/v1/analyses" \\\n  -H "Authorization: Bearer $UMBRA_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -H "Idempotency-Key: corner-trial-001" \\\n  -d '{\n    "name": "Corner trial",\n    "calibration_media_id": "CALIBRATION_ID",\n    "main_media_id": "TRIAL_ID"\n  }'`;
  return (
    <main className="marketing-page">
      <section className="landing-hero container">
        <div className="landing-hero-copy">
          <h1>
            <BlurText
              text="Before"
              delay={65}
              direction="bottom"
              stepDuration={0.3}
            />
            <BlurText
              text="plain sight."
              delay={65}
              direction="bottom"
              stepDuration={0.3}
            />
          </h1>
          <p>
            Experimental video intelligence that measures motion in shadows,
            before a subject enters the camera’s view.
          </p>
          <div className="hero-actions">
            <Link to="/signup" className="button white-button">
              Get started <ArrowUpRight size={17} />
            </Link>
            <Link to="/docs" className="hero-docs">
              Explore the API <ArrowRight size={15} />
            </Link>
          </div>
        </div>
        <div className="landing-hero-scene">
          <CornerShowcase autoPlay />
        </div>
      </section>
      <section className="manifesto container">
        <div className="manifesto-caption">
          <ScanLine size={19} strokeWidth={1.4} />
          <span>A different way to observe.</span>
        </div>
        <h2>
          There’s information
          <br />
          in what you can’t yet see.
        </h2>
        <p>
          A moving shadow can reach visible pavement before its source. Umbra
          measures that signal, compares it with entry into view, and gives you
          the evidence.
        </p>
      </section>
      <section
        className="capability-grid container"
        aria-label="Umbra capabilities"
      >
        <SpotlightCard
          className="capability-card"
          spotlightColor="#68ead2"
          intensity={0.045}
          borderGlow={0.18}
          proximity={0}
          flare={false}
          grain={0}
        >
          <div className="capability-content">
            <span className="feature-label">Video analysis</span>
            <h2>
              Two clips.
              <br />A new perspective.
            </h2>
            <p>
              Start with an empty calibration and a corner trial. Get a
              structured result, a timeline, and a report you can take apart.
            </p>
            <Link to="/docs#uploads" className="text-link">
              How it works <ArrowUpRight size={15} />
            </Link>
          </div>
          <EvidenceDiagram />
        </SpotlightCard>
        <SpotlightCard
          className="capability-card evidence-card"
          spotlightColor="#68ead2"
          intensity={0.045}
          borderGlow={0.18}
          proximity={0}
          flare={false}
          grain={0}
        >
          <div className="capability-content">
            <span className="feature-label">Evidence first</span>
            <h2>
              Understand
              <br />
              the uncertainty.
            </h2>
            <p>
              Confidence, measured lead time, and clear refusal reasons. Weak
              evidence is a result worth understanding.
            </p>
            <Link to="/docs#results" className="text-link">
              Read the results <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="evidence-list">
            <div>
              <span>Shadow onset</span>
              <ScanLine size={17} />
            </div>
            <div>
              <span>Entry into view</span>
              <Film size={17} />
            </div>
            <div>
              <span>Confidence & limitations</span>
              <ShieldCheck size={17} />
            </div>
          </div>
        </SpotlightCard>
      </section>
      <section className="integration-section container">
        <div className="integration-copy">
          <span className="feature-label">Built for developers</span>
          <h2>
            One API.
            <br />
            Your possibilities.
          </h2>
          <p>
            Upload. Analyse. Inspect. Bring shadow evidence into your workflow
            with account-scoped keys and predictable, per-analysis credits.
          </p>
          <Link to="/docs" className="text-link">
            Explore the documentation <ArrowUpRight size={15} />
          </Link>
        </div>
        <Code value={example} label="Create an analysis" />
      </section>
      <section className="research-statement container">
        <ShieldCheck size={24} strokeWidth={1.3} />
        <div>
          <h2>Research, with its limits in view.</h2>
          <p>
            Umbra measures visible cast shadows. It does not see through walls.
            Confidence is heuristic, and field performance has not been
            established. Every result keeps those limits visible.
          </p>
        </div>
        <Link
          to="/docs#results"
          className="round-link"
          aria-label="Read analysis limitations"
        >
          <ArrowUpRight size={22} />
        </Link>
      </section>
      <section className="landing-cta container">
        <p>A little light. A lot to explore.</p>
        <h2>
          Find your
          <br />
          next perspective.
        </h2>
        <div>
          <Link to="/signup" className="button white-button">
            Get started <ArrowUpRight size={17} />
          </Link>
          <span>
            10 starter analyses.
            <br />
            No payment card required.
          </span>
        </div>
      </section>
    </main>
  );
}
