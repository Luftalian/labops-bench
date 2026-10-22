# Viewer

The default page is canonical 0.2: task room dimensions and per-type count limits, exact selected device/arm/AMR counts, and full-workload completion time. It calls `/v2/` and uses the original PoC PlanView/ThreeView directly on recorded replay data. Actual arms and their load/unload/handoff events are displayed.

Metrics stay server-owned as replay time changes. Invalid and placement-failed requests hide the old scene and scores; unfinished runs show null makespan as unfinished. JSON export retains the submitted request, immutable task context and result.

The separate `/scheduler/` page steps the shared engine at scheduler epochs, edits job priorities and physical target layouts, and replays real movement intervals in 2D. It lists development and LeMat-derived scheduler tasks and shows receipts plus engine activity. Room / count settings creates a persistent custom condition. `/benchmarks/` shows saved heuristic/Luna/Jev trials, their actual priorities and event replay; browser controls do not silently start paid inference.

The Equipment labels checkbox toggles labels in both 2D and 3D. Its preference persists across reloads and is shared with the dynamic PoC viewer on the same origin; it only changes rendering.

`/poc/` is dynamic operation with recorded Luna trials and `/api/v4/`; `/legacy/` is the old credit/H viewer using `/v1/`. Those metrics are not formal 0.2 scores. The old `stage1-adapter.mjs` is a legacy display adapter, not the current arm model.
