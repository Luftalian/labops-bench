import {initialSampleTokens} from '../poc/sim/v4/initial-samples.mjs';
import {stagingErrors} from '../scheduler/staging.mjs';
import {HallEnvironment} from '../poc/sim/v4/environment.mjs';
import {chooseHallAction} from '../poc/sim/v4/agents.mjs';
import {catalog, validateLayout, matches} from '../poc/sim/v4/tasks.mjs';
import {planLayout} from '../poc/sim/v2/geometry.mjs';
import {createFleet} from '../poc/sim/v4/fleet.mjs';
import {MODEL_IDS, hash, nativeTask} from './tasks.mjs';

export class CountEnvironment extends HallEnvironment {
  apply(action) {
    if (['reconfigure', 'relocate'].includes(action?.type)) return this.reject('formal_configuration_is_fixed');
    return super.apply(action);
  }
}

export function requestViolations(task, request) {
  const errors = [];
  const add = (code, message) => errors.push({code, message});
  for (const id of MODEL_IDS) if (request.equipment_counts[id] > task.resource_limits.equipment[id]) add('COUNT_LIMIT', `${id} exceeds task limit`);
  if(task.policies.inventory==='fixed-owned-v1'&&MODEL_IDS.some(id=>request.equipment_counts[id]!==task.resource_limits.equipment[id]))add('OWNED_INVENTORY','This task fixes owned equipment counts, including outside storage.');
  if (request.arm_count > task.resource_limits.arms) add('ARM_LIMIT', 'Arm count exceeds task limit');
  if (request.amr_count > task.resource_limits.amrs) add('AMR_LIMIT', 'AMR count exceeds task limit');
  if (request.arm_count < 1) add('MISSING_ARM', 'At least one working arm is required');
  if (request.amr_count < 1) add('MISSING_AMR', 'At least one sample AMR is required');
  if (request.simulation_seed !== task.simulation_seed) add('SEED_MISMATCH', 'The workload seed is fixed by the task');
  for (const capability of new Set(task.jobs.flatMap(j => j.nodes.map(n => n.capability)))) {
    if (!MODEL_IDS.some(model => request.equipment_counts[model] > 0 && matches(capability, {model}))) add('MISSING_CAPABILITY', `No selected device supports ${capability}`);
  }
  if (request.layout) {
    for (const id of MODEL_IDS) if ([...request.layout.devices, ...(task.external_staging ? request.layout.parked_devices ?? [] : [])].filter(d => d.model === id).length !== request.equipment_counts[id]) add('LAYOUT_COUNT_MISMATCH', `Layout does not contain exactly the selected ${id} count`);
    if (request.layout.devices.some(d => !MODEL_IDS.includes(d.model))) add('UNKNOWN_MODEL', 'Layout uses a model outside the task catalog');
    if (request.layout.robots.length !== request.arm_count) add('LAYOUT_ARM_MISMATCH', 'Layout arm count differs from selected count');
  }
  return errors;
}

export function placeExact(task, request) {
  const native = nativeTask(task, request);
  const total = Object.values(request.equipment_counts).reduce((s, n) => s + n, 0);
  const planned = request.layout ? {layout: structuredClone(request.layout), attempts: 0}
    // PoC's parameter controls the number of generated arms, not a hard arm
    // capacity. The fractional target makes ceil(total/target) equal arms.
    : planLayout(native, catalog, task.simulation_seed,
                 {devicesPerArm: total / Math.max(.5, request.arm_count - .25)});
  const layout = planned.layout;
  const validation = validateLayout(layout, native, catalog);
  validation.errors.push(...stagingErrors(layout,native),...initialSampleTokens(layout,native,matches).errors); validation.valid = validation.errors.length === 0;
  if (layout.robots.length !== request.arm_count || MODEL_IDS.some(id => [...layout.devices, ...(task.external_staging ? layout.parked_devices ?? [] : [])].filter(d => d.model === id).length !== request.equipment_counts[id])) {
    validation.errors.push({code: 'exact_inventory_not_placed'}); validation.valid = false;
  }
  let fleet = [];
  if (validation.valid) try {fleet = createFleet(layout, native, catalog);}
  catch (error) {validation.errors.push({code: 'fleet_access', message: error.message}); validation.valid = false;}
  return {native, layout, validation, fleet, attempts: planned.attempts,
    infeasibility_proven: false, method: request.layout ? 'submitted-layout' : 'poc-exact-counts-v1'};
}

