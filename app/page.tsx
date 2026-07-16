"use client";

import { useRef, useState } from "react";

const Icon = ({ children }: { children: React.ReactNode }) => (
  <span className="icon" aria-hidden="true">{children}</span>
);

const jobs = [
  { id: "J-101", due: "18", weight: "1.0", color: "blue" },
  { id: "J-102", due: "24", weight: "1.5", color: "orange" },
  { id: "J-103", due: "30", weight: "0.8", color: "green" },
];

const bars = [
  { machine: 0, left: 0, width: 18, label: "J-101 · Cut", color: "blue" },
  { machine: 0, left: 23, width: 24, label: "J-102 · Cut", color: "orange" },
  { machine: 0, left: 52, width: 19, label: "J-103 · Cut", color: "green" },
  { machine: 1, left: 19, width: 25, label: "J-101 · Mill", color: "blue" },
  { machine: 1, left: 49, width: 29, label: "J-102 · Mill", color: "orange" },
  { machine: 2, left: 45, width: 22, label: "J-101 · Finish", color: "blue" },
  { machine: 2, left: 71, width: 25, label: "J-103 · Finish", color: "green" },
];

function Landing({ onStart }: { onStart: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <main className="landing">
      <nav className="landing-nav">
        <a className="brand" href="#" aria-label="LEKIN Lab home"><span className="brand-mark">L</span><span>LEKIN <b>Lab</b></span></a>
        <div className="nav-links"><a href="#about">About</a><a href="#docs">Documentation</a><a href="#help">Help</a></div>
      </nav>
      <section className="hero">
        <div className="eyebrow">Scheduling research, made tangible</div>
        <h1>Build, run, and understand<br/><span>production schedules.</span></h1>
        <p>LEKIN Lab is an open scheduling workbench for defining job-shop problems, comparing algorithms, and exploring the schedule that results.</p>
        <div className="hero-actions">
          <button className="primary" onClick={onStart}>Create new problem <span>→</span></button>
          <button className="secondary" onClick={onStart}>Open example</button>
        </div>
        <button className="import-link" onClick={() => fileRef.current?.click()}>↑ Import a LEKIN or JSON file</button>
        <input ref={fileRef} type="file" accept=".json,.job,.mch,.seq" hidden onChange={onStart}/>
      </section>
      <section className="feature-strip" id="about">
        <article><Icon>01</Icon><h2>Model precisely</h2><p>Define jobs, operations, machines, and workcenters with clear validation.</p></article>
        <article><Icon>02</Icon><h2>Compare algorithms</h2><p>Run built-in dispatching rules against the same problem definition.</p></article>
        <article><Icon>03</Icon><h2>Inspect every decision</h2><p>Read the Gantt chart, sequences, and metrics from one focused workspace.</p></article>
      </section>
      <footer><span>LEKIN Lab</span><span>Built for scheduling research and education.</span></footer>
    </main>
  );
}

function Sidebar() {
  return <aside className="sidebar">
    <div className="side-heading"><span>Problem setup</span><button aria-label="Collapse panel">‹</button></div>
    <label className="field-label">Problem name<input defaultValue="Sample job shop" /></label>
    <details open><summary><span>Jobs <em>3</em></span><b>⌄</b></summary>
      <div className="job-list">{jobs.map(j => <button className="job-row" key={j.id}><i className={j.color}/><span><strong>{j.id}</strong><small>Due {j.due} · Weight {j.weight}</small></span><b>›</b></button>)}</div>
      <button className="add-button">＋ Add job</button>
    </details>
    {[["Operations","8"],["Workcenters","3"],["Machines","4"]].map(([name,count]) => <details key={name}><summary><span>{name} <em>{count}</em></span><b>⌄</b></summary><p className="detail-copy">Select this section to configure {name.toLowerCase()}.</p></details>)}
    <details open><summary><span>Algorithm</span><b>⌄</b></summary><label className="field-label">Dispatching rule<select defaultValue="SPT"><option>SPT — Shortest processing time</option><option>FCFS — First come, first served</option><option>EDD — Earliest due date</option><option>WSPT — Weighted SPT</option></select></label></details>
    <button className="run-button">▶ Run schedule</button>
    <p className="local-note">Runs locally in your browser</p>
  </aside>;
}

