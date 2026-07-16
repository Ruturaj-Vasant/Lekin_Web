"use client";

import { useState, type ReactNode } from "react";

const tabContent: Record<string, ReactNode> = {
  "Machine sequence": (
    <div className="sequence-table">
      <div><b>M-01</b><span className="chip blue">J-101 · O1</span><i>→</i><span className="chip orange">J-102 · O1</span><i>→</i><span className="chip green">J-103 · O1</span></div>
      <div><b>M-02</b><span className="chip blue">J-101 · O2</span><i>→</i><span className="chip orange">J-102 · O2</span></div>
      <div><b>M-03</b><span className="chip blue">J-101 · O3</span><i>→</i><span className="chip green">J-103 · O2</span></div>
    </div>
  ),
  "Job details": <p className="tab-empty">Select a job in the left panel to inspect its operation sequence.</p>,
  "Algorithm comparison": <p className="tab-empty">Run another algorithm to compare makespan and flow-time metrics.</p>,
  Validation: <p className="tab-empty success-text">✓ Problem definition is valid.</p>,
  Execution: <p className="tab-empty">SPT completed locally · 8 operations scheduled.</p>,
};

export function DetailTabs() {
  const [activeTab, setActiveTab] = useState("Machine sequence");

  return (
    <section className="details-card">
      <div className="tabs" role="tablist" aria-label="Schedule details">
        {Object.keys(tabContent).map((name) => (
          <button
            key={name}
            id={`tab-${name.toLowerCase().replaceAll(" ", "-")}`}
            type="button"
            role="tab"
            aria-selected={activeTab === name}
            aria-controls="schedule-detail-panel"
            className={activeTab === name ? "active" : ""}
            onClick={() => setActiveTab(name)}
          >
            {name}{name === "Validation" && <span>0</span>}
          </button>
        ))}
      </div>
      <div
        id="schedule-detail-panel"
        role="tabpanel"
        aria-labelledby={`tab-${activeTab.toLowerCase().replaceAll(" ", "-")}`}
      >
        {tabContent[activeTab]}
      </div>
    </section>
  );
}
