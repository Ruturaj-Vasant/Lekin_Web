"use client";

import { useState } from "react";
import type { ProblemDefinition } from "../lib/schema/problem";
import { LandingScreen } from "./components/landing-screen";
import { WorkspaceShell } from "./components/workspace/workspace-shell";
import { createBlankProblem } from "./execution/blank-problem";
import { SAMPLE_PROBLEM } from "./execution/sample-problem";

export default function Home() {
  const [initialProblem, setInitialProblem] = useState<ProblemDefinition | null>(null);

  return initialProblem ? (
    <WorkspaceShell initialProblem={initialProblem} onClose={() => setInitialProblem(null)} />
  ) : (
    <LandingScreen
      onCreateProblem={() => setInitialProblem(createBlankProblem())}
      onOpenExample={() => setInitialProblem(SAMPLE_PROBLEM)}
    />
  );
}
