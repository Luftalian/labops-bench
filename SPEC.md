# LabOpsBench specification

LabOpsBench evaluates equipment configuration and scheduling decisions for finite experimental workloads. Room geometry and resource limits are task inputs. The objective is completed-workload makespan, including final arm unloading.

## Evaluation modes

| Mode | Decisions | Role |
| --- | --- | --- |
| Published LeMat scheduler suite | Initial shared configuration candidate, job priorities, permitted equipment exchanges | 14 scenarios and 50 selected recordings accompanying the submission |
| Fixed-design v0.2 | Exact instrument, arm and AMR counts; explicit layout or shared layout heuristic | Separate count-constrained evaluator at /v2/; fixed execution policy after installation |
| Historical v0.1 and PoC | Version-specific actions and objectives | Compatibility tests and historical replay; separate scores |

The published suite uses the canonical scheduler protocol through a finite-candidate adapter. Supporting arbitrary layouts in the API does not imply that arbitrary layout generation was evaluated in the published trials.

## Sources of truth

- Types and required fields: contracts/labops.schema.json.
- HTTP APIs and retry accounting: contracts/README.md and backend/scheduler/README.md.
- Scheduler observation, decision and time: docs/SCHEDULER_INTERFACE.md.
- Published scenarios and workflow assumptions: benchmark/lemat-sdl/scenarios.json and workflows.json.
- Scoring and comparison rules: docs/EVALUATION.md.
- Physical execution assumptions: docs/SIMULATION.md.
- Data and asset provenance: docs/DATA.md and docs/SOURCES.md.

Units are seconds, metres and integer resource counts. JSON fields use snake_case. Floor geometry follows the PoC coordinate system; 2D and 3D displays consume the same recorded geometry.

## Boundaries

Policies cannot rewrite task constraints, processing durations, completion state, reservations or scores. The engine checks geometry, capabilities, reach, buffers and transport feasibility. A failed layout heuristic is not proof that no feasible layout exists.

The fixed-design evaluator installs exactly the submitted counts and disables dynamic changes. Its development fixtures share a workload and limits in 8×7 m and 14×10 m rooms. These fixtures are synthetic software tests.

The scheduler suite exposes known future arrivals as well as all remaining jobs. Custom room/count settings create a separate task identity; results from changed settings must not be merged into the original comparison.

Chemical success, autonomous hypothesis generation, failure recovery and detailed real-world safety validation are outside the benchmark.
