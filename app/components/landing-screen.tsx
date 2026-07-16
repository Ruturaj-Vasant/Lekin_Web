"use client";

import { useRef } from "react";
import type { ProjectSummary } from "../../lib/persistence/local-project-store";
import type { SchedulerPreparationState } from "../execution/browser-execution-engine";
import { Brand } from "./brand";

type LandingScreenProps = {
  onCreateProblem: () => void;
  onOpenExample: () => void;
  recentProjects: ProjectSummary[];
  onOpenProject: (problemId: string) => void;
  onDeleteProject: (problemId: string) => void;
  onImportFile: (file: File) => void;
  notice?: string | null;
  schedulerPreparation: SchedulerPreparationState;
};

const features = [
  ["01", "Model precisely", "Define jobs, operations, machines, and workcenters with clear validation."],
  ["02", "Compare algorithms", "Run built-in dispatching rules against the same problem definition."],
  ["03", "Inspect every decision", "Read the Gantt chart, sequences, and metrics from one focused workspace."],
];

function formatSavedAt(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? "unknown time" : parsed.toLocaleString();
}

export function LandingScreen({
  onCreateProblem,
  onOpenExample,
  recentProjects,
  onOpenProject,
  onDeleteProject,
  onImportFile,
  notice,
  schedulerPreparation,
}: LandingScreenProps) {
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
          ↑ Import a LEKIN Lab JSON file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,.lekin.json,application/json"
          hidden
          aria-label="Import a LEKIN Lab JSON file"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) onImportFile(file);
            event.currentTarget.value = "";
          }}
        />
        <p className={`scheduler-preparation scheduler-${schedulerPreparation}`} aria-live="polite">
          <span />
          {schedulerPreparation === "ready"
            ? "Scheduling engine ready"
            : schedulerPreparation === "error"
              ? "Scheduling engine will retry when you run"
              : "Preparing the scheduling engine"}
        </p>
      </section>

      {notice && (
        <div className="landing-notice" role="status">
          {notice}
        </div>
      )}

      {recentProjects.length > 0 && (
        <section className="recent-projects" aria-label="Recent projects">
          <h2>Recent projects</h2>
          <ul className="recent-project-list">
            {recentProjects.map((project) => (
              <li key={project.problemId}>
                <button
                  type="button"
                  className="recent-project-open"
                  aria-label={`Open ${project.name}`}
                  onClick={() => onOpenProject(project.problemId)}
                >
                  <strong>{project.name}</strong>
                  <small>Saved {formatSavedAt(project.savedAt)}</small>
                </button>
                <button
                  type="button"
                  className="recent-project-delete"
                  aria-label={`Delete ${project.name}`}
                  onClick={() => {
                    if (window.confirm(`Delete "${project.name}"? This cannot be undone.`)) {
                      onDeleteProject(project.problemId);
                    }
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

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
