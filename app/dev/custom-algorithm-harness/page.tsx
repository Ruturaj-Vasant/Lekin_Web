"use client";

import { useEffect, useRef } from "react";
import { CustomAlgorithmEngine } from "../../execution/custom-execution-engine";
import { SAMPLE_PROBLEM } from "../../execution/sample-problem";
import type { RunCustomAlgorithmOptions, CustomProgressEvent, CustomIncumbentEvent, CustomRunResult, CustomValidationResult } from "../../../lib/custom-algorithm/types";

/**
 * Non-visual test harness for `CustomAlgorithmEngine`.
 *
 * This route exists ONLY so Playwright can exercise real Pyodide execution
 * of custom Python algorithms end to end (the required verification steps
 * "live execution of the valid custom example through real Pyodide" and
 * "cancellation of an intentionally infinite algorithm" have no other real
 * path - there is deliberately no visual editor in this milestone, see
 * docs/CUSTOM_PYTHON_ALGORITHMS.md, and per this feature's task instructions
 * this branch must not build one). It is not linked from anywhere in the
 * product, renders no meaningful UI, and is not a component under
 * app/components/ - see lekin-web_DECISIONS.md for why this route is the
 * one deliberate exception to "avoid touching app/components/**".
 *
 * Playwright drives it entirely through `window.__customAlgorithmHarness`,
 * not through clicking anything on this page.
 *
 * The route ships in the production build (the app router builds every
 * route), so it is gated to loopback hosts: on any non-local deployment it
 * renders an inert "unavailable" marker and never instantiates the engine
 * or registers the window API. Playwright's own webServer runs on
 * 127.0.0.1, so e2e coverage is unaffected.
 */

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

type HarnessRunOutcome = {
  result: CustomRunResult;
  progress: CustomProgressEvent[];
  incumbents: CustomIncumbentEvent[];
};

declare global {
  interface Window {
    __customAlgorithmHarness?: {
      validate: (source: string) => Promise<CustomValidationResult>;
      start: (options: Omit<RunCustomAlgorithmOptions, "problem" | "onProgress" | "onIncumbent"> & { problem?: RunCustomAlgorithmOptions["problem"] }) => string;
      cancel: (runId: string) => void;
      getResult: (runId: string) => HarnessRunOutcome | null;
    };
  }
}

export default function CustomAlgorithmHarnessPage() {
  const markerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!LOOPBACK_HOSTNAMES.has(window.location.hostname)) {
      if (markerRef.current) markerRef.current.textContent = "unavailable";
      return;
    }
    const engine = new CustomAlgorithmEngine();
    const results = new Map<string, HarnessRunOutcome>();

    window.__customAlgorithmHarness = {
      validate: (source: string) => engine.validateCustomAlgorithm(source),
      start: (options) => {
        const runId = options.runId ?? `harness-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const progress: CustomProgressEvent[] = [];
        const incumbents: CustomIncumbentEvent[] = [];
        engine
          .runCustomAlgorithm({
            ...options,
            runId,
            problem: options.problem ?? SAMPLE_PROBLEM,
            onProgress: (event) => progress.push(event),
            onIncumbent: (event) => incumbents.push(event),
          })
          .then((result) => {
            results.set(runId, { result, progress, incumbents });
          });
        return runId;
      },
      cancel: (runId: string) => engine.cancelCustomAlgorithm(runId),
      getResult: (runId: string) => results.get(runId) ?? null,
    };
    // Mutate the DOM directly rather than via setState: this effect's only
    // job is exposing the imperative window.__customAlgorithmHarness API
    // for Playwright, which is an external-system side effect, not
    // React-rendered state - see react-hooks/set-state-in-effect (the same
    // pattern the stale-result-clearing fix in lekin-web_DECISIONS.md
    // already established for this codebase).
    if (markerRef.current) markerRef.current.textContent = "ready";

    return () => {
      engine.dispose();
      delete window.__customAlgorithmHarness;
    };
  }, []);

  return (
    <div data-testid="custom-algorithm-harness-ready" ref={markerRef}>
      loading
    </div>
  );
}
