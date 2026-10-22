---
name: labops-viewer
description: Build LabOpsBench device, arm and transport replay from recorded simulation results.
---

# Evaluation viewer

Read `contracts/README.md`, `docs/EVALUATION.md` and the event section of `docs/SIMULATION.md`.

Render actual installed devices, arms and AMRs from the evaluator layout and events. Reuse the PoC models and coordinate convention. Playback speed only changes interpolation; use server metrics for completion time and resource counts.

Show room dimensions, per-type count ceilings, selected/installed counts, task version and completion status. Keep simulation seconds separate from wall time. Comparisons use the same task or clearly labeled room conditions with matching workloads and limits.

Handle invalid, layout_search_failed, truncated and error states explicitly. Null makespan is unfinished. Hide the old scene and scores after invalid input, and preserve raw-result JSON export.

Verify 2D/3D arms, playback speed, complete and invalid/incomplete responses, and that scores stay fixed during replay. Mark synthetic and hand-calculated sources visibly. Historical 0.1 credit/H and PoC dynamic pages remain separate.
