import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {evaluateCounts, placeExact, rankCounts, CountEnvironment} from '../../backend/counts/evaluator.mjs';
import {nativeTask, developmentFixture, hash} from '../../backend/counts/tasks.mjs';
import {catalog, validateLayout} from '../../backend/poc/sim/v4/tasks.mjs';
import {CountEvaluationService} from '../../backend/counts/service.mjs';
import {ROOT} from '../../backend/stage1/service.mjs';

const bundle = JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures/counts/room-14x10.json')));
let completed;
const result = async () => completed ??= await evaluateCounts(bundle, bundle.request);

test('count objective runs the shared PoC engine with exact devices, actual arms and closed AMR tours', async () => {
  const r = await result();
  assert.equal(r.status, 'completed'); assert.equal(r.metrics.completed_jobs, bundle.task.jobs.length);
  assert.deepEqual(r.installed_resources.equipment_counts, bundle.request.equipment_counts);
  assert.equal(r.installed_resources.arms, bundle.request.arm_count); assert.equal(r.installed_resources.amrs, 1);
  assert.equal(r.replay.configuration.closed_tours, true);
  assert.ok(r.events.some(e => e.resource.startsWith('arm-') && e.kind === 'load'));
  assert.ok(r.events.some(e => e.resource.startsWith('arm-') && e.kind === 'unload'));
  assert.ok(r.events.filter(e => e.resource.startsWith('amr-')).every(e => e.return_path?.length && e.return_start_s < e.end_s));
  assert.ok(r.metrics.makespan_s > 0);
  assert.equal(r.metrics.makespan_s, Math.max(...r.replay.jobs.map(j => j.completed_s)));
  assert.equal(r.metrics.makespan_s, Math.max(...r.events.filter(e => e.kind === 'unload').map(e => e.end_s)));
  assert.ok(!('equipment_cost_credits' in r.metrics)); assert.ok(!('throughput_jobs_per_hour' in r.metrics));
});
test('arms are exclusive resources with positive handling time, not decorative meshes', async () => {
  const r = await result();
  for (const arm of r.replay.layout.robots) {
    const intervals = r.events.filter(e => e.resource === arm.id).sort((a, b) => a.start_s - b.start_s);
    assert.ok(intervals.length); assert.ok(r.metrics.arm_busy_s[arm.id] > 0);
    for (let i = 1; i < intervals.length; i++) assert.ok(intervals[i - 1].end_s <= intervals[i].start_s + 1e-7);
  }
  for (const batch of r.replay.batches) {
    assert.ok(r.events.some(e => e.kind === 'load' && e.device_id === batch.device_id && e.end_s <= batch.process_start_s + 1e-7));
    assert.ok(r.events.some(e => e.kind === 'unload' && e.device_id === batch.device_id && e.start_s >= batch.process_end_s - 1e-7));
  }
});
test('device, arm and AMR ceilings and missing arms invalidate before simulation', async () => {
  for (const [request, code] of [
    [{...bundle.request, arm_count: 9}, 'ARM_LIMIT'], [{...bundle.request, amr_count: 3}, 'AMR_LIMIT'],
    [{...bundle.request, arm_count: 0}, 'MISSING_ARM'], [{...bundle.request, amr_count: 0}, 'MISSING_AMR'],
    [{...bundle.request, equipment_counts: {...bundle.request.equipment_counts, flex_stirrer: 3}}, 'COUNT_LIMIT'],
    [{...bundle.request, simulation_seed: 18}, 'SEED_MISMATCH']]) {
    const r = await evaluateCounts(bundle, request);
    assert.equal(r.status, 'invalid'); assert.equal(r.metrics, null); assert.deepEqual(r.events, []);
    assert.ok(r.violations.some(v => v.code === code));
  }
});
test('room variants keep identical work and limits; the same large-room layout can fail the smaller room', async () => {
  const small = developmentFixture(8, 7), r = await result();
  assert.equal(placeExact(small.task, small.request).validation.valid, true);
  assert.equal(small.task.workload_hash, bundle.task.workload_hash);
  assert.deepEqual(small.task.jobs, bundle.task.jobs); assert.deepEqual(small.task.resource_limits, bundle.task.resource_limits);
  const q = {...small.request, layout: structuredClone(r.replay.layout)};
  const invalid = await evaluateCounts(small, q);
  assert.equal(invalid.status, 'invalid'); assert.equal(invalid.metrics, null);
  assert.ok(invalid.violations.some(v => ['outside_floor', 'robot_outside_floor', 'buffer_outside_floor'].includes(v.code)));
});
test('placement failure never substitutes a smaller inventory or claims mathematical infeasibility', async () => {
  const tiny = structuredClone(bundle); tiny.task.room = {width_m: 2, depth_m: 2};
  const r = await evaluateCounts(tiny, tiny.request);
  assert.equal(r.status, 'layout_search_failed'); assert.equal(r.metrics, null);
  assert.equal(r.failure.infeasibility_proven, false); assert.equal(r.replay, null);
});
test('explicit initial geometry respects exact arm counts and replays deterministically', async () => {
  const first = await result(), request = {...bundle.request, layout: structuredClone(first.replay.layout)};
  const again = await evaluateCounts(bundle, request);
  assert.deepEqual(again.events, first.events); assert.deepEqual(again.metrics, first.metrics);
  request.layout.robots.pop();
  const invalid = await evaluateCounts(bundle, request);
  assert.equal(invalid.status, 'invalid'); assert.ok(invalid.violations.some(v => v.code === 'LAYOUT_ARM_MISMATCH'));
});
test('cutoff censors makespan and cannot reward partial completion as a fast score', async () => {
  const b = structuredClone(bundle); b.task.simulation_cutoff_s = 30;
  const r = await evaluateCounts(b, b.request);
  assert.equal(r.status, 'truncated'); assert.equal(r.valid, true); assert.equal(r.metrics.makespan_s, null);
  assert.ok(r.metrics.completed_jobs < r.metrics.total_jobs); assert.equal(r.metrics.elapsed_s, 30);
  assert.deepEqual(rankCounts([r]), []);
});
test('only completed makespan ranks; equal times tie irrespective of resource count or diagnostic prices', async () => {
  const r = await result();
  const expensive = {...structuredClone(r), submission_id: 'first-tied', diagnostic_cost: 100000};
  const cheap = {...structuredClone(r), submission_id: 'second-tied', diagnostic_cost: 0};
  const slow = {...structuredClone(r), metrics: {...r.metrics, makespan_s: r.metrics.makespan_s + 1}};
  assert.deepEqual(rankCounts([expensive, slow, cheap]).map(x => x.submission_id), ['first-tied', 'second-tied', slow.submission_id]);
});
test('native geometry has no equipment-budget constraint and formal execution blocks reconfiguration', async () => {
  const r = await result(), native = nativeTask(bundle.task, bundle.request);
  assert.ok(!('capital_budget' in native));
  const original = catalog.equipment.flex_stirrer.cost_units;
  try {catalog.equipment.flex_stirrer.cost_units = 1e30; assert.equal(validateLayout(r.replay.layout, native, catalog).valid, true);}
  finally {catalog.equipment.flex_stirrer.cost_units = original;}
  const env = new CountEnvironment(native);
  assert.equal(env.apply({type: 'reconfigure', state_version: 0}).code, 'formal_configuration_is_fixed');
});
test('two AMRs use the same closed-tour policy and exact requested fleet size', async () => {
  const r = await evaluateCounts(bundle, {...bundle.request, amr_count: 2});
  assert.equal(r.status, 'completed'); assert.equal(r.installed_resources.amrs, 2); assert.equal(r.replay.fleet.length, 2);
  assert.ok(r.events.filter(e => e.resource.startsWith('amr-')).every(e => e.return_path?.length));
});
test('new API service validates the canonical schema, persists room/count provenance and keeps retry accounting', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'labops-counts-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const service = new CountEvaluationService({directory, callLimit: 2});
  const {body: run, status} = service.create({task_id: bundle.task.task_id, task_version: bundle.task.version});
  assert.equal(status, 201); assert.equal(run.objective, 'minimize_makespan_s');
  assert.deepEqual(run.resource_limits, bundle.task.resource_limits); assert.ok(!('equipment_budget_credits' in run));
  assert.ok(!('horizon_s' in run));
  const response = await service.evaluate(run.run_id, bundle.request);
  assert.equal(response.status, 200); assert.equal(response.body.status, 'completed');
  assert.deepEqual(await service.evaluate(run.run_id, bundle.request), response);
  const malformed = await service.evaluate(run.run_id, {...bundle.request, submission_id: 'bad', equipment_budget_credits: 999});
  assert.equal(malformed.status, 422);
  assert.equal((await service.evaluate(run.run_id, {...bundle.request, submission_id: 'full'})).status, 429);
  const restarted = new CountEvaluationService({directory});
  assert.equal(restarted.runs.get(run.run_id).used_calls, 2);
  assert.deepEqual(await restarted.evaluate(run.run_id, bundle.request), response);
});
