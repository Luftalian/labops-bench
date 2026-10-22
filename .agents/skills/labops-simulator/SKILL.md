---
name: labops-simulator
description: Implement or debug LabOpsBench shared event simulation of instruments, arms, queues and sample transport.
---

# Laboratory operations simulator

Read `docs/SIMULATION.md`, `docs/EVALUATION.md` and the affected canonical schema definitions. Reuse the PoC engine through the formal count-policy adapter.

Preserve actual device, arm and AMR identities and the exact selected inventory within task ceilings. Validate geometry, reach, resource assignments and routes before execution. Report placement-heuristic failure separately from proven infeasibility.

Charge arm loading, unloading and handoffs as exclusive intervals. Preserve shared buffers, transport reservations, empty travel and the documented closed-tour policy for every fleet size. Completion includes final arm unloading; incomplete runs have no finite makespan.

Verify arm/device resource exclusion, genuine process overlap, exact installed counts, room/count/required-resource rejection, deterministic replay and cutoff behavior. Avoid assuming that adding resources or floor area always shortens completion time.

Keep event generation independent of rendering and chemistry prediction outside the simulator. Preserve source provenance and archived 0.1/PoC replay compatibility. The 12-second credit/H oracle belongs to the archived 0.1 contract, not the new arm model.
