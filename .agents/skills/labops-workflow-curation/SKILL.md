---
name: labops-workflow-curation
description: Normalize and review synthesis records for LabOpsBench workflows, preserving provenance, units and exclusions. Use for dataset ingestion, not chemical prediction.
---

# Workflow curation

Read `docs/DATA.md`, the Workflow/Catalog schema and the relevant parts of `docs/SIMULATION.md` from the repository root.

Inspect a real source record before writing its adapter. Preserve source revision, record ID, original units and field locations. Choose workflows representable by supported operations; record why excluded records cannot be represented. Do not drop manual, cleaning, branching or sample-splitting operations silently.

Normalize time to seconds without treating a hold time as a complete process without an explicit approximation. Mark missing-value replacements as assumed. A literature extraction is not a measured lab performance model. Document operation-to-device mapping separately from the original action.

For the initial model, reject unsupported batch policies instead of dividing duration by capacity. Route model changes through the shared contract workflow.

Produce one reviewed workflow plus provenance and exclusion notes before expanding. Validate shape and references, and report whether the resulting track is literature-derived or synthetic. Keep raw gated data and tokens out of the repo; follow the recorded distribution terms.
