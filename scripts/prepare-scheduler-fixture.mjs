// Synthetic communication examples only. No execution or model invocation.
import fs from 'node:fs';
import {developmentFixture, hash} from '../backend/counts/tasks.mjs';
import {placeExact} from '../backend/counts/evaluator.mjs';
import {catalog as nativeCatalog, validateLayout} from '../backend/poc/sim/v4/tasks.mjs';
import {createFleet} from '../backend/poc/sim/v4/fleet.mjs';
const bundle = developmentFixture(14, 10), {task, catalog} = bundle;
const plan = placeExact(task, bundle.request);
if (!plan.validation.valid) throw new Error('Fixture geometry failed');
const protocol = 'labops.scheduler.v0.2-draft';
const config = {protocol, decision_interval_s: 600, max_decisions: 64, response_timeout_ms: 30000,
  max_drain_s: 3600, visibility: 'full_remaining_workload', dispatch_policy: 'job-priority-nonpreemptive-v1',
  clock_policy: 'paused-during-decision', allow_device_relocation: true, allow_arm_relocation: true};
const context = {task_id: task.task_id, task_version: task.version, task_hash: hash(task),
  catalog_id: task.catalog_id, catalog_version: task.catalog_version, workload_hash: task.workload_hash,
  room: task.room, resource_limits: task.resource_limits, simulation_seed: task.simulation_seed,
  simulation_cutoff_s: task.simulation_cutoff_s, objective: task.objective,
  transition_models: []}; // Physical relocation duration/path models are not yet defined.
const jobs = task.jobs.map(j => ({job_id: j.id, arrival_s: j.arrival_s, due_s: j.due_s ?? null,
  status: 'queued', current_priority: 500, nodes: j.nodes.map(n => ({node_id: n.id, depends_on: n.parents,
    required_capability: n.capability, process_s: n.duration_s, remaining_process_s: n.duration_s,
    status: 'pending', assigned_device_id: null}))}));
const emptyCounts = Object.fromEntries(Object.keys(task.resource_limits.equipment).map(k => [k, 0]));
const initial_observation = {protocol, session_id: 'synthetic-scheduler-example', snapshot_id: 'example-initial',
  epoch_id: 0, state_version: 0, time_s: 0, phase: 'initial_design', config, context, catalog,
  decision_required: true, decisions_remaining: config.max_decisions,
  layout: {devices: [], robots: []}, installed_resources: {equipment_counts: emptyCounts, arms: 0, amrs: 0},
  jobs, completed_jobs: 0, total_jobs: jobs.length, resources: [], reservations: [],
  reconfiguration_state: {phase: 'idle', decision_id: null, deadline_s: null, target_layout: null}, recent_receipts: []};
const priorities = jobs.map((j, i) => ({job_id: j.job_id, priority: 500 - i * 10}));
const initial_decision = {protocol, session_id: initial_observation.session_id, snapshot_id: initial_observation.snapshot_id,
  epoch_id: 0, state_version: 0, decision_id: 'example-design', type: 'initial_design',
  reason: 'Synthetic protocol example: explicit seeded geometry and input-order priorities; no model inference.',
  priorities, initial_design: {...bundle.request, submission_id: 'example-design', layout: plan.layout}};
const periodic_observation = {...structuredClone(initial_observation), snapshot_id: 'example-periodic', epoch_id: 1,
  state_version: 7, time_s: 600, phase: 'reschedule', decisions_remaining: config.max_decisions - 1, layout: plan.layout,
  installed_resources: {equipment_counts: bundle.request.equipment_counts, arms: bundle.request.arm_count, amrs: bundle.request.amr_count},
  resources: [...plan.layout.devices.map(d => ({resource_id: d.id, kind: 'device'})),
    ...plan.layout.robots.map(r => ({resource_id: r.id, kind: 'arm'})), {resource_id: 'amr-1', kind: 'amr'}]
    .map(r => ({...r, state: 'idle', available_s: 600, committed_job_ids: [], capacity_slots: null,
      occupied_slots: null, future_reserved_slots: null}))};
periodic_observation.resources.push(...plan.layout.robots.map(r => ({resource_id: r.id + '-buffer', kind: 'buffer',
  state: 'idle', available_s: 600, committed_job_ids: [], capacity_slots: plan.native.buffer_slots,
  occupied_slots: 0, future_reserved_slots: 0})));
const periodic_decision = {protocol, session_id: periodic_observation.session_id, snapshot_id: periodic_observation.snapshot_id,
  epoch_id: 1, state_version: 7, decision_id: 'example-priority-update', type: 'reschedule',
  reason: 'Synthetic protocol example: reverse priorities and retain equipment layout.',
  priorities: [...priorities].reverse().map((p, i) => ({...p, priority: 500 - i * 10})), reconfiguration: {mode: 'keep'}};
const relocated = structuredClone(plan.layout);
for (const resource of [...relocated.devices, ...relocated.robots]) resource.x += .2;
if (!validateLayout(relocated, plan.native, nativeCatalog).valid) throw new Error('Relocation target geometry failed');
createFleet(relocated, plan.native, nativeCatalog);
const relocation_decision = {...structuredClone(periodic_decision), decision_id: 'example-physical-relocation',
  reason: 'Synthetic target: move the same devices and arms by 0.2 m; no module changes. Endpoint geometry only, no path/time execution.',
  reconfiguration: {mode: 'replace_layout', layout: relocated}};
const receipt = {protocol, session_id: periodic_observation.session_id, decision_id: periodic_decision.decision_id,
  decision_hash: hash(canonical(periodic_decision)), epoch_id: 1, state_version: 8, time_s: 600, status: 'applied',
  priority_status: 'applied', layout_status: 'kept', applied_time_s: 600, code: 'synthetic_example_only', violations: []};
const fixture = {fixture_note: 'Synthetic communication examples, not executed observations, engine receipts, model output or benchmark results. All jobs are deliberately unstarted at t=600. Config numbers are illustrative assumptions, not adopted evaluation settings.',
  source: 'Development task plus deterministic geometry only; generated by scripts/prepare-scheduler-fixture.mjs.',
  initial_observation, initial_decision, periodic_observation, periodic_decision, relocation_decision, receipt};
const file = new URL('../fixtures/scheduler/exchange.json', import.meta.url);
fs.mkdirSync(new URL('.', file), {recursive: true});
fs.writeFileSync(file, JSON.stringify(fixture, null, 2) + '\n');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
