# Technical design rationale

- **Makespan under physical resource limits.** Room geometry, equipment, arms and AMRs are task constraints. Completed-workload makespan is the current objective; monetary equipment budgets and fixed-horizon throughput belong to the historical v0.1 mode.
- **Policy/execution separation.** Policies select configurations and priorities. The engine owns feasibility, resource reservations, nonpreemptive execution, time and scoring. Algorithms and model adapters share the same declared interface.
- **Separate evaluation modes.** The fixed-design evaluator and dynamic scheduler have different action spaces. The published scheduler comparison uses finite shared candidates, although the canonical interface also accepts explicit layouts.
- **Recorded evidence.** Preserve original decisions, source hashes and execution traces. Treat replay, fresh inference and physical experiments as distinct forms of evidence.
- **Conservative relocation.** Drain before movement, preserve equipment identity and count modeled handling time. Simplified geometry and synthetic timings are explicit assumptions.

Changes to these meanings require corresponding schema/task/policy versions and compatibility checks.
