"use client";

import { useRef } from "react";
import { Brand } from "./brand";

type LandingScreenProps = {
  onCreateProblem: () => void;
  onOpenExample: () => void;
};

const features = [
  ["01", "Model precisely", "Define jobs, operations, machines, and workcenters with clear validation."],
  ["02", "Compare algorithms", "Run built-in dispatching rules against the same problem definition."],
  ["03", "Inspect every decision", "Read the Gantt chart, sequences, and metrics from one focused workspace."],
];

export function LandingScreen({ onCreateProblem, onOpenExample }: LandingScreenProps) {
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <main className="landing">
      <nav className="landing-nav" aria-label="Primary navigation">
        <Brand />
        <div className="nav-links">
          <a href="#about">About</a>
          <a href="#docs">Documentation</a>
          <a href="#help">Help</a>
        </div>
      </nav>

      <section className="hero">
        <div className="eyebrow">Scheduling research, made tangible</div>
        <h1>
          Build, run, and understand
          <br />
          <span>production schedules.</span>
        </h1>
        <p>
          LEKIN Lab is an open scheduling workbench for defining job-shop
          problems, comparing algorithms, and exploring the schedule that
          results.
        </p>
        <div className="hero-actions">
          <button className="primary" type="button" onClick={onCreateProblem}>
            Create new problem <span>→</span>
          </button>
          <button className="secondary" type="button" onClick={onOpenExample}>
            Open example
          </button>
        </div>
        <button
          className="import-link"
          type="button"
          onClick={() => fileInput.current?.click()}
        >
          ↑ Import a LEKIN or JSON file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,.job,.mch,.seq"
          hidden
          aria-label="Import a LEKIN or JSON file"
          onChange={onOpenExample}
        />
      </section>

      <section className="feature-strip" id="about" aria-label="LEKIN Lab features">
        {features.map(([number, title, description]) => (
          <article key={number}>
            <span className="icon" aria-hidden="true">{number}</span>
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </section>

      <footer id="help">
        <span>LEKIN Lab</span>
        <span>Built for scheduling research and education.</span>
      </footer>
    </main>
  );
}
