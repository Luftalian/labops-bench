# Laboratory execution model

The fixed-design and scheduler adapters use the shared PoC HallEnvironment, equipment/arm models, geometry validators and replay objects. They use different declared execution policies.

## Resources and geometry

A task fixes room dimensions and resource ceilings. Counts must be exact; an unsuccessful placement must not silently install fewer resources. Explicit layouts are checked against equipment bodies, arm bases/reach, ports, service areas, finite buffers and mobile-robot access.

The fixed-design mode uses a shared placement heuristic when no explicit layout is supplied. Failure returns layout_search_failed with infeasibility_proven=false.

Loading, processing, cooling, unloading and handoff occupy modeled resources. Arm operations and mobile-robot trips use reservations, including conflicts and return trips. Independent resources may operate concurrently. The current dispatch policy processes one operation per device; nominal catalog batch capacity alone does not imply batch execution.

## Completion and playback

A job completes after its final processing operation and arm unloading. Returns that remain after the final job do not extend its completion time. Truncation produces no finite makespan. Trace entries may include reserved future intervals; elapsed time determines which events have happened.

2D/3D viewers read engine events and stored scores. They do not recompute benchmark scores. Activity bars show recorded device occupancy, including loading and unloading.

## Scheduling and equipment moves

The priority-first scheduler applies decisions to unreserved operations and never interrupts committed operations. Before relocation it stops new admission, drains admitted jobs and reservations, then accounts for movement, reconnection and calibration. IDs, device models and owned counts are preserved.

Movement uses a conservative straight-path/swept-envelope model. Default relocation parameters in backend/scheduler/data/relocation.json are synthetic assumptions, not measured robot performance. External staging is task opt-in, with an explicit gate and modeled external handling. See [the scheduler interface](SCHEDULER_INTERFACE.md) and [suite settings](LEMAT_SDL_BENCHMARK.md).

## Provenance and limits

Import manifests and patch manifests preserve the relationship to the PoC source. Source snapshots required for historical decision replay remain bundled. These records are reproducibility inputs.

Workflow durations, equipment mappings and missing values have field-level provenance. Geometry and scheduling tests do not establish chemical validity, joint-space collision safety, cable/pipe feasibility or physical laboratory performance.
