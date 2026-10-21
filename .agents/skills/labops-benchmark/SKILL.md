---
name: labops-benchmark
description: Implement or inspect LabOpsBench search runs, baselines, runtime AI tool loops, scoring and reproducible comparisons under fixed evaluation budgets.
---

# Fair scaling benchmark

Read `docs/EVALUATION.md`, `contracts/README.md` and the Task/DesignRequest/EvaluationResult definitions from the repository root.

Route every contestant through the same evaluator and server-side call counter. Include initial, rejected and repeated proposals in the budget. Each greedy candidate evaluation is a call. Deduplicate transport retries only by the same submission ID and identical payload.

Keep equipment credits, evaluator calls, simulation time and API spending distinct. Use configured task versions, release schedule and horizon. Do not tune these after viewing final results. Separate development and final evaluation tasks.

The runtime agent receives public task/catalog and tool observations; coding skills and reference optimums are not runtime context. Record concise proposal rationales, tool calls and outcomes, not private chain-of-thought. Respect the configured model and API spending limit.

Implement Random and Greedy under the same call cap. Persist all runs including failures. Distinguish search randomness from simulation randomness, and trace replay from a fresh LLM rerun. Report aggregate sample count and spread, with synthetic and literature-derived tracks separated.

Reject fixture-origin results from final score tables. A fair negative result for the AI is a valid outcome. Include provenance sufficient to recompute published numbers.
