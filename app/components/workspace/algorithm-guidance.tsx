import type { ProblemDefinition } from "../../../lib/schema/problem";
import { analyzeFlowShop, meetsJohnsonOptimalityConditions } from "../../../lib/scheduling/flow-shop";
import { johnsonLimitations } from "../../../lib/presentation/schedule-guarantee";

export function AlgorithmGuidance({ problem, algorithmId }: { problem: ProblemDefinition; algorithmId: string }) {
  const flowShop = analyzeFlowShop(problem);
  if (!flowShop.isFlowShop) {
    return <div id="algorithm-guidance" className="algorithm-guidance guidance-unavailable">
      <strong>Johnson needs a flow shop</strong>
      <p>Unavailable because {flowShop.reason}.</p>
      <p>Use a shared route with at least two distinct stages and one machine per stage, or open the two-machine flow shop in Examples.</p>
    </div>;
  }
  if (algorithmId !== "johnson") return null;
  const optimal = meetsJohnsonOptimalityConditions(problem);
  const checks = [
    { met: flowShop.route.length === 2, label: `Exactly two stages${flowShop.route.length !== 2 ? ` · currently ${flowShop.route.length}` : ""}` },
    { met: true, label: "One machine per stage, same route" },
    { met: problem.jobs.every((job) => job.release === 0), label: "Every job released at time 0" },
  ];
  return <div id="algorithm-guidance" className={`algorithm-guidance guidance-${optimal ? "optimal" : "heuristic"}`}>
    <span className="guidance-kicker">Makespan guarantee</span>
    <strong>{optimal ? "Proof conditions met" : "Heuristic for this problem"}</strong>
    <ul>{checks.map((check) => <li key={check.label} className={check.met ? "condition-met" : "condition-unmet"}>
      <span aria-label={check.met ? "Met:" : "Unmet:"}>{check.met ? "✓" : "!"}</span>{check.label}
    </li>)}</ul>
    <p>{optimal ? "Johnson will minimize Cmax. This guarantee applies to makespan only." : johnsonLimitations(problem)}</p>
  </div>;
}
