# Larger shared-hall tests

Historical recorded cases from before the count-semantics correction. New configurable runs use [resource ceilings and feasible subset selection](resource-limits.md); these raw results and source snapshots remain unchanged.

No LLM calls were made. Each case uses one globally constrained room, shared arms/AMRs, finite buffers and the fixed deterministic reference. Layouts are feasible heuristic placements, not optimal designs.

| Case | Room | Installed devices / arms | Jobs | At time zero | Peak processing jobs | Peak processing stations | Makespan (h) |
|---|---|---|---:|---:|---:|---:|---:|
| screening-mix | 30 × 30 m | 64 / 32 | 100/100 | 100 | 8 | 7 | 4.48 |
| furnace-burst | 30 × 30 m | 57 / 29 | 200/200 | 200 | 150 | 50 | 20.64 |
| parallel-stress | 30 × 30 m | 100 / 50 | 100/100 | 100 | 100 | 100 | 8.98 |

The thermal case installed 50 furnaces; 50 were used and 50 processed concurrently. Prepared samples start at intake; upstream preparation and downstream XRD are deliberately excluded from this capacity fixture. The 7,200 s / 850 °C dwell, 5 °C/min ramp, cooling and original hypothetical four-vessel physical fixture capacity are retained. Fifty installed furnaces do not bypass shared transport or arm reservations.

The ambient burst releases 100 complete multistep workflows at time zero, with an explicit balanced initial module allocation. Its smaller actual processing peak exposes the shared transport/executor constraints; it must not be described as 100 concurrent processes. Processing windows include thermal ramp/dwell/cool where present and exclude load, clean, unload and reservation waiting.

The parallel fixture uses 100 single-slot stirrer modules and independent six-hour synthetic operations to maintain a genuine overlapping process load while samples are still physically loaded through the shared transport network. It is an engine scalability test, not a validated chemistry recipe or evidence that normal short jobs will reach the same parallelism.

## Controls and replay

Recorded runs opens a replay library. Direct local links: [Luna](http://127.0.0.1:4173/?replay=luna), [100-job burst](http://127.0.0.1:4173/?replay=burst-100), [50 furnaces](http://127.0.0.1:4173/?replay=furnaces-50), [100 actually processing](http://127.0.0.1:4173/?replay=parallel-100). No model is invoked by replaying. Luna retains its original raw trace and a checked original-source snapshot after the simulator upgrade.

The HUD distinguishes reserved stations, processing jobs and processing stations. Completion results include the release count, peak distinct processing jobs, WIP jobs, processing stations and furnaces used. Resource limits now permit 128 modular benches, 64 furnaces, 32 XRD and 128 arms; the maximum parameter combination installs 225 devices and 113 arms. Structural validation allows 256 devices / 128 arms for v4 while v2 defaults remain 64 / 32. Individual maxima do not guarantee geometric feasibility in every room.

The optional initial_modules object gives per-capability installed counts summing to benches. Blank means automatic allocation. Furnace and parallel fixtures have explicit presets; all runs preserve exact parameters and initial inventory.

## Reproduction and evidence

Run npm run benchmark:v4:large for fresh dated raw outputs and a rebuilt report. Every raw folder retains source hashes, Node version, exact command arguments, workload/config hashes and checksums. [Machine-readable report](../results/v4/large-evaluation.json). Raw run folders:

- screening-mix: results/v4/2026-10-21T03-03-25.046Z-fixed-989750
- furnace-burst: results/v4/2026-10-21T03-02-21.871Z-fixed-65b5c2
- parallel-stress: results/v4/2026-10-21T03-02-20.779Z-fixed-846e01

Validation records are in results/v4/validation/large-hall/. Global geometry, exclusivity, precedence, finite stock/buffers, unchanged programs, continuous AMR separation and independently reconstructed concurrency are software checks. Vehicle dynamics, articulated manipulation, utilities, storage packing, thermal chemistry and real facility performance are not certified. The fixture module envelopes and furnace sample capacity retain their declared assumptions.