// DesignRequest shape is validated against the canonical schema by the service.
export async function evaluateCounts(bundle, request, {onProgress} = {}) {
  const {task} = bundle;
  const base = {schema_version: '0.2', submission_id: request.submission_id, task_id: task.task_id,
    task_version: task.version, result_origin: 'simulation', valid: false, status: 'invalid',
    violations: [], metrics: null, installed_resources: null, events: [], replay: null,
    task_hash: hash(task), workload_hash: task.workload_hash, failure: null};
  base.violations = requestViolations(task, request);
  if (base.violations.length) return base;
  const plan = placeExact(task, request);
  onProgress?.({phase: 'placement', valid: plan.validation.valid});
  if (!plan.validation.valid) {
    base.status = request.layout ? 'invalid' : 'layout_search_failed';
    base.violations = plan.validation.errors.map(e => ({code: e.code, message: JSON.stringify(e)}));
    base.failure = {method: plan.method, attempts: plan.attempts, infeasibility_proven: false,
      message: request.layout ? 'Submitted geometry failed validation' : 'This heuristic failed to place the exact inventory; no smaller inventory was substituted'};
    return base;
  }
  const env = new CountEnvironment(plan.native);
  for (const action of [{type: 'set_layout', layout: plan.layout}, {type: 'start'}]) {
    const receipt = env.apply({...action, state_version: env.version});
    if (!receipt.accepted) throw new Error('Validated configuration failed to start: ' + JSON.stringify(receipt));
  }
  let guard = 0;
  while (env.phase !== 'done') {
    const action = chooseHallAction(env.observe({clone: false}), 'fixed');
    const receipt = env.apply(action);
    if (!receipt.accepted) {env.finish('executor_action_rejected'); break;}
    if (++guard % 200 === 0) {
      onProgress?.({phase: 'execution', time_s: env.time});
      await new Promise(resolve => setImmediate(resolve));
    }
  }
  const replay = env.result();
  const complete = replay.terminal_reason === 'completed' && replay.jobs.every(j => j.status === 'done');
  const truncated = !complete && replay.terminal_reason === 'time_horizon';
  if (!complete && !truncated) {
    return {...base, status: 'error', violations: [{code: 'EXECUTION_INCOMPLETE', message: replay.terminal_reason}],
      failure: {method: 'poc-fixed-dispatch-v1', attempts: 1, infeasibility_proven: false, message: replay.terminal_reason}};
  }
  const elapsed = replay.metrics.elapsed_s;
  const arm_busy_s = Object.fromEntries(replay.layout.robots.map(arm => [arm.id,
    replay.trace.filter(e => e.resource === arm.id).reduce((s, e) => s + Math.max(0, Math.min(elapsed, e.end_s) - e.start_s), 0)]));
  // Native diagnostic throughput/cost are intentionally absent from the formal
  // score and replay metrics. The same native events drive both viewers.
  replay.metrics = {elapsed_s: elapsed, completed_jobs: replay.metrics.completed_jobs, total_jobs: task.jobs.length};
  if (replay.validation) delete replay.validation.installed_cost;
  replay.schema_version = 'labops.counts.replay.v0.2';
  replay.evidence.agent = 'Fixed PoC executor; no model call. Formal objective is full-workload makespan under room/count limits.';
  const result = {...base, valid: true, status: complete ? 'completed' : 'truncated',
    metrics: {total_jobs: task.jobs.length, completed_jobs: replay.metrics.completed_jobs,
      makespan_s: complete ? elapsed : null, elapsed_s: elapsed, arm_busy_s},
    installed_resources: {equipment_counts: {...request.equipment_counts}, arms: replay.layout.robots.length, amrs: replay.fleet.length},
    events: replay.trace, replay};
  return result;
}

export function rankCounts(results) {
  return results.filter(r => r.schema_version === '0.2' && r.valid && r.status === 'completed' &&
    r.result_origin === 'simulation' && r.metrics.completed_jobs === r.metrics.total_jobs &&
    Number.isFinite(r.metrics.makespan_s)).sort((a, b) => a.metrics.makespan_s - b.metrics.makespan_s);
}
