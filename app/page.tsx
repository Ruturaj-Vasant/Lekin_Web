"use client";

import { useState } from "react";
import { LandingScreen } from "./components/landing-screen";
import { WorkspaceShell } from "./components/workspace/workspace-shell";

export default function Home() {
  const [workspaceOpen, setWorkspaceOpen] = useState(false);

  return workspaceOpen ? (
    <WorkspaceShell onClose={() => setWorkspaceOpen(false)} />
  ) : (
    <LandingScreen onOpenWorkspace={() => setWorkspaceOpen(true)} />
  );
}
