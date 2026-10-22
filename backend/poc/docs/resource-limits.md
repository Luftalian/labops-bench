# Resource counts as upper bounds

New tasks declare `resource_count_semantics: upper-bounds`. This supersedes the earlier exact-placement interpretation.

- Bench, furnace, oven, XRD and transport-AMR counts are ceilings on available resources. The planner may leave resources unused.
- Experiment jobs remain required workload. Width and depth bound the same room; the planner does not enlarge it silently. Buffer and batch slots are capacity ceilings. Seed, arrival interval and exchange duration retain their meanings.
- Optional initial process-module JSON describes available initial modules; its sum may be below the bench limit. Required workflow capabilities must remain available. The legacy configuration key `initial_inventory` now stores available initial quantities for new tasks; the committed layout and `installed_resources` store actual deployment.
- The deterministic reference tries the full inventory, then a descending sequence of proportional subsets that retain every declared workflow capability. Each candidate must pass global geometry and fleet access checks. AMR deployment can also be reduced within its limit. It does not prove maximum packing or optimal throughput. Selected fixed equipment stays installed during execution; online reconfiguration exchanges modules within the selected bench count.
- Agent sessions expose resource limits and installed/unused counts in observations. External agents can propose their own layouts within the same limits. A workload that lacks any compatible available equipment is rejected; geometry search failure is reported as `layout_search_failed`, with violations and no claim of physical impossibility.

## Observed correction

The user case was run through the local API with 100 jobs, seed 17, room 8 × 7 m, maximum 100 modular benches and maximum 2 AMRs, with no furnace/oven/XRD. All 100 jobs completed with 8 benches, 4 arms and 2 AMRs. 92 benches were unused. Makespan was 78.28 simulated hours, using the synthetic six-hour stirring workload. The room and job count were unchanged. This is software-model evidence, not real experimental validation.

Raw output: `results/v4/2026-10-21T05-17-41.324Z-fixed-126ccf`. [HTTP record](../results/v4/validation/layout-failure/resource-limits-http.json). Repeat with `node scripts/check-resource-limits.mjs` while `npm start` is running; new raw runs get dated folders. Run `node --test sim/v4/tests/*.test.mjs` for the regression suite.

## Validation

19 v4 tests passed, including the original 100-job case, capability-preserving furnace subset selection, partial initial allocations and genuine design failure with a blocked room. The recorded HTTP episode passed source/result hashes, global geometry, resource exclusivity, unchanged programs and finite-buffer checks. An independent piecewise-linear trajectory audit found minimum AMR separation of 0.60 m against a required 0.44 m. These are software checks, not vehicle dynamics or robot safety certification.

In the browser, submitting 8 × 7 m with the limit still at 100 produced 8 installed benches. Results showed 100/100 complete and a LIMIT / INSTALLED / UNUSED resource table. [Screenshot](resource-limits-results.png). English setting labels now say Maximum; resource selection remains automatic.

Existing Luna and large-hall recordings preserve their original raw outputs and checked simulator snapshots. Their earlier exact-count behavior remains historical evidence and is not recomputed under the new semantics.
