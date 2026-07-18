import { describe, expect, it } from "vitest";
import { SAMPLE_PROBLEM } from "../../app/execution/sample-problem";
import { buildJsonInputPreview, buildPythonInputPreview } from "./custom-algorithm-inspector";

describe("custom algorithm input inspector", () => {
  it("shows real problem values with lekinpy snake_case attributes", () => {
    const preview = buildPythonInputPreview(SAMPLE_PROBLEM, '{"iterations": 25}');

    expect(preview).toContain('job_id="J-101"');
    expect(preview).toContain('workcenter="WC-CUT"');
    expect(preview).toContain("processing_time=4");
    expect(preview).toContain('name="M-01"');
    expect(preview).toContain('"iterations": 25');
    expect(preview).not.toContain("processingTime");
  });

  it("uses the exact worker construction payload in JSON view", () => {
    const preview = JSON.parse(buildJsonInputPreview(SAMPLE_PROBLEM, "{}"));

    expect(preview.system.jobs[0].job_id).toBe("J-101");
    expect(preview.system.jobs[0].operations[0]).toMatchObject({
      workcenter: "WC-CUT",
      processing_time: 4,
    });
    expect(preview.system.workcenters[0].machines[0].name).toBe("M-01");
    expect(preview.parameters).toEqual({});
  });
});
