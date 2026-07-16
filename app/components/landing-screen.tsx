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

const RECENT_PROJECT_LIMIT = 5;

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
  const visibleRecentProjects = recentProjects.slice(0, RECENT_PROJECT_LIMIT);

  return (
    <main className="landing">
      <nav className="landing-nav" aria-label="Primary navigation">
        <Brand />
        <div className="nav-links">
          <a href="#about">About</a>
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
          LEKIN is an open scheduling workbench for defining job-shop
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
          ↑ Import a LEKIN JSON file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,.lekin.json,application/json"
          hidden
          aria-label="Import a LEKIN JSON file"
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
            {visibleRecentProjects.map((project) => (
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
          {recentProjects.length > RECENT_PROJECT_LIMIT && (
            <p className="recent-project-limit-note">Showing the five most recently saved projects.</p>
          )}
        </section>
      )}

      <section className="feature-strip" aria-label="LEKIN features">
        {features.map(([number, title, description]) => (
          <article key={number}>
            <span className="icon" aria-hidden="true">{number}</span>
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </section>

      <section className="information-section project-information" id="about" aria-labelledby="about-title">
        <div className="information-heading">
          <span className="eyebrow">About LEKIN</span>
          <h2 id="about-title">From Python library to interactive workbench</h2>
          <p>
            LEKIN extends the lekinpy Python scheduling library into a browser
            workbench for modeling, comparing, and editing job-shop schedules.
          </p>
        </div>
        <aside className="credits-panel" id="help" aria-labelledby="credits-title">
          <div className="library-reference">
            <span className="eyebrow">Source project</span>
            <h3 id="credits-title">LEKIN Python library</h3>
            <p>This web application extends the open-source lekinpy scheduling library.</p>
            <a href="https://github.com/mpinedo170/Lekin_Python" target="_blank" rel="noreferrer">Visit the LEKIN Python page</a>
          </div>
          <dl>
            <div className="credit-row"><dt>Academic Advisor</dt><dd><span>Michael Pinedo</span><a href="mailto:mpinedo@stern.nyu.edu">mpinedo@stern.nyu.edu</a></dd></div>
            <div className="credit-row"><dt>Supervisor</dt><dd><span>Andrew Feldman</span></dd></div>
            <div className="credit-row"><dt>Author</dt><dd><span>Ruturaj Tambe</span><a href="mailto:rvt2018@nyu.edu">rvt2018@nyu.edu</a></dd></div>
          </dl>
        </aside>
      </section>

      <footer>
        <span>LEKIN</span>
        <span>Built for scheduling research and education.</span>
      </footer>
    </main>
  );
}
