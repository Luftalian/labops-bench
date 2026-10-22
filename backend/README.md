# Backend

`counts/` is the canonical 0.2 room/count/makespan adapter. It uses the imported PoC HallEnvironment and fixed executor, including actual arm handling, exclusive calendars, finite buffers and AMR traffic. Candidate counts are exact and limited by immutable task ceilings. The geometry validator has no active equipment-budget field.

`stage1/service.mjs` provides shared server-owned run accounting and journals. `counts/service.mjs` supplies the new schema, immutable definitions, source provenance and worker execution. The old Python stage1 engine remains available only under legacy 0.1.

`poc/IMPORT_MANIFEST.json` identifies original source/assets/recordings. `IMPORT_PATCHES.json` records the opt-in closed-tour extension, with a preserved original source and separate patched hash. Historical replays retain original snapshots.

Use the package check commands from the repository root. `docs/SIMULATION.md` defines completion, arm occupancy, fleet policy, cutoffs and the distinction between heuristic placement failure and infeasibility.
