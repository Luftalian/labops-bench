# Agent interface and evaluation procedure

The shared boundary is SchedulerObservation → SchedulerDecision → SchedulerReceipt. Types are defined in contracts/labops.schema.json under labops.scheduler.v0.2-draft. The runtime is backend/scheduler/session.mjs; HTTP endpoints are documented in [the runtime README](../backend/scheduler/README.md).

## Observation, decision and time

1. At t=0, the host exposes an initial_design observation containing the task, limits, catalog and full remaining workload.
2. The policy chooses an initial design and an integer priority for every unfinished job.
3. The engine validates and installs the design, applies priorities and executes until the next decision boundary or termination.
4. At a reschedule observation, the policy updates priorities and keeps or proposes an allowed replacement layout.
5. The host applies the accepted decision and advances to the next boundary.

The published suite uses 1,800 simulation-second intervals, 32 decisions and a 300 wall-second response timeout. The development runtime default of 600 seconds is a different configuration. Simulation time freezes during policy inference. A boundary processes same-time completions and arrivals before presenting the observation and before new dispatch.

Observations identify session, epoch, state version and snapshot. They contain room/resource limits, catalog, seed, processing assumptions, layout, resource occupancy and reservations, remaining job DAGs and known future arrivals. The full_remaining_workload condition is shared by all compared methods.

Priorities cover exactly the observed unfinished jobs, with integers from 0 to 1000; higher values rank first. Arrivals and dependencies still constrain readiness. Existing operations/reservations are nonpreemptive. Short public rationales are unverified policy output; scoring uses engine events.

## Configuration actions

The published comparison presents a shared candidate menu. Initial choices select equipment/layout; periodic choices keep the layout or perform task-authorized equipment exchanges. The four additional challenges use the declared dense-layout and fixed-owned-inventory tracks.

The canonical interface also accepts explicit initial geometry and complete replacement layouts. Evaluations using a larger action space or internal simulator rollouts must declare a separate track and budget.

Replacement layouts preserve instrument/arm IDs, device models and owned counts. External staging is available only when the task declares it; installed_resources reports owned counts in that mode, while layout.devices describes current indoor equipment. Module changes belong to the separate historical PoC mode.

## Engine validation and movement

Validation checks shape, session/snapshot/version, job set, counts/IDs, geometry, capabilities and available relocation models before applying changes. Same-ID/same-content retries are idempotent; conflicting content and stale snapshots are rejected. New invalid proposals and controller timeouts consume decision budget. After budget exhaustion, the engine continues with the last valid configuration/priorities; no valid initial design means no finite score.

A replacement can be accepted_pending. The engine stops new admissions, drains admitted jobs and all reservations, then charges disconnection, physical movement, reconnection and calibration. It applies the complete target layout after the transition. Expired draining retains the old layout. Completion during draining cancels an unnecessary move.

The movement model uses conservative swept envelopes with synthetic parameters in backend/scheduler/data/relocation.json. External exchanges check room capacity, the gate corridor and fleet access; detailed outdoor handling is abstracted. These are simulation assumptions.

## Connect an algorithm

Create a module in the repository root, for example my-policy.mjs:

```js
import {runSuite} from './scripts/run-lemat-sdl.mjs';
import {policyController} from './agent/policy-runtime.mjs';

const controller = policyController(async problem => {
  const jobs = problem.observation.jobs;
  return {
    layout_choice: problem.candidates[0].id,
    priorities: jobs.map(job => ({job_id: job.job_id, priority: 500})),
    reason: 'First candidate with equal priorities.'
  };
});
await runSuite({method: 'my-policy', controller, ids: ['01-single-device']});
```

Run node my-policy.mjs. Replace the example choice/ranking with your algorithm. This is a minimal interface example, not an effective baseline. runSuite writes task, source snapshot, results, journals and policy inputs/answers under results/lemat-sdl/.

The adapter also accepts a complete canonical decision. The host and engine remain responsible for validation, time and scores.

## Connect a model

- A provider can implement the same policy function or use createLLMController({generate}) from agent/llm-scheduler.mjs. Record the exact model, prompt, settings, usage and failures.
- The pinned Jev runner is node scripts/run-lemat-model.mjs jev. It requires JEV_API_KEY or LABOPS_JEV_ENV_FILE and retains a cumulative ledger with a hard USD 3 cap. Verify provider availability and billing before a fresh run.
- The Luna runner uses a file inbox. Set LABOPS_LUNA_INBOX to a fresh directory and run node scripts/run-lemat-model.mjs luna. A separately running contestant must read pending.json and its request_file, generate a new answer and write answer_file. The runner does not launch Codex automatically. The published contestant used gpt-6-luna with medium reasoning.

All model policies receive the same public problem/candidates; development skills and other methods' results are outside contestant context.

## Inspect and reproduce

Read each run's result.json and journal.jsonl, including rejected decisions and incomplete status. Use node scripts/verify-lemat-replay.mjs results/lemat-sdl/<run-directory> for a local run with its full source snapshot. The distributed 50 selected recordings are verified independently by python3 docs/submission-2026/verify_evidence.py.

Fresh inference may produce different decisions. Single-run results do not establish general superiority. Compare identical versions, candidate spaces, budgets and seeds, and retain failures.
