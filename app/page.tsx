"use client";

import { useEffect, useState } from "react";
import {
  clearLastActiveProjectId,
  deleteProject,
  getLastActiveProjectId,
  listProjects,
  loadProject,
  type ProjectSummary,
} from "../lib/persistence/local-project-store";
import type { ProblemDefinition } from "../lib/schema/problem";
import { LandingScreen } from "./components/landing-screen";
import { WorkspaceShell } from "./components/workspace/workspace-shell";
import { createBlankProblem } from "./execution/blank-problem";
import { SAMPLE_PROBLEM } from "./execution/sample-problem";
import { getBrowserLocalStorage } from "./persistence/browser-storage";

export default function Home() {
  const [initialProblem, setInitialProblem] = useState<ProblemDefinition | null>(null);
  const [checkingRestore, setCheckingRestore] = useState(true);
  const [recentProjects, setRecentProjects] = useState<ProjectSummary[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  // Runs once on mount: PRODUCT_SPEC.md §24 - restore the most recently
  // active project after a refresh, instead of always falling back to the
  // landing screen (which previously meant losing unsaved-to-a-button work
  // on every reload). Deferred to an effect rather than computed during
  // render because localStorage isn't available during SSR. The setState
  // calls are pushed into a queueMicrotask callback (not called directly in
  // the effect body) to satisfy react-hooks/set-state-in-effect - this is a
  // genuine one-time external-system read on mount, not derived state.
  useEffect(() => {
    queueMicrotask(() => {
      const storage = getBrowserLocalStorage();
      if (!storage) {
        setCheckingRestore(false);
        return;
      }
      setRecentProjects(listProjects(storage));
      const lastActiveId = getLastActiveProjectId(storage);
      if (lastActiveId) {
        const result = loadProject(storage, lastActiveId);
        if (result.ok) {
          setInitialProblem(result.problem);
        } else {
          clearLastActiveProjectId(storage);
          if (result.reason !== "not-found") {
            setNotice(`Could not restore your last project: ${result.message}`);
          }
        }
      }
      setCheckingRestore(false);
    });
  }, []);

  function refreshRecentProjects() {
    const storage = getBrowserLocalStorage();
    setRecentProjects(storage ? listProjects(storage) : []);
  }

  function openProject(problemId: string) {
    const storage = getBrowserLocalStorage();
    if (!storage) return;
    const result = loadProject(storage, problemId);
    if (result.ok) {
      setNotice(null);
      setInitialProblem(result.problem);
    } else {
      setNotice(`Could not open that project: ${result.message}`);
      refreshRecentProjects();
    }
  }

  function deleteSavedProject(problemId: string) {
    const storage = getBrowserLocalStorage();
    if (!storage) return;
    deleteProject(storage, problemId);
    refreshRecentProjects();
  }

  function closeWorkspace() {
    const storage = getBrowserLocalStorage();
    if (storage) clearLastActiveProjectId(storage);
    setInitialProblem(null);
    refreshRecentProjects();
  }

  if (checkingRestore) return null;

  return initialProblem ? (
    <WorkspaceShell initialProblem={initialProblem} onClose={closeWorkspace} />
  ) : (
    <LandingScreen
      onCreateProblem={() => setInitialProblem(createBlankProblem())}
      onOpenExample={() => setInitialProblem({ ...SAMPLE_PROBLEM, problemId: crypto.randomUUID() })}
      recentProjects={recentProjects}
      onOpenProject={openProject}
      onDeleteProject={deleteSavedProject}
      notice={notice}
    />
  );
}
