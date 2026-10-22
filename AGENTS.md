# LabOpsBench development instructions

Read SPEC.md and the relevant domain document before changing behavior. API types are defined in contracts/labops.schema.json. Development skills under .agents/skills are for contributors, not information given to a benchmark contestant.

## Invariants

- Distinguish the fixed-design v0.2 evaluator, the published dynamic scheduler suite, and historical v0.1/PoC modes.
- Keep room geometry, resource ceilings, workload, seeds, candidate space, decision budgets and execution policy identical within a comparison.
- The engine owns time, reservations, validation, dispatch and scoring. Policies choose configurations and priorities through the documented interface.
- Rank completed workloads by makespan through final arm unloading. Failed, invalid or incomplete runs have no finite completion score.
- Preserve scientific provenance and label synthetic values, assumed parameters, recorded replay and fresh inference accurately.
- Do not alter archived model answers, recordings or their checksums to improve a comparison.
- The simulator does not predict reaction success or validate real-world robot safety.
- Provider calls and spending require explicit authorization. Viewer and validation commands must remain usable without API keys.

## Changes and checks

Use one bounded branch/worktree per task. Respect other contributors' changes.
For contract changes, use labops-contract-change and update schema, semantics, fixtures and consumers together. Record technical rationale in docs/DECISIONS.md.
Run python scripts/check_contracts.py and python -m unittest discover -s tests -v with the project environment. Run the relevant Node integration and PoC checks for runtime changes. For documentation-only changes, verify links and consistency.
After changing submission artifacts, update their manifests and run python3 docs/submission-2026/verify_evidence.py.