function Gantt() {
  return <section className="gantt-card">
    <div className="card-head"><div><span className="section-kicker">SCHEDULE</span><h2>Machine timeline</h2></div><div className="chart-tools"><button>−</button><span>100%</span><button>＋</button><button>Fit</button></div></div>
    <div className="legend">{jobs.map(j => <span key={j.id}><i className={j.color}/>{j.id}</span>)}<span className="legend-note">Time units</span></div>
    <div className="gantt">
      <div className="machine-labels"><span>M-01<small>Laser cutter</small></span><span>M-02<small>CNC mill</small></span><span>M-03<small>Finishing</small></span></div>
      <div className="timeline"><div className="ticks">{[0,5,10,15,20,25,30,35].map(n=><span key={n}>{n}</span>)}</div>
        <div className="grid">{[0,1,2].map(row=><div className="grid-row" key={row}/>)}</div>
        {bars.map((bar,i)=><div key={i} className={`bar ${bar.color}`} style={{left:`${bar.left}%`,width:`${bar.width}%`,top:`${42 + bar.machine*72}px`}}><span>{bar.label}</span><small>{Math.round(bar.width/4)}u</small></div>)}
      </div>
    </div>
  </section>;
}

const tabContent: Record<string, React.ReactNode> = {
  "Machine sequence": <div className="sequence-table"><div><b>M-01</b><span className="chip blue">J-101 · O1</span><i>→</i><span className="chip orange">J-102 · O1</span><i>→</i><span className="chip green">J-103 · O1</span></div><div><b>M-02</b><span className="chip blue">J-101 · O2</span><i>→</i><span className="chip orange">J-102 · O2</span></div><div><b>M-03</b><span className="chip blue">J-101 · O3</span><i>→</i><span className="chip green">J-103 · O2</span></div></div>,
  "Job details": <p className="tab-empty">Select a job in the left panel to inspect its operation sequence.</p>,
  "Algorithm comparison": <p className="tab-empty">Run another algorithm to compare makespan and flow-time metrics.</p>,
  "Validation": <p className="tab-empty success-text">✓ Problem definition is valid.</p>,
  "Execution": <p className="tab-empty">SPT completed locally · 8 operations scheduled.</p>,
};

function Workspace({ onHome }: { onHome: () => void }) {
  const [tab,setTab] = useState("Machine sequence");
  return <main className="workspace">
    <header className="appbar"><button className="brand brand-button" onClick={onHome}><span className="brand-mark">L</span><span>LEKIN <b>Lab</b></span></button><span className="divider"/><div className="project"><small>PROJECT</small><strong>Sample job shop</strong><span>Saved</span></div><div className="app-actions"><button>＋ New</button><button>⇧ Import</button><button>↓ Export</button><span className="divider"/><button aria-label="Undo">↶</button><button aria-label="Redo" disabled>↷</button><button>Help</button></div></header>
    <div className="app-body"><Sidebar/><div className="canvas">
      <div className="canvas-head"><div><span className="breadcrumb">WORKSPACE / SAMPLE JOB SHOP</span><h1>Schedule overview</h1><p>Shortest processing time · Last run just now</p></div><span className="valid-pill">✓ Valid schedule</span></div>
      <div className="metrics"><article><span>Makespan</span><strong>34<small> time units</small></strong><em>↓ 8.1% vs FCFS</em></article><article><span>Total flow time</span><strong>69</strong><em>↓ 5.5% vs FCFS</em></article><article><span>Avg. utilization</span><strong>72.4<small>%</small></strong><em className="neutral">Across 3 machines</em></article><article><span>Late jobs</span><strong>0<small> / 3</small></strong><em className="neutral">All due dates met</em></article></div>
      <Gantt/>
      <section className="details-card"><div className="tabs">{Object.keys(tabContent).map(name=><button className={tab===name?"active":""} onClick={()=>setTab(name)} key={name}>{name}{name==="Validation"&&<span>0</span>}</button>)}</div>{tabContent[tab]}</section>
    </div></div>
  </main>;
}

export default function Home() {
  const [started,setStarted] = useState(false);
  return started ? <Workspace onHome={()=>setStarted(false)}/> : <Landing onStart={()=>setStarted(true)}/>;
}
