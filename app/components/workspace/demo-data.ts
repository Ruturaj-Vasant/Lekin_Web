export type DemoColor = "blue" | "orange" | "green";

export type DemoJob = {
  id: string;
  due: string;
  weight: string;
  color: DemoColor;
};

export type DemoBar = {
  machine: number;
  left: number;
  width: number;
  label: string;
  color: DemoColor;
};

// Presentation-only fixtures. These are replaced by ExecutionResult data when
// the browser adapter lands; they deliberately do not duplicate shared schema.
export const demoJobs: DemoJob[] = [
  { id: "J-101", due: "18", weight: "1.0", color: "blue" },
  { id: "J-102", due: "24", weight: "1.5", color: "orange" },
  { id: "J-103", due: "30", weight: "0.8", color: "green" },
];

export const demoBars: DemoBar[] = [
  { machine: 0, left: 0, width: 18, label: "J-101 · Cut", color: "blue" },
  { machine: 0, left: 23, width: 24, label: "J-102 · Cut", color: "orange" },
  { machine: 0, left: 52, width: 19, label: "J-103 · Cut", color: "green" },
  { machine: 1, left: 19, width: 25, label: "J-101 · Mill", color: "blue" },
  { machine: 1, left: 49, width: 29, label: "J-102 · Mill", color: "orange" },
  { machine: 2, left: 45, width: 22, label: "J-101 · Finish", color: "blue" },
  { machine: 2, left: 71, width: 25, label: "J-103 · Finish", color: "green" },
];
