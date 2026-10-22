# Benchmark

Current formal objective: minimize full-workload makespan under identical room geometry and per-type equipment, arm and AMR ceilings. `backend/counts/evaluator.mjs` supplies completed-only time ranking. Equal times tie without a price or resource-count tie-break.

The 2026-10-22 request authorizes ten LeMat-derived scheduler scenarios and heuristic/Luna/Jev comparisons. Definitions are in `benchmark/lemat-sdl/`, commands and limitations in `docs/LEMAT_SDL_BENCHMARK.md`, and generated evidence in `docs/LEMAT_SDL_RESULTS.md`. Fixed-design baseline search endpoints are not exposed yet. The older Random/Greedy implementation is retained only in legacy 0.1 and must not be used as current count/makespan evidence.

Use the same `/v2/evaluations` and server-owned K accounting when comparison is later requested. Preserve all attempts, failures, source hashes and declared layout-search bounds. See `docs/EVALUATION.md` for canonical comparison rules.
