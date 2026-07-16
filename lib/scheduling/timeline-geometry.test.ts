import { describe, expect, it } from "vitest";
import { timelineGeometry } from "./timeline-geometry";

describe("timelineGeometry", () => {
  it("keeps adjacent short operations on an exact shared boundary for a long schedule", () => {
    const first = timelineGeometry(28, 30, 300);
    const second = timelineGeometry(30, 33, 300);

    expect(first.leftPercent + first.widthPercent).toBeCloseTo(second.leftPercent, 12);
    expect(first.widthPercent).toBeCloseTo(2 / 3, 12);
  });

  it("does not inflate a short operation to one percent", () => {
    expect(timelineGeometry(36, 37, 300).widthPercent).toBeCloseTo(1 / 3, 12);
  });
});
