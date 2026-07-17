"use client";

import { useRef, useState } from "react";
import type { CustomProgressEvent, CustomRunResult, CustomValidationResult } from "../../../lib/custom-algorithm/types";
import { customAlgorithmFilename } from "../../../lib/editor/custom-algorithm-input";
import { CUSTOM_ALGORITHM_TEMPLATES, type CustomAlgorithmTemplateId } from "../../execution/custom-algorithm-templates";
import { PythonCodeEditor } from "./python-code-editor";

type Props = {
  name: string;
  source: string;
  parametersText: string;
  parametersError: string | null;
  timeLimitSeconds: number;
  trusted: boolean;
  validation: CustomValidationResult | null;
  validating: boolean;
  running: boolean;
  canRun: boolean;
  runDisabledReason: string | null;
  runResult: CustomRunResult | null;
  progressEvents: CustomProgressEvent[];
  incumbentCount: number;
  onNameChange: (value: string) => void;
  onSourceChange: (value: string) => void;
  onParametersChange: (value: string) => void;
  onTimeLimitChange: (value: number) => void;
  onTrustedChange: (value: boolean) => void;
  onValidate: () => void;
  onRun: () => void;
  onCancel: () => void;
};

export function CustomAlgorithmPanel(props: Props) {
  const [templateId, setTemplateId] = useState<CustomAlgorithmTemplateId>("spt");
  const fileInput = useRef<HTMLInputElement | null>(null);
  const lastProgress = props.progressEvents.at(-1);
  const lineCount = props.source.split("\n").length;

  function loadTemplate() {
    const template = CUSTOM_ALGORITHM_TEMPLATES[templateId];
    props.onNameChange(template.name);
    props.onSourceChange(template.source);
  }

  async function importPython(file: File) {
    props.onNameChange(file.name.replace(/\.py$/i, "") || "Imported algorithm");
    props.onSourceChange(await file.text());
  }

  function downloadPython() {
    const blob = new Blob([props.source], { type: "text/x-python;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = customAlgorithmFilename(props.name);
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="custom-algorithm-card" aria-labelledby="custom-algorithm-heading">
      <header className="custom-algorithm-head">
        <div>
          <span className="section-kicker">Algorithm studio</span>
          <h2 id="custom-algorithm-heading">Custom Python algorithm</h2>
          <p>Implement <code>schedule(system, parameters, context)</code> and return a real <code>lekinpy.Schedule</code>.</p>
        </div>
        <span className="custom-local-badge">Local worker</span>
      </header>

      <div className="custom-algorithm-toolbar">
        <label>
          Starter
          <select value={templateId} onChange={(event) => setTemplateId(event.target.value as CustomAlgorithmTemplateId)} disabled={props.running || props.validating}>
            <option value="spt">Complete SPT example</option>
            <option value="iterative">Bounded iterative example</option>
            <option value="blank">Blank function</option>
          </select>
        </label>
        <button type="button" onClick={loadTemplate} disabled={props.running || props.validating}>Load template</button>
        <button type="button" onClick={() => fileInput.current?.click()} disabled={props.running || props.validating}>Import .py</button>
        <input
          ref={fileInput}
          type="file"
          accept=".py,text/x-python,text/plain"
          aria-label="Import a Python algorithm"
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void importPython(file);
            event.currentTarget.value = "";
          }}
        />
        <button type="button" onClick={downloadPython} disabled={!props.source}>Download .py</button>
      </div>

      <div className="custom-algorithm-fields">
        <label>
          Algorithm name
          <input value={props.name} onChange={(event) => props.onNameChange(event.target.value)} disabled={props.running || props.validating} />
        </label>
        <label>
          Time limit
          <span className="custom-number-control">
            <input
              type="number"
              min="1"
              max="20"
              value={props.timeLimitSeconds}
              onChange={(event) => props.onTimeLimitChange(Number(event.target.value))}
              disabled={props.running || props.validating}
            />
            seconds
          </span>
        </label>
        <label>
          Parameters (JSON object)
          <input
            value={props.parametersText}
            onChange={(event) => props.onParametersChange(event.target.value)}
            disabled={props.running || props.validating}
            spellCheck={false}
          />
        </label>
      </div>
      {props.parametersError && <p className="custom-inline-error" role="alert">{props.parametersError}</p>}

      <div className="custom-code-shell">
        <div className="custom-code-title">
          <span>algorithm.py <i>Python</i></span>
          <span>{lineCount} lines</span>
        </div>
        <PythonCodeEditor
          value={props.source}
          disabled={props.running || props.validating}
          onChange={props.onSourceChange}
        />
      </div>
      <p className="custom-editor-help" id="python-editor-help">
        Python syntax, matching brackets, line numbers, folding, and search are enabled. Press Ctrl+F or Command+F to search within the code.
      </p>

      <div className="custom-contract-grid">
        <div><b>system</b><span>Validated lekinpy.System</span></div>
        <div><b>parameters</b><span>Your JSON object as a Python dict</span></div>
        <div><b>context</b><span>Time, progress, incumbent, and stop helpers</span></div>
      </div>

      <label className="custom-trust-check">
        <input
          type="checkbox"
          checked={props.trusted}
          onChange={(event) => props.onTrustedChange(event.target.checked)}
          disabled={props.running || props.validating}
        />
        <span>
          <b>I trust this Python code.</b>
          It runs only after I press Run. Worker isolation protects responsiveness, but it is not a security sandbox.
        </span>
      </label>

      <div className="custom-actions">
        <button className="custom-validate" type="button" onClick={props.onValidate} disabled={props.running || props.validating || !props.source.trim()}>
          {props.validating ? "Validating Python..." : "Validate code"}
        </button>
        <button className="custom-run" type="button" onClick={props.running ? props.onCancel : props.onRun} disabled={!props.running && !props.canRun}>
          {props.running ? "Stop algorithm" : "Run custom algorithm"}
        </button>
        {!props.running && props.runDisabledReason && <span>{props.runDisabledReason}</span>}
      </div>

      {props.validation && (
        <div className={props.validation.valid ? "custom-validation custom-validation-ok" : "custom-validation custom-validation-error"} role="status">
          <b>{props.validation.valid ? "Code contract validated" : "Code needs attention"}</b>
          {props.validation.issues.length > 0 && (
            <ul>{props.validation.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}</ul>
          )}
        </div>
      )}

      {(props.running || props.runResult) && (
        <section className="custom-console" aria-label="Custom algorithm execution">
          <header>
            <div>
              <span className={`custom-status-dot custom-status-${props.runResult?.status ?? "running"}`} />
              <b>{props.running ? "Running custom algorithm" : props.runResult?.status.replaceAll("_", " ")}</b>
            </div>
            <span>{props.runResult ? `${props.runResult.runtimeMs} ms` : `${Math.round((lastProgress?.progress ?? 0) * 100)}%`}</span>
          </header>
          {props.running && <div className="custom-progress-track"><span style={{ width: `${Math.max(3, (lastProgress?.progress ?? 0) * 100)}%` }} /></div>}
          <p>{lastProgress?.message ?? (props.running ? "Preparing a disposable Python worker..." : props.runResult?.terminationReason.replaceAll("_", " "))}</p>
          {props.incumbentCount > 0 && <p>{props.incumbentCount} independently validated incumbent schedule{props.incumbentCount === 1 ? "" : "s"} received.</p>}
          {props.runResult?.issues.length ? (
            <ul className="custom-console-errors">
              {props.runResult.issues.map((issue, index) => <li key={`${issue.code}-${index}`}><b>{issue.code}</b> {issue.message}</li>)}
            </ul>
          ) : null}
          {(props.runResult?.stdout || props.runResult?.stderr) && (
            <div className="custom-output-grid">
              <div><b>Output{props.runResult.stdoutTruncated ? " (truncated)" : ""}</b><pre>{props.runResult.stdout || "No output"}</pre></div>
              <div><b>Errors{props.runResult.stderrTruncated ? " (truncated)" : ""}</b><pre>{props.runResult.stderr || "No errors"}</pre></div>
            </div>
          )}
          {props.runResult?.diagnostics.traceback && (
            <div className="custom-traceback">
              <b>Python traceback</b>
              <pre>{props.runResult.diagnostics.traceback}</pre>
            </div>
          )}
        </section>
      )}

      <p className="custom-persistence-note">Custom source stays in this workspace session. Download the .py file before leaving if you want to keep it.</p>
    </section>
  );
}
