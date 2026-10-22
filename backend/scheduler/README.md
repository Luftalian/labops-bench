# Job scheduler runtime

`/scheduler/` is the local development UI. Select a task, create a session, choose initial counts, then **Apply decision & advance one epoch**. Edit remaining-job priority fields or use **Fill rule priorities**. At later epochs choose **Keep layout** or a physical translation, or edit the full target layout in the JSON editor. Receipt and engine activity panels show actual decisions, admission/dispatch and relocation states. The 2D replay uses recorded intervals and layout history; scores remain server-owned. JSON export includes the result and decision journal.

This is a software development mode with its own task IDs and execution policy. The six synthetic jobs arrive 900 simulation seconds apart so that future work can use a rearranged lab. It is not a comparison against the fixed `/v2/` task. No model or optimality result is implied.

## Local API

All payload types live in the canonical `contracts/labops.schema.json`. Errors retain the previous valid priorities/layout. These local endpoints are for a trusted development host, with the same access model as the existing local evaluators.

| Method / path | Body / response |
|---|---|
| GET `/scheduler/api/tasks` | Public bundles and scheduler config |
| POST `/scheduler/api/sessions` | SchedulerSessionRequest: task_id, task_version, optional complete SchedulerConfig; returns initial SchedulerObservation |
| GET `/scheduler/api/sessions/:id/observation` | SchedulerObservation; reads wait for in-flight mutations |
| POST `/scheduler/api/sessions/:id/decisions` | SchedulerDecision -> SchedulerReceipt; invalid shape/semantics 422, conflicting ID 409, call cap 429 |
| POST `/scheduler/api/sessions/:id/advance` | Empty object, host only; advances to next exact epoch or earlier completion/cutoff |
| GET `/scheduler/api/sessions/:id/result` | SchedulerResult with actual replay/events/history |
| GET `/scheduler/api/sessions/:id/journal` | Full public observations, submissions, receipts and provenance |

An accepted decision freezes the priority/layout choice for that epoch. `decision_required=false` means advance with the already accepted decision or the call-cap fallback. `decisions_remaining` counts initial submissions, malformed decisions, rejected decisions and controller timeouts. Same-ID/same-content retries return the original receipt without charging another call; status updates appear separately in recent receipts. Incomplete runs have null makespan. Completion exactly at cutoff is completed if the final unload has finished.

State, source hashes, result and an append-only logical JSONL journal persist under `results/local/scheduler-v0.2/<session_id>/`. State and files are published atomically; restart restores Maps, reservations, ID cache, call accounting and pending movement. Private V8 state is host-only and never exposed as a public file route. The public journal can be reconstructed from committed state after a stopped write.

Sessions pin the source hashes loaded by the server. After an implementation change, historical results remain readable but execution requires a new session; a running server whose files changed must restart before creating sessions. Validation infrastructure failures retain their submitted ID and diagnostics; same-ID retries do not spend another call.

## Controller injection

`agent/llm-scheduler.mjs` exports `createLLMController({generate})`. `generate` receives `{system, observation, output_schema, signal}` and must return a complete structured SchedulerDecision. The instructions and schema come from the public contract, not development AGENTS/skills. It does not implicitly read keys, select a model or make network calls.

`agent/scheduler-controller.mjs` exports `runController(session, controller, {onEpoch, signal})`. It invokes the injected controller only at decision boundaries, enforces response timeouts, freezes simulation time during inference, logs host duration, and falls back to the last accepted priorities/layout after running-time timeout or call exhaustion. With no valid initial design, exhausted attempts terminate without a score. A host using SchedulerService should save on each epoch and after completion. Model/provider/prompt/token/spending metadata must be recorded by a real provider integration before any comparison; no live provider has been configured or invoked.

## Physical movement model

`data/relocation.json` is an explicit **synthetic assumption**, not measured laboratory data. Translation speed is 0.1 m/s and rotation speed 15 deg/s. Device disconnection/reconnection/calibration each take 60 s; arm stages each take 120 s. These are adjustable host parameters with provenance, not established task optima.

One exclusive relocation team controls a coordinated group. Group stage durations sum the corresponding durations for changed assets; translations/rotations progress in lockstep over the summed movement stage, conservatively slowing each asset. Device and arm IDs/counts and device models remain fixed. Fixed instruments cannot move. Only physical pose/port assignment may change; modules cannot be exchanged.

New admission pauses, admitted jobs drain on the old routes, and all sample tokens and future reservations including AMR returns must clear. The target endpoint must pass PoC geometry and existing-AMR-bay route checks. The entire straight-line planar sweep is bounded by interval AABBs with a rotation arc-length margin, checked against other assets, floor/cutouts, obstacles and parked AMRs. This is conservative and may reject feasible curved/staged movements. It is not an articulated-robot, moving-utility-cable or real-world safety certificate.

The engine reserves disconnection, movement, reconnection and calibration intervals and applies the target layout only after the final stage. AMR homes remain unchanged; transport caches/calendars are rebuilt at the quiet switch. Replay interpolates only the recorded movement interval, then holds the new physical pose during reconnection/calibration. Timeout while draining keeps the old layout. Completion while draining cancels an unnecessary move. Cutoff during a move retains a partial trace and no finite score. Old fixed 0.2 and archived PoC recordings retain their original semantics.

## Validation

`npm run check` covers canonical/legacy contracts, Python boundary checks and Node behavioral/integration tests. `LABOPS_URL=http://127.0.0.1:4180 node scripts/smoke-scheduler.mjs` exercises the real HTTP API with deterministic manual decisions, including an actual physical arm/device move, retry identity and completion. These smokes are software validation only. The separately authorized LeMat suite runs fresh Luna/Jev inference through the bounded CLI provider adapters; see `docs/LEMAT_SDL_BENCHMARK.md`.
