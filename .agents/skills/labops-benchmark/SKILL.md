---
name: labops-benchmark
description: Implement or inspect LabOpsBench count-constrained makespan scoring, search runs, baselines and reproducible comparisons.
---

# Fair count-constrained benchmark

Read `docs/EVALUATION.md`, `contracts/README.md` and the current Task/DesignRequest/EvaluationResult definitions.

Use identical room geometry, per-type equipment limits, arm/AMR ceilings, workload, seed, execution policy and evaluator call cap across methods. Rank completed simulation results by full-workload makespan alone. Equal times tie; partial, failed and invalid runs have no finite completion score.

Route every contestant through the same evaluator and server-owned call counter. Count initial, rejected, repeated and greedy-neighbor proposals. Retry identity requires the same submission ID and identical input. Preserve every result and failure.

The runtime agent receives public task/catalog and tool observations; development skills and hidden reference optima stay outside contestant context. Record concise proposal rationales, tool calls and outcomes. Model/provider and spending follow explicit user authorization.

When evaluation is requested, compare room/count conditions with recorded task versions and all search runs, distinguishing search randomness, simulation seed, replay and fresh model inference. Report sample count, spread and the searched layout/design space. A heuristic best candidate is not a general optimum.

Development fixtures are software evidence. Keep old 0.1 credit/H results and recorded PoC dynamic trials separate from current formal rankings.
