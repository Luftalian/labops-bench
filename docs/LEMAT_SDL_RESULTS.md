# LeMat SDL exploratory results

Generated 2026-10-22T12:25:47.059Z by node scripts/build-lemat-report.mjs. Simulated hours; completed-only makespan, lower is better.

## New decision challenges

| Scenario | Room (m) | Jobs | Arrival-order FIFO (h) | Capacity + longest remaining work (h) | Bottleneck / travel + downstream-first (h) | GPT-6 Luna (medium) (h) | Jev 1.14.0 (h) |
|---|---|---:|---:|---:|---:|---:|---:|
| 11-priority-tail v1 | 7 × 5 | 12 | 12.625 | 8.310 | 8.282 | 8.268 | 8.327 |
| 12-overfull-inventory v1 | 4 × 3.4 | 22 | 7.661 | 7.661 | 5.068 | 4.860 | 5.459 |
| 13-lookahead-exchange v1 | 4 × 3.4 | 39 | 7.467 | 7.467 | 6.598 | 5.909 | 7.346 |
| 14-layout-distance v1 | 24 × 16 | 48 | 1.366 | 1.354 | 0.683 | 0.724 | 0.683 |

## Original literature-derived cases (refreshed)

| Scenario | Room (m) | Jobs | Arrival-order FIFO (h) | Capacity + longest remaining work (h) | Bottleneck / travel + downstream-first (h) | GPT-6 Luna (medium) (h) | Jev 1.14.0 (h) |
|---|---|---:|---:|---:|---:|---:|---:|
| 01-single-station v1 | 5 × 4 | 24 | 4.235 | 4.235 | 4.235 | 4.235 | 4.235 |
| 02-cramped-exchange v1 | 4 × 3.4 | 16 | 2.898 | 2.742 | 2.742 | 2.742 | 2.742 |
| 03-many-arms v2 | 32 × 24 | 64 | 2.014 | 2.014 | 2.014 | 2.014 | 2.014 |
| 04-staggered-jobs v1 | 14 × 10 | 48 | 110.300 | 113.468 | 113.442 | 112.793 | 109.892 |
| 05-bursty-demand v1 | 12 × 9 | 48 | 13.520 | 13.520 | 13.520 | 13.520 | 13.520 |
| 06-long-process-overlap v1 | 14 × 10 | 32 | 51.449 | 51.462 | 51.462 | 51.449 | 51.449 |
| 07-transport-pressure v1 | 22 × 12 | 48 | 1.188 | 1.188 | 1.243 | 1.190 | 1.188 |
| 08-finite-buffers v1 | 12 × 9 | 24 | 12.863 | 12.862 | 12.862 | 12.863 | 12.862 |
| 09-room-small v1 | 9 × 7 | 32 | 3.104 | 3.091 | 3.100 | 3.104 | 3.091 |
| 10-room-wide v1 | 24 × 16 | 32 | 3.165 | 3.159 | 3.189 | 3.165 | 3.159 |

## Synthetic scheduler development tasks (refreshed)

| Scenario | Room (m) | Jobs | Arrival-order FIFO (h) | Capacity + longest remaining work (h) | Bottleneck / travel + downstream-first (h) | GPT-6 Luna (medium) (h) | Jev 1.14.0 (h) |
|---|---|---:|---:|---:|---:|---:|---:|
| scheduler-room-14x10-dev vscheduler-1 | 14 × 10 | 6 | 1.546 | 1.546 | 1.546 | 1.546 | 1.546 |
| scheduler-room-8x7-dev vscheduler-1 | 8 × 7 | 6 | 1.526 | 1.526 | 1.526 | 1.526 | 1.526 |

- Fourteen cases use the public LeMat annotation subset, not the gated full database; two scheduler development cases are wholly synthetic. Literature operation times retain source provenance; workload composition, arrivals, geometry and staging are engineering assumptions.
- The original ten literature-derived cases retain their restricted three-layout menu. Updated trials are selected after the declared refresh time; earlier trials remain archived. Missing cells represent pending runs.
- Two synthetic scheduler development tasks retain their existing task IDs, seeds and workloads. Their one-arm-per-cell menu excludes proposals exceeding the eight-arm ceiling; these are not literature-derived experiments.
- New challenge cases compare five policies through the same public observation, candidates, canonical decision and engine. Sophisticated algorithms are valid contestants; no LLM win is assumed.
- One selected valid trial per method/scenario version; no statistical ranking or global optimum claim. Malformed-answer attempts are preserved separately. Three Luna cases were rerun from fresh sessions after invalid priority job sets were found; selection follows run time and task/config matching, not score. Missing pairs mean not run, not failure or zero time.
- Three Luna conditions have an additional failed formatting attempt. The shared decision cap applies per session; cumulative inference attempts are therefore unequal, and these exploratory results do not establish a statistical model ranking.
- Case 03 v2 starts prepared samples in local finite buffers; setup transport is outside its boundary. Intake-fed v1 remains archived.
- After the shared 32-decision cap, last priorities persist. Exchange drains admitted whole jobs; workflows requiring all stages cannot span missing-device configurations in this draft. Staging challenges deliberately use independent source-derived unit operations.
- Tight packing preserves device dimensions, arm reach, buffers, AMR footprint and route checks. Geometry validity is not articulated robot collision or real laboratory safety certification.

Cadence 1800s; maximum 32 decisions. Jev cumulative known input cost estimate USD 0.320871, conservative charged/reserved USD 0.365344 / 3. Luna uses the authorized isolated Codex contestant, medium reasoning; no token/USD meter exposed.

## Reproduction and evidence

- [Settings and source assumptions](LEMAT_SDL_BENCHMARK.md); [policy architecture and challenges](SCHEDULER_CHALLENGES.md).
- [Scenarios](../benchmark/lemat-sdl/scenarios.json), [source fields](../benchmark/lemat-sdl/workflows.json), [initial layout audit](SCHEDULER_INITIAL_LAYOUT_AUDIT.json).
- Raw immutable task/result/journal/provider input/output and source snapshots: results/lemat-sdl/<run>/<task>/. Large evidence files are Git-ignored, generated summaries remain reviewable.
- Selected runs: fifo = 2026-10-22T11-27-29.241Z-fifo-09da504a, 2026-10-21T16-41-19.195Z-fifo-9838c9f6; heuristic = 2026-10-22T11-27-30.419Z-heuristic-2f556b24, 2026-10-21T16-41-21.456Z-heuristic-fcee444d; algorithm-advanced = 2026-10-22T11-27-31.619Z-algorithm-advanced-8a1e6180, 2026-10-21T16-41-20.287Z-algorithm-advanced-f136f93d; gpt-6-luna-medium = 2026-10-22T11-41-27.612Z-gpt-6-luna-medium-e86af7cf, 2026-10-22T12-11-06.739Z-gpt-6-luna-medium-3fc85534, 2026-10-22T00-54-02.898Z-gpt-6-luna-medium-227bf651; jev = 2026-10-22T11-27-39.418Z-jev-73f2b071, 2026-10-22T00-54-26.159Z-jev-5460ce3c.
- Prior failures remain in report.json; incomplete results have no finite completion score. Initial Jev failures used overwritten same-epoch body files; missing per-retry bodies are not claimed available.
