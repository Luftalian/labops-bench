import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {SchedulerSession} from '../../backend/scheduler/session.mjs';
import {SchedulerService} from '../../backend/scheduler/service.mjs';
import {schedulerFixture, defaultConfig, digest} from '../../backend/scheduler/tasks.mjs';
import {relocationPlan} from '../../backend/scheduler/motion.mjs';
import {validate} from '../../backend/scheduler/validate.mjs';
import {hash} from '../../backend/counts/tasks.mjs';
import {decisionEnvelope, runController} from '../../agent/scheduler-controller.mjs';
import {createLLMController} from '../../agent/llm-scheduler.mjs';

const clone = structuredClone;
function fixture({simple = false, arrivals = [0, 1800, 5000], cutoff} = {}) {
  const b = schedulerFixture();
  b.task.jobs = b.task.jobs.slice(0, arrivals.length).map((j, i) => {
    const source = simple ? b.task.jobs[0] : j;
    return {...clone(source), id: 'J' + i, arrival_s: arrivals[i], priority: 500,
      nodes: simple ? [{...clone(source.nodes[0]), parents: []}] : clone(source.nodes)};
  });
  if (cutoff) b.task.simulation_cutoff_s = cutoff;
  b.task.workload_hash = hash(b.task.jobs); return b;
}
function initial(s) {
  const o = s.snapshot(), envelope = decisionEnvelope(o);
  return {...envelope, type: 'initial_design', reason: 'Software test initial layout.',
    priorities: o.jobs.map(j => ({job_id: j.job_id, priority: 500})),
    initial_design: {...clone(s.bundle.request), submission_id: envelope.decision_id}};
}
function next(s, {shift = 0, priorities} = {}) {
  const o = s.snapshot(), layout = clone(o.layout);
  if (shift) for (const r of [...layout.devices, ...layout.robots]) r.x = Number((r.x + shift).toFixed(6));
  return {...decisionEnvelope(o), type: 'reschedule', reason: 'Software test scheduled decision.',
    priorities: o.jobs.map(j => ({job_id: j.job_id, priority: priorities?.[j.job_id] ?? j.current_priority})),
    reconfiguration: shift ? {mode: 'replace_layout', layout} : {mode: 'keep'}};
}
async function start(b = fixture(), config = {}) {
  const s = new SchedulerSession(b, {config: {...defaultConfig, ...config}});
  assert.equal((await s.submit(initial(s))).status, 200); return s;
}
async function finish(s) {
  for (let i = 0; s.phase !== 'done' && i < 100; i++) {
    if (!s.epochDecided && s.usedDecisions < s.config.max_decisions) assert.equal((await s.submit(next(s))).status, 200);
    await s.advance();
  }
  assert.equal(s.result().status, 'completed'); return s.result();
}

