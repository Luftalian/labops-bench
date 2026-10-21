---
name: labops-viewer
description: Build LabOpsBench equipment, transport replay and before/after benchmark views from recorded evaluation results.
---

# Evaluation viewer

Read `contracts/README.md`, `docs/EVALUATION.md` and the event section of `docs/SIMULATION.md` from the repository root.

Build against the provided fixtures while the API is under development. Visibly label hand-calculated fixtures. Switch to actual API output through an adapter without changing field meanings.

Render resolved device instances and recorded event paths. Use one simulation clock for before/after comparisons. Playback speed affects interpolation only; never recompute throughput, cost or completion in browser animation code.

Keep simulation seconds distinct from wall time. Convert the world y axis only in the rendering transform. Display the budget, used credits, device counts, horizon and task identity alongside the metrics. Different task versions are not a valid side-by-side comparison.

Handle invalid, truncated and error states explicitly. Show null makespan as unfinished, not zero. Plot scaling curves from saved runs and expose condition labels. Use 2D first; CAD and 3D must not delay the shared end-to-end path.

Verify a complete replay, speed change, invalid response and a result that continues beyond H. Report whether the UI uses fixtures or real simulation output.
