# Evaluation rules

## Objective and completion

The primary score is makespan in simulation seconds from t=0 through the final operation and arm unloading of every job. Only completed runs with all jobs finished and finite makespan are ranked. Invalid inputs, failed placement, errors and truncated runs are reported separately. Equal makespans tie.

Equipment prices, fewer installed resources and throughput at a fixed horizon are not tie-breakers in the current evaluation.

## Published scheduler comparison

The distributed suite has 14 scenarios and 50 selected trials: three methods on ten scenarios and five on four decision challenges. Settings are defined in [LEMAT_SDL_BENCHMARK.md](LEMAT_SDL_BENCHMARK.md), with additional candidate-space and ordering controls in [SCHEDULER_CHALLENGES.md](SCHEDULER_CHALLENGES.md).

All methods in a comparison share task/version, workload, future-arrival visibility, seed, room, resource ceilings, processing programs, buffers, transport and relocation assumptions, candidate space and decision budget. The published period is 1,800 simulation seconds, maximum decisions 32, response timeout 300 wall seconds and simulation cutoff 365 days.

The simulation clock pauses during policy inference. Inference wall time, token usage and cost are separate measurements; unavailable usage is reported as unavailable. Physical draining, movement, reconnection and calibration remain part of simulated makespan.

One selected trial per method/scenario does not establish statistical significance or a general model ranking. The public distribution contains selected recordings, not every experiment or failed provider attempt. Scope and known limitations are retained in the generated result reports.

## Fixed-design v0.2

The separate /v2/ evaluator holds task geometry, per-type counts, workload, seed and execution policy fixed. Each proposed count/layout design consumes an evaluator call, including invalid or repeated new submissions. Idempotent retries use the same submission ID and identical content. Every greedy neighbour is an evaluation. The initial call cap is K=20; it is distinct from decisions within a scheduler episode.

The final recommendation must be an evaluated, completed design. Record task/catalog/workflow/policy versions, source hashes, environment, search seed, all submissions and failures. Historical v0.1 budget/horizon scores are not comparable with current makespan results.

## Verification

Use the saved recording checksums and [submission evidence verifier](submission-2026/verify_evidence.py) to check distributed results. Replaying saved decisions verifies deterministic execution; it does not run a model again. Fresh evaluations must retain their own inputs, outputs, environment and failures.
