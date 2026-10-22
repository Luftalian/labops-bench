import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {createHall, catalog as nativeCatalog, capabilities} from '../poc/sim/v4/tasks.mjs';

const schema = JSON.parse(fs.readFileSync(new URL('../../contracts/labops.schema.json', import.meta.url)));
export const MODEL_IDS = Object.keys(schema.$defs.Counts.properties);
export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const publicCatalog = {
  catalog_id: 'poc-shared-hall', version: 'counts-1', track: 'synthetic',
  provenance: 'Imported PoC v4 model; dimensions, adapters and handling include declared assumptions. See backend/poc/IMPORT_MANIFEST.json.',
  placement_grid_m: nativeCatalog.placement_grid_m, route_grid_m: nativeCatalog.route_grid_m,
  robot: structuredClone(nativeCatalog.robot), carrier: structuredClone(nativeCatalog.carrier),
  equipment: Object.fromEntries(MODEL_IDS.map(id => {
    const {cost_units, ...model} = nativeCatalog.equipment[id];
    return [id, structuredClone(model)];
  }))
};

export function developmentFixture(width_m, depth_m) {
  const workload_parameters = {family: 'screening-mix', jobs: 6, seed: 17,
    arrival_interval_s: 0, benches: 7, furnaces: 0, ovens: 0, xrd: 0, amrs: 1, batch_slots: 1};
  const native = createHall(workload_parameters);
  const required = new Set(native.jobs.flatMap(j => j.nodes.map(n => capabilities.includes(n.capability) ? 'flex_' + n.capability : n.capability)));
  const equipment = Object.fromEntries(MODEL_IDS.map(id => [id, required.has(id) ? 2 : 0]));
  const workflow = {workflow_id: 'ambient-screening', version: 'poc-v4-counts-1', track: 'synthetic',
    description: 'Six pinned synthetic ambient screening jobs; no chemistry prediction or model result.'};
  const task = {schema_version: '0.2', task_id: `counts-room-${width_m}x${depth_m}-dev`, version: '1',
    catalog_id: publicCatalog.catalog_id, catalog_version: publicCatalog.version,
    workflow_id: workflow.workflow_id, workflow_version: workflow.version,
    room: {width_m, depth_m}, resource_limits: {equipment, arms: 8, amrs: 2},
    objective: 'minimize_makespan_s', simulation_seed: 17, simulation_cutoff_s: 7 * 86400,
    workload_parameters, jobs: native.jobs, workload_hash: hash(native.jobs),
    policies: {placement: 'poc-exact-counts-v1', execution: 'poc-fixed-dispatch-v1',
      transport: 'poc-closed-tours-v1', completion: 'final-arm-unload-v1'},
    provenance: 'Synthetic development fixture. Room and count limits are benchmark assumptions, not measured laboratory requirements.'};
  const request = {schema_version: '0.2', submission_id: 'development-smoke', task_id: task.task_id,
    task_version: task.version, equipment_counts: Object.fromEntries(MODEL_IDS.map(id => [id, Number(required.has(id))])),
    arm_count: 3, amr_count: 1, simulation_seed: task.simulation_seed};
  return {fixture_note: 'Software integration fixture only; no expected performance or global optimum claimed.',
    catalog: structuredClone(publicCatalog), workflow, task, request};
}

export function nativeTask(task, request) {
  const base = createHall(task.workload_parameters);
  const {capital_budget, ...native} = base;
  // No capital_budget field: the unchanged PoC geometry validator's optional
  // cost check is inactive. Costs never enter the count contract or ranking.
  native.room = {...task.room, obstacles: [], cutouts: []};
  native.intake = [.5, task.room.depth_m - .5];
  native.jobs = structuredClone(task.jobs);
  native.id = task.task_id; native.seed = task.simulation_seed;
  native.inventory = {...request.equipment_counts};
  native.initial_inventory = {...request.equipment_counts};
  native.required_capabilities = [];
  native.required_process_capabilities = [...new Set(task.jobs.flatMap(j => j.nodes.map(n => n.capability)))];
  native.robot_budget = request.arm_count;
  native.layout_limits = {max_devices: Object.values(request.equipment_counts).reduce((a,b) => a+b,0), max_robots: request.arm_count};
  native.external_staging = task.external_staging ? structuredClone(task.external_staging) : null;
  native.bench_budget = Object.entries(request.equipment_counts).filter(([id]) => id.startsWith('flex_')).reduce((s, [, n]) => s + n, 0);
  native.initial_modules = Object.fromEntries(capabilities.map(c => [c, request.equipment_counts['flex_' + c] ?? 0]));
  native.module_inventory = {...native.initial_modules};
  native.resource_count_semantics = 'exact';
  native.topology = {...native.topology, shared_sample_amrs: request.amr_count};
  if (task.policies.placement === 'public-cell-candidates-v1') native.topology.fleet_bay_spacing_m = 1.2;
  native.batch_slots = 1;
  native.horizon_s = task.simulation_cutoff_s;
  native.closed_tours = true;
  native.initial_sample_policy = task.initial_sample_policy ?? null;
  native.workload_hash = task.workload_hash;
  native.config_hash = hash({task, request: {...request, submission_id: undefined}});
  return native;
}
