# One shared hall, many concurrent experimental lines

Scale update: [large-hall tests](large-hall.md) adds limits of 128 modular benches, 64 furnaces and 32 XRD stations, plus recorded 30 × 30 m / 50-furnace and 100-process cases. Earlier numerical validation below describes its original configuration.

The adopted benchmark models **one large bounded room**, not multiple independent
SDLs. A line is a logical experimental workflow. Powder preparation, wet chemistry
and analysis share the same machines, robot arms, finite buffers, sample AMR fleet,
commissioning cart and event clock. Each operation can use a compatible shared
station; a workflow does not own a private copy of the lab.

The manager must match configuration and concurrency to visible demand. For example,
while powder batches ramp, dwell and cool in fixed furnaces, an idle preparation
bench can exchange its grinding module for a stirrer, so wet experiments proceed
in parallel. Exchange is an explicit action with finite module stock and charged
removal, installation and calibration time. Other stations keep operating.

## Current implementation

- One floor with configurable dimensions, heterogeneous fixed furnaces, oven and
  XRD, and 7–32 modular benches. Directional input/output ports, robot reach, body,
  service/buffer clearance and footprint-aware sample routes use the existing
  geometric validator across the **entire shared layout**.
- Arbitrary initial grid poses and robot assignments through `set_layout`. The
  reference builds a feasible global layout, not independent cell templates.
  All workflows can cross between compatible stations in that room.
- Per-operation routes and per-arm future-output buffer credits at admission.
  This safely admits more work as useful shared capacity grows, replacing the
  earlier global seven-job bound. Pending route commitments prevent a manager
  from removing a module needed by admitted work.
- One shared sample AMR fleet, exclusive arm calendars, compatible cold-loaded batches,
  cleaning, full ramp/dwell/cool and output handling. Shared resource contention
  remains part of makespan; there is no AMR replicated per logical line.
- Module inventory and one shared commissioning cart. A change reserves cart and
  robot time, blocks that station, returns the old module only when the exchange
  ends, and leaves ongoing furnace/other-station processes intact.
- Thermal/source task families: demand shift, steady concurrent mix, thermal overlap and a
  declared subset of pinned LeMat procedures. Extracted source dwell is unchanged.
  Synthetic workflows/arrival patterns are explicitly benchmark fixtures.
- Fixed-configuration and demand-aware reference managers use the same workload,
  initial layout and module inventory. Recorded comparisons report completion,
  makespan, throughput per floor area, process parallelism and setup overhead.
- English single-room 2D/3D viewer, live station capability and job/line labels,
  module store, actual configuration events, shared-transport playback and an
  end report with concurrency chart, resource Gantt and JSON/CSV export. `Equipment labels` toggles instrument name/status overlays in both views; the preference survives view switches and reloads. Station details remain available by selecting a machine.

## Run and reproduce

```sh
npm ci
npm start
# http://127.0.0.1:4173/
npm run check:v4
npm run check:v4:api # server running
node scripts/run-hall.mjs '{"jobs":180,"seed":17}' fixed
node scripts/run-hall.mjs '{"jobs":180,"seed":17}' adaptive
node scripts/benchmark-v4.mjs
```

`World settings` changes **the same room's** dimensions, bench/furnace/XRD counts,
AMR count, workload size, batch/buffer limits and module-exchange duration. The room can be up to 60 × 40 m, with up to 32 modular benches, 16 furnaces and 12 XRD stations (61 instruments plus 31 arms). These are individual parameter ceilings, not a promise that every combination fits. Larger task sets
are supported up to 2,000 jobs; actual tested scales are in the saved evaluation.
Geometry search failures are retained and do not prove infeasibility.

Each run under `results/v4/` preserves full gzip trace, initial/configuration history,
job routes, source programs, module events, configuration/data/code hashes, exact
argument vector and metrics. `latest-evaluation.json` contains matched conditions;
`demo.json` selects the recorded default replay after source-hash verification.
Older v2/v3 raw outputs are unchanged and do not count as shared-room evaluations.

## Agent interface

The protocol is `labops.hall.v4`:

```text
POST /api/v4/sessions {"parameters":{"jobs":180}}
GET  /api/v4/sessions/:id/observation
POST /api/v4/sessions/:id/actions
GET  /api/v4/sessions/:id/result   # terminal only
```

Every action includes `state_version`. Invalid attempts consume a version and
return feedback. Actions are `validate_layout`, `set_layout`, `start`, `admit`,
`dispatch`, `reconfigure`, `wait`, `stop`. An admission supplies `job_id` and a
complete `routes` object mapping operation IDs to shared station IDs. An operation
must follow its admitted route. Reconfiguration changes an idle modular station's
capability; active or future committed work on that station prevents removal.

```json
{
  "type": "reconfigure",
  "state_version": 42,
  "device_id": "flex_grinder-2",
  "capability": "stirrer",
  "reason": "Powder preparation finished while wet-processing demand is growing"
}
```

Only arrived jobs may be admitted. Observations omit the full evaluator workload
and limit future jobs to one hour of visibility. Asynchronous worker runs are at
`POST /api/v4/runs` (`parameters`, `policy`), polled via `GET /api/v4/runs/:id`, with
terminal trace at `GET /api/v4/runs/:id/result`. At most two workers run concurrently.
This is a trusted loopback development server, not a hosted multi-user service.

The current managers are deterministic references. The old campus's actual LLM
calls do **not** evaluate this new task. An LLM/external agent can use the new
observation/action protocol; no LLM result is implied until it is actually run.

## Evidence boundaries and next work

Module exchange currently uses a **hypothetical common docking envelope**. It is
not a claim that commercial grinders, presses and liquid handlers are already
interchangeable. Footprints, adapters, stored module packing, utility connections,
cleaning and calibration are explicit engineering assumptions; source process
defaults remain distinct. Fixed instruments retain their different footprints.

The adaptive reference exchanges modules while keeping bench poses. Initial
layout/packing is variable, but online relocation of entire benches is disabled in
this protocol. Safe online deployment/stowing/movement needs swept-volume routing,
parked-arm states and updated buffer commitments before it should be claimed.
The commissioning cart is modeled as a capacity/time resource; collision-resolved
cart travel is not modeled. Multiple AMRs use distinct validated perimeter parking bays and closed tours. Swept grid cells reserve time intervals for empty travel, pickup waits, loaded travel, destination handoff and return; conflicting reservations delay departure. Other vehicles avoid occupied parking bays. This conservative traffic abstraction permits concurrent transport and charges return travel. Single-AMR runs preserve the earlier open-tour policy, so comparisons across one and multiple vehicles also change that policy. Vehicle dynamics, utilities, contamination, chemical success and joint-space manipulation are not certified. Actual xArm meshes are reused for viewing;
new shared-hall layouts do not inherit an old layout's motion-audit certificate.

Parallel process metrics use actual station process windows, including thermal
ramp/dwell/cool, rather than count queued reservations as simultaneous chemistry.
Module changes during other processing are counted at the **actual setup start**.
Station setup downtime includes any wait between accepting a change and beginning
commissioning; cart/arm reservation time records the actual commissioning window.
Improvement over fixed configuration is measured per matched case, not assumed.

Fleet and larger-hall validation: [implementation and evidence](fleet-and-scale.md). Earlier 27-condition results retain their original one-AMR contract and source hashes.

The default replay now uses mixed ambient screening. Three synthetic nonthermal workload families and descriptive resource-load diagnostics were added to expose scheduling, transport and reconfiguration effects; see [workload revision and evidence](ambient-screening.md). Original source and thermal programs are preserved.
