# Nonthermal screening and transport workloads

The old thermal case remains available. Its long ramp/dwell/cool operations can obscure placement, transport and configuration effects. The layout reference remains a feasibility heuristic; it is not a makespan optimizer.

## New cases

| Case | Workflows | Intended challenge |
|---|---|---|
| Ambient screening · mixed demand (default) | Interleaved formulation, dispersion and solid recovery | Concurrent shared resources and allocation |
| Ambient screening · shifting demand | Three successive cohorts of the same workflows | Idle-module exchanges against 360 s setup cost |
| Transport stress · short operations | Same route families with at most 30 s operations | Fleet contention, travel, arm handoffs and finite buffers |

Formulation: liquid handling 90 s → stirring 360 s → filtration 120 s. Dispersion: liquid handling 60 s → sonication 300 s → centrifugation 120 s. Recovery: grinding 180 s → stirring 120 s → centrifugation 180 s → filtration 120 s. These are synthetic engineering fixtures, not validated chemical recipes. Transport-stress durations are separate synthetic fixtures, not shortened LeMat protocols. Original thermal/source programs are unchanged.

The new presets use 10 flexible benches, 2 shared AMRs, no furnace/oven/XRD, arrivals every 20 s (transport stress: all released at time zero). Seven process module types and finite module inventory remain available. New optional `ovens` parameter is 0–1; furnace and XRD counts can be zero for workloads that do not require them. Tasks needing a missing fixed capability are rejected.

## Observed comparisons

All fixed/adaptive pairs use identical task configuration and workload hashes. Process/arm/AMR loads describe resource use, rather than establishing a causal bottleneck.

| Case | Seed | Fixed (min) | Adaptive (min) | Reduction in makespan |
|---|---:|---:|---:|---:|
| screening-shift | 17 | 238.2 | 200.1 | 16.0% |
| screening-shift | 29 | 238.2 | 200.1 | 16.0% |
| screening-mix | 17 | 260.0 | 192.6 | 25.9% |
| screening-mix | 29 | 260.0 | 192.6 | 25.9% |

Resource-sensitivity runs use 60 jobs and preserve workload hashes within each track. Changing room width or bench count also changes the heuristic placement (and arm count for bench changes); these are whole-environment comparisons, not isolated causal effects.

| Track | Condition | Makespan (min) | Complete |
|---|---|---:|---:|
| transport | 2 AMRs | 154.8 | 60/60 |
| transport | 4 AMRs | 124.4 | 60/60 |
| equipment | 7 benches | 210.5 | 60/60 |
| equipment | 12 benches | 172.8 | 60/60 |
| floor | 10 m width | 133.7 | 60/60 |
| floor | 18 m width | 172.8 | 60/60 |

Recorded reference demo: 120 jobs, 355.5 simulated minutes, 1 module exchanges, peak 7 processing windows; thermal process resource-time share 0.0%. Raw folder: `results/v4/2026-10-21T02-32-19.163Z-adaptive-9eb2c6`.

## Interpretation and limitations

The measured differences show that these fixtures expose policy/resource sensitivity beyond furnace waiting. They do not establish that the reference layouts or schedules are optimal, that every added resource improves performance, or that an LLM can solve the tasks. Both controllers are deterministic references; fixed/adaptive changes the module policy. The two tested seeds change arrival jitter only and produced identical makespans under the saturated demand cases; this is not broad statistical validation. Broader recipe/program distributions and real protocols remain future work. Geometry and traffic are still declared approximations; chemistry is not simulated.

The initial grinder-heavy inventory is a common starting condition, not an optimized allocation. A capable manager can repurpose idle modules. Module interoperability and setup duration are assumptions.

## Reproduction and evidence

- Evaluation: [saved report](../results/v4/screening-evaluation-2026-10-21T02-29-13.510Z/report-with-mixed-demo.json), with immutable raw gzip results/manifests and source hashes. Previous thermal and fleet evaluation folders are preserved.
- `npm run benchmark:v4:screening` reproduces the comparison design and generates a new dated report (the current saved report additionally retains the previous shifting-demand demo run).
- `npm run check:v4`: 13 tests passed, including legacy/source preservation, nonthermal fixtures and diagnostic accounting.
- `node scripts/validate-v4-results.mjs results/v4/latest-screening-evaluation.json /tmp/screening-audit.json` audits all saved episodes.
- `node scripts/validate-fleet.mjs results/v4/latest-screening-evaluation.json /tmp/screening-separation.json` independently checks minimum separation on the declared continuous piecewise-linear vehicle trajectories.
- `results/v4/validation/ambient-screening/` stores tests, audits and HTTP/direct/worker equality checks. These are software checks, not scientific or physical validation.

The reference preset uses the mixed case; the viewer can also open the separate recorded Codex Luna trial (see codex-luna.md). Changing Workload loads its resource/arrival preset before the next run. Station labels remain optional. Results include process / assigned station time and reserved / available arm and AMR time; parallel resource-seconds are explicitly distinguished from elapsed time.
