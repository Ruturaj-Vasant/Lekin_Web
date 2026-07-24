"use client";

import { useEffect, useRef } from "react";
import {
  EXAMPLE_LIBRARY,
  exampleCounts,
  type ExampleCompatibility,
} from "../examples/example-library";

const compatibilityLabels: Record<ExampleCompatibility, string> = {
  ready: "Ready to run",
  partial: "Input compatible",
};

export function ExampleLibraryDialog({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (exampleId: string) => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="example-library-backdrop" onMouseDown={onClose}>
      <section
        className="example-library-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="example-library-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="example-library-head">
          <div>
            <span className="section-kicker">Teaching problems</span>
            <h2 id="example-library-title">Example library</h2>
            <p>Open a ready-made problem, then edit it, run algorithms, and inspect the schedule.</p>
          </div>
          <button ref={closeButton} type="button" aria-label="Close example library" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="example-library-grid">
          {EXAMPLE_LIBRARY.map((example) => {
            const counts = example.problem ? exampleCounts(example.problem) : null;
            return (
              <article className={`example-card example-${example.compatibility}`} key={example.id}>
                <div className="example-card-topline">
                  <span>{example.reference}</span>
                  <strong>{compatibilityLabels[example.compatibility]}</strong>
                </div>
                <h3>{example.title}</h3>
                <dl>
                  <div>
                    <dt>Environment</dt>
                    <dd>{example.environment}</dd>
                  </div>
                  <div>
                    <dt>Study</dt>
                    <dd>{example.objective}</dd>
                  </div>
                </dl>
                <p>{example.description}</p>
                {counts && (
                  <div className="example-counts" aria-label={`${counts.jobs} jobs, ${counts.machines} machines, ${counts.operations} operations`}>
                    <span><b>{counts.jobs}</b> jobs</span>
                    <span><b>{counts.machines}</b> machines</span>
                    <span><b>{counts.operations}</b> operations</span>
                  </div>
                )}
                <small>{example.compatibilityNote}</small>
                <button
                  type="button"
                  disabled={!example.problem}
                  aria-label={`Open ${example.reference}: ${example.title}`}
                  onClick={() => onSelect(example.id)}
                >
                  {example.problem ? "Open in workspace" : "Unavailable"}
                </button>
              </article>
            );
          })}
        </div>

        <footer>
          Pinedo examples preserve the published problem inputs. Dispatching rules may not reproduce an optimized source solution.
        </footer>
      </section>
    </div>
  );
}
