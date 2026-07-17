import minimalSptSource from "../../examples/custom-algorithms/01_minimal_spt.py?raw";
import iterativeSource from "../../examples/custom-algorithms/03_bounded_iterative_improvement.py?raw";

export type CustomAlgorithmTemplateId = "spt" | "iterative" | "blank";

export const CUSTOM_ALGORITHM_TEMPLATES: Record<CustomAlgorithmTemplateId, { name: string; description: string; source: string }> = {
  spt: {
    name: "Custom SPT",
    description: "A complete constructive rule that schedules the shortest available job first.",
    source: minimalSptSource,
  },
  iterative: {
    name: "Bounded experiment",
    description: "A local-search example with parameters, progress, incumbents, and cooperative stopping.",
    source: iterativeSource,
  },
  blank: {
    name: "Untitled custom algorithm",
    description: "The smallest valid function contract, ready for your implementation.",
    source: `def schedule(system, parameters, context):
    # Build and return a real lekinpy.Schedule here.
    raise NotImplementedError("Implement this algorithm")
`,
  },
};

export const DEFAULT_CUSTOM_ALGORITHM_TEMPLATE = CUSTOM_ALGORITHM_TEMPLATES.spt;