test('priorities change actual dispatch order while observations and receipts obey canonical schemas', async () => {
  const b = fixture({simple: true, arrivals: [0, 0]});
  const run = async high => {
    const s = new SchedulerSession(b), q = initial(s);
    q.priorities.forEach(p => p.priority = p.job_id === high ? 1000 : 0);
    const r = await s.submit(q); assert.equal(r.status, 200);
    assert.deepEqual(await validate(r.body, 'SchedulerReceipt'), []);
    await s.advance(); assert.deepEqual(await validate(s.snapshot(), 'SchedulerObservation'), []);
    return s;
  };
  const a = await run('J0'), bRun = await run('J1');
  assert.deepEqual(a.env.batches[0].job_ids, ['J0']); assert.deepEqual(bRun.env.batches[0].job_ids, ['J1']);
  assert.equal(a.result().metrics.makespan_s, Math.max(...a.env.jobs.map(j => j.completed_s)));
});
test('clock stops at exact epochs before new decisions and unfinished jobs keep null makespan', async () => {
  const s = await start();
  await s.advance(); assert.equal(s.env.time, 600); assert.equal(s.epoch, 1);
  assert.equal(s.result().metrics.makespan_s, null);
  const t = s.env.time; s.snapshot(); s.snapshot(); assert.equal(s.env.time, t);
  await assert.rejects(s.advance(), /decision/);
});
test('physical device and arm relocation charges real intervals, preserves identities and is applied before future work', async () => {
  const s = await start(fixture({simple: true})); await s.advance();
  const old = clone(s.env.layout), q = next(s, {shift: .2});
  const accepted = await s.submit(q); assert.equal(accepted.status, 200, JSON.stringify(accepted));
  assert.equal(accepted.body.status, 'accepted_pending'); assert.deepEqual(s.env.layout, old);
  const r = await finish(s);
  assert.equal(r.installed_resources.arms, old.robots.length);
  assert.deepEqual(Object.fromEntries(s.env.layout.devices.map(d => [d.id, d.model])), Object.fromEntries(old.devices.map(d => [d.id, d.model])));
  assert.ok(Math.abs(s.env.layout.robots[0].x - old.robots[0].x - .2) < 1e-7);
  const moves = s.env.trace.filter(e => e.kind === 'relocate'); assert.ok(moves.some(e => e.asset_kind === 'arm'));
  assert.ok(moves.some(e => e.asset_kind === 'device')); assert.ok(moves.every(e => e.end_s > e.start_s));
  assert.ok(s.receipts.some(r => r.decision_id === q.decision_id && r.code === 'relocation_applied'));
  const applied = s.receipts.find(r => r.code === 'relocation_applied').time_s;
  assert.ok(s.env.batches.filter(b => !b.job_ids.includes('J0')).every(b => b.start_s >= applied));
  assert.ok(r.metrics.makespan_s >= applied);
  for (const arm of s.env.layout.robots) {
    const intervals = s.env.trace.filter(e => e.resource === arm.id).sort((a, b) => a.start_s - b.start_s);
    for (let i = 1; i < intervals.length; i++) assert.ok(intervals[i-1].end_s <= intervals[i].start_s + 1e-7);
  }
});
test('busy reconfiguration drains committed jobs and AMR returns without erasing prior reservations', async () => {
  const s = await start(); await s.advance();
  assert.ok(s.env.jobs.some(j => j.admitted_s !== undefined && j.status !== 'done'));
  const prior = clone(s.env.trace), q = next(s, {shift: .2});
  assert.equal((await s.submit(q)).status, 200);
  await finish(s);
  assert.deepEqual(s.env.trace.slice(0, prior.length), prior);
  const startTime = Math.min(...s.env.trace.filter(e => e.kind === 'relocation_disconnect').map(e => e.start_s));
  assert.ok(startTime >= Math.max(...prior.map(e => e.end_s)) - 1e-7);
});
test('drain expires at its deadline and permits new work with the old layout', async () => {
  const s = await start(fixture(), {max_drain_s: 1}); await s.advance();
  const old = clone(s.env.layout); assert.equal((await s.submit(next(s, {shift: .2}))).status, 200);
  await s.advance(); assert.ok(s.receipts.some(r => r.code === 'drain_timeout' && r.time_s === 601));
  assert.deepEqual(s.env.layout, old); assert.equal(s.pending, null);
  await finish(s);
});
test('cutoff during physical relocation never teleports the layout or awards a completion score', async () => {
  const s = await start(fixture({simple: true, cutoff: 650})); await s.advance();
  const old = clone(s.env.layout); assert.equal((await s.submit(next(s, {shift: .2}))).status, 200);
  await s.advance(); assert.equal(s.env.time, 650); assert.equal(s.result().status, 'truncated');
  assert.equal(s.result().metrics.makespan_s, null); assert.deepEqual(s.env.layout, old);
});
test('invalid layout or model changes reject priorities atomically; stale/duplicate calls are counted consistently', async () => {
  const s = await start(); await s.advance(); const old = s.env.jobs.map(j => j.priority);
  const bad = next(s, {shift: .2, priorities: {J0: 0}}); bad.reconfiguration.layout.devices[0].x = 99;
  const rejected = await s.submit(bad); assert.equal(rejected.status, 422); assert.deepEqual(s.env.jobs.map(j => j.priority), old);
  const used = s.usedDecisions; assert.deepEqual(await s.submit(bad), rejected); assert.equal(s.usedDecisions, used);
  assert.equal((await s.submit({...bad, reason: 'conflicting payload'})).status, 409);
  const model = next(s, {shift: .2}); const [a, b] = model.reconfiguration.layout.devices;
  [a.model, b.model] = [b.model, a.model];
  assert.ok((await s.submit(model)).body.violations.some(v => v.code === 'model_changed'));
  const stale = next(s); stale.state_version--;
  assert.ok((await s.submit(stale)).body.violations.some(v => v.code === 'stale_state'));
});
test('a swept obstacle blocks a move even when both endpoints have valid geometry', async () => {
  const b = fixture({simple: true, arrivals: [0, 5000]});
  for (const id of Object.keys(b.request.equipment_counts)) b.request.equipment_counts[id] = id === 'flex_liquid_handler' ? 1 : 0;
  b.request.arm_count = 1;
  const s = await start(b), target = clone(s.env.layout);
  for (const r of [...target.devices, ...target.robots]) r.x += 3;
  const d = s.env.layout.devices[0];
  s.env.task.room.obstacles.push({x: d.x + 1.4, y: d.y - .1, w: .1, h: .2});
  const plan = relocationPlan(s.env, target, s.config, s.model);
  assert.ok(plan.errors.some(e => e.code === 'motion_obstacle'), JSON.stringify(plan.errors));
});
test('controller timeout freezes simulation, consumes its call and falls back without invoking a provider', async () => {
  const s = await start(fixture({simple: true}), {response_timeout_ms: 5, max_decisions: 3});
  await s.advance(); const at = s.env.time;
  const r = await runController(s, () => new Promise(() => {}));
  assert.equal(r.status, 'completed'); assert.equal(s.usedDecisions, 3);
  const failure = s.journal.find(e => e.kind === 'controller_failure'); assert.equal(failure.time_s, at);
  assert.equal(failure.reason, 'controller_timeout');
});
test('session restart preserves idempotent receipts, call budget, resource maps and exact continuation', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'labops-scheduler-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const service = new SchedulerService({directory}), b = service.definitions[0];
  const created = await service.create({task_id: b.task.task_id, task_version: b.task.version});
  assert.equal(created.status, 201); const id = created.body.session_id, s = service.sessions.get(id), q = initial(s);
  const response = await service.operate(id, 'decisions', q); assert.equal(response.status, 200);
  await service.operate(id, 'advance', {});
  const restarted = new SchedulerService({directory});
  assert.deepEqual(restarted.sessions.get(id).snapshot(), s.snapshot());
  assert.deepEqual(await restarted.operate(id, 'decisions', q), response);
  const a = await finish(s), bResult = await finish(restarted.sessions.get(id));
  assert.equal(digest(a.replay.trace), digest(bResult.replay.trace));
  assert.deepEqual(a.metrics, bResult.metrics);
});
test('completion exactly at cutoff is completed and a provider-neutral structured adapter sees only public state', async () => {
  const b = fixture({simple: true, arrivals: [0]}), s = await start(b);
  const r = await finish(s); b.task.simulation_cutoff_s = r.metrics.makespan_s;
  const exact = new SchedulerSession(b);
  const controller = createLLMController({generate: async ({system, observation, output_schema}) => {
    assert.match(system, /Module exchange is forbidden/); assert.equal(output_schema.$ref, '#/$defs/SchedulerDecision');
    assert.ok(!('env' in observation));
    return initial(exact);
  }});
  const completed = await runController(exact, controller);
  assert.equal(completed.status, 'completed'); assert.equal(completed.metrics.makespan_s, r.metrics.makespan_s);
  assert.deepEqual(await validate(completed, 'SchedulerResult'), []);
});
test('completed work cancels a now-unnecessary drain and invalid initial designs exhaust the budget without a score', async () => {
  const s = await start(fixture({arrivals:[0]})); await s.advance();
  assert.equal((await s.submit(next(s, {shift:.2}))).status,200);
  await finish(s); assert.ok(s.receipts.some(r => r.code === 'workload_completed'));
  assert.ok(!s.env.trace.some(e => e.kind === 'relocate'));
  const failed = new SchedulerSession(fixture(), {config:{...defaultConfig,max_decisions:1}}), q=initial(failed);
  q.initial_design.arm_count=0; assert.equal((await failed.submit(q)).status,422);
  assert.equal(failed.result().status,'error'); assert.equal(failed.result().metrics.makespan_s,null);
});
test('validation infrastructure failures retain diagnostics and same-ID retries spend no extra call', async () => {
  const s = new SchedulerSession(fixture({simple:true}), {config:{...defaultConfig,max_decisions:1}}), q=initial(s);
  s.validateDecision = async () => {throw new Error('Synthetic validator outage');};
  assert.equal((await s.submit(q)).status,500); assert.equal(s.usedDecisions,1);
  assert.ok(s.journal.some(e=>e.kind==='infrastructure_failure'));
  delete s.validateDecision;
  assert.equal((await s.submit(q)).status,200); assert.equal(s.usedDecisions,1);
  assert.equal((await finish(s)).status,'completed');
});
test('source drift blocks continuation while preserving the stored result for inspection', async t => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'labops-scheduler-source-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const service=new SchedulerService({directory}),b=service.definitions[0];
  const created=await service.create({task_id:b.task.task_id,task_version:b.task.version}),id=created.body.session_id;
  const s=service.sessions.get(id),before=clone(s.env.layout),q=initial(s);
  s.journal.find(e=>e.kind==='provenance').source_hashes['backend/scheduler/session.mjs']='changed-source';
  const response=await service.operate(id,'decisions',q);
  assert.equal(response.status,409);assert.match(response.body.error,/session_source_changed/);
  assert.deepEqual(s.env.layout,before);assert.equal((await service.read(id,'result')).body.status,'initial_design');
});
