import type { Job, ProblemDefinition } from "../schema/problem";

export type RgbColor = [number, number, number];

/**
 * Muted, distinguishable colors chosen for LEKIN's calm research-workbench
 * visual language. Automatic assignment uses every entry before generating
 * additional colors.
 */
export const JOB_COLOR_PALETTE: readonly RgbColor[] = [
  [91, 120, 165],
  [186, 121, 89],
  [102, 143, 122],
  [126, 91, 154],
  [181, 141, 58],
  [61, 132, 143],
  [165, 89, 111],
  [84, 104, 134],
  [150, 112, 67],
  [73, 139, 153],
  [113, 126, 74],
  [153, 94, 73],
] as const;

const DARK_FOREGROUND = "#000000";
const LIGHT_FOREGROUND = "#ffffff";

function colorKey(rgb: readonly number[]): string {
  return rgb.join(",");
}

function hslToRgb(hue: number, saturation: number, lightness: number): RgbColor {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const sector = ((hue % 360) + 360) % 360 / 60;
  const x = chroma * (1 - Math.abs((sector % 2) - 1));
  const [r1, g1, b1] =
    sector < 1 ? [chroma, x, 0]
      : sector < 2 ? [x, chroma, 0]
        : sector < 3 ? [0, chroma, x]
          : sector < 4 ? [0, x, chroma]
            : sector < 5 ? [x, 0, chroma]
              : [chroma, 0, x];
  const match = l - chroma / 2;
  return [r1, g1, b1].map((component) => Math.round((component + match) * 255)) as RgbColor;
}

function generatedColor(index: number): RgbColor {
  const generatedIndex = index - JOB_COLOR_PALETTE.length;
  const hue = (212 + generatedIndex * 137.508) % 360;
  const saturation = 42 + (generatedIndex % 3) * 5;
  const lightness = 43 + (generatedIndex % 2) * 7;
  return hslToRgb(hue, saturation, lightness);
}

export function automaticJobColor(
  jobs: readonly Pick<Job, "rgb">[],
  ignoredJobIndex: number | null = null,
): RgbColor {
  const used = new Set(
    jobs.flatMap((job, index) =>
      index !== ignoredJobIndex && job.rgb ? [colorKey(job.rgb)] : [],
    ),
  );

  for (let index = 0; ; index += 1) {
    const candidate = index < JOB_COLOR_PALETTE.length
      ? JOB_COLOR_PALETTE[index]!
      : generatedColor(index);
    if (!used.has(colorKey(candidate))) return [...candidate] as RgbColor;
  }
}

/**
 * The editor boundary for legacy and hand-authored problems. Missing colors
 * are assigned once, then stored on the job so renaming or reordering never
 * changes a job's appearance.
 */
export function assignMissingJobColors(problem: ProblemDefinition): ProblemDefinition {
  if (problem.jobs.every((job) => job.rgb !== undefined)) return problem;

  const explicit = problem.jobs.filter((job) => job.rgb !== undefined);
  const newlyAssigned: Job[] = [];
  const jobs = problem.jobs.map((job) => {
    if (job.rgb) return job;
    const assigned = { ...job, rgb: automaticJobColor([...explicit, ...newlyAssigned]) };
    newlyAssigned.push(assigned);
    return assigned;
  });
  return { ...problem, jobs };
}

export function jobColorMap(jobs: readonly Job[]): Map<string, RgbColor> {
  const assigned = assignMissingJobColors({
    schemaVersion: "1.0.0",
    problemId: "",
    name: "",
    jobs: [...jobs],
    workcenters: [],
    machines: [],
  });
  return new Map(assigned.jobs.map((job) => [job.jobId, job.rgb!]));
}

export function rgbToCss(rgb: readonly number[]): string {
  return `rgb(${rgb.join(", ")})`;
}

export function rgbToHex(rgb: readonly number[]): string {
  return `#${rgb.map((component) => component.toString(16).padStart(2, "0")).join("")}`;
}

export function hexToRgb(hex: string): RgbColor | null {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function relativeLuminance(rgb: readonly number[]): number {
  const linear = rgb.map((component) => {
    const value = component / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

export function contrastRatio(first: readonly number[], second: readonly number[]): number {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

export function readableForeground(rgb: readonly number[]): typeof DARK_FOREGROUND | typeof LIGHT_FOREGROUND {
  const darkContrast = contrastRatio(rgb, [0, 0, 0]);
  const lightContrast = contrastRatio(rgb, [255, 255, 255]);
  return darkContrast >= lightContrast ? DARK_FOREGROUND : LIGHT_FOREGROUND;
}

export function sameRgb(first: readonly number[] | undefined, second: readonly number[] | undefined): boolean {
  return first !== undefined
    && second !== undefined
    && first.length === second.length
    && first.every((component, index) => component === second[index]);
}
