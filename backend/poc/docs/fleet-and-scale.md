# Labels, shared AMR fleet and larger halls

Scale update: [large-hall tests](large-hall.md) adds limits of 128 modular benches, 64 furnaces and 32 XRD stations, plus recorded 30 × 30 m / 50-furnace and 100-process cases. Earlier numerical validation below describes its original configuration.

Implemented 2026-10-21. The topology remains one shared room, with no private transport assigned to individual workflow lines.

## Controls

- `Equipment labels` hides/shows instrument names and job/status overlays in 2D and 3D. Progress indicators, equipment bodies and station inspection remain usable. Preference is stored locally and survives scene rebuilds and reloads.
- `World settings` configures sample transport AMRs (1–8, demo default 2), room width (8–60 m), depth (7–40 m), modular benches (7–32), furnaces (1–16), XRD stations (1–12) and jobs (1–2,000).
- The maxima permit 61 instruments plus 31 arms. Dimensions and counts remain independent constraints: a small room is not guaranteed to fit the maximum inventory. Large layouts use two-instrument arm neighborhoods as geometric placement seeds; all geometry and resource contention are checked globally in one simulator.

## Fleet model and limits

Each vehicle has an exclusive calendar and a distinct validated perimeter parking bay. The dispatcher chooses the earliest feasible destination handoff among vehicles. Tours include empty travel, pickup/arm waits, loaded travel, destination handoff and return to parking. Other cars avoid parked vehicles' bays. Swept grid cells reserve time intervals, so crossing traffic waits while separated traffic can proceed concurrently. Rendering, distance and per-vehicle utilization use the recorded trajectories.

This is a conservative discrete-event traffic model. It does not certify vehicle dynamics, articulated manipulation or commissioning-cart collisions. Parking is checked when starting execution; a geometrically valid instrument layout can still be rejected if the fleet cannot park and reach all docks.

Single-AMR runs preserve the previous open-tour policy for backward reproducibility. Multi-AMR runs use closed tours. Consequently, the saved 1/2/4 comparison changes both vehicle count and return policy; it must not be interpreted as an isolated causal estimate of fleet-size benefit. No throughput improvement is assumed.

## Reproducible evidence

- Default replay at the fleet rollout (now historical): `results/v4/2026-10-21T02-14-25.634Z-adaptive-2688d8`, 180 jobs, 2 AMRs, completed, zero invalid actions. The current replay pointer is `results/v4/demo.json`; it now selects the [nonthermal mixed workload](ambient-screening.md).
- Maximum hall execution: `results/v4/2026-10-21T02-14-51.115Z-fixed-2b3d3a`, 60 × 40 m, 32 benches, 16 furnaces, 12 XRD, 31 arms, 8 AMRs, 60 jobs. Completed with zero invalid actions. Host computation took approximately 118 s on this run; larger runs can be expensive.
- Matched workload fleet-policy comparison: `results/v4/fleet-comparison.json`, 60 steady-mix jobs, fixed configuration, same workload hash, 1/2/4 AMRs. Raw results and manifests retain exact parameters, Node version, source/data hashes and gzip/raw hashes.
- `results/v4/validation/fleet-scale/tests.tap`: 11 tests passed, including fleet calendars, parked-vehicle separation, routes around equipment, concurrent tours, deterministic repeats, parameter bounds and reserved fleet identifiers.
- `results/v4/validation/fleet-scale/raw-audit.json`: 5 recorded episodes and 1,820 operations checked for hashes, global geometry, precedence, finite buffers/stock, batch compatibility, exclusive resources and unchanged source process programs.
- `results/v4/validation/fleet-scale/continuous-separation.json`: independent exact minimum separation over the declared piecewise-linear trajectories, including waiting and parked cars. All four multi-car episodes passed. Minimum center distance was approximately 0.60 m, against the model's 0.44 m requirement. This validates the software's trajectory abstraction, not real physical safety.
- `results/v4/validation/fleet-scale/http-api.json`: HTTP sessions, direct execution and worker traces agree for an 18-job two-AMR case.
- Browser checks: 2D labels off; 3D labels off (0/15 visible) and on (15/15 visible); reload persistence; settings values and ceilings; custom three-AMR run from settings. Images: `hall-labels-off-2d.png`, `hall-labels-off-3d.png`.

Reproduce the recorded audits from the repository root:

```sh
npm run check:v4
node scripts/validate-v4-results.mjs results/v4/validation/fleet-scale/runs.json /tmp/hall-raw-audit.json
node scripts/validate-fleet.mjs results/v4/validation/fleet-scale/runs.json /tmp/hall-separation.json
# with npm start running:
node scripts/smoke-v4-api.mjs /tmp/hall-http-api.json
node scripts/run-hall.mjs '{"jobs":60,"width_m":60,"depth_m":40,"benches":32,"furnaces":16,"xrd":12,"amrs":8}' fixed
```

Earlier one-AMR evaluation artifacts are retained with their original source versions. The first two-AMR implementation run (`2026-10-21T02-12-01.275Z-fixed-3701cf`) used a whole-route traffic lock and is superseded by the space-time reservation implementation; it is excluded from the current audit.
