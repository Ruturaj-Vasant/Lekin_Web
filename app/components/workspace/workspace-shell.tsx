import { Brand } from "../brand";
import { DetailTabs } from "./detail-tabs";
import { GanttChart } from "./gantt-chart";
import { MetricsRow } from "./metrics-row";
import { ProblemSidebar } from "./problem-sidebar";

type WorkspaceShellProps = {
  onClose: () => void;
};

export function WorkspaceShell({ onClose }: WorkspaceShellProps) {
  return (
    <main className="workspace">
      <header className="appbar">
        <Brand asButton onClick={onClose} />
        <span className="divider" aria-hidden="true" />
        <div className="project"><small>Project</small><strong>Sample job shop</strong><span>Saved</span></div>
        <div className="app-actions">
          <button type="button">＋ New</button><button type="button">⇧ Import</button><button type="button">↓ Export</button>
          <span className="divider" aria-hidden="true" />
          <button type="button" aria-label="Undo">↶</button><button type="button" aria-label="Redo" disabled>↷</button><button type="button">Help</button>
        </div>
      </header>
      <div className="app-body">
        <ProblemSidebar />
        <div className="canvas">
          <div className="canvas-head">
            <div><span className="breadcrumb">Workspace / Sample job shop</span><h1>Schedule overview</h1><p>Shortest processing time · Last run just now</p></div>
            <span className="valid-pill">✓ Valid schedule</span>
          </div>
          <MetricsRow />
          <GanttChart />
          <DetailTabs />
        </div>
      </div>
    </main>
  );
}
