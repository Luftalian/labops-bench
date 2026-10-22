import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ROOT} from '../backend/stage1/service.mjs';
const base = process.env.LABOPS_URL ?? 'http://127.0.0.1:4173';
async function request(p, body, headers = {}) {
  const response = await fetch(base + p, body === undefined ? undefined : {method: 'POST', headers: {'Content-Type': 'application/json', ...headers}, body: JSON.stringify(body)});
  return {status: response.status, body: await response.json()};
}
let tasks;
for (let i = 0; i < 50; i++) try {tasks = await request('/v2/tasks'); break;}
catch (error) {if (i === 49) throw error; await new Promise(resolve => setTimeout(resolve, 100));}
assert.equal(tasks.status, 200);
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures/counts/room-14x10.json')));
const standardTasks = tasks.body.filter(b => ['counts-room-14x10-dev', 'counts-room-8x7-dev'].includes(b.task.task_id));
assert.equal(standardTasks.length, 2);
assert.ok(tasks.body.every(b => b.task.objective === 'minimize_makespan_s' && !('equipment_budget_credits' in b.task)));
assert.equal(standardTasks[0].task.workload_hash, standardTasks[1].task.workload_hash);
const run = await request('/v2/runs', {task_id: fixture.task.task_id, task_version: fixture.task.version});
assert.equal(run.status, 201); assert.equal(run.body.engine, 'poc-shared-hall-v4/count-policy-1');
const headers = {'X-LabOps-Run-Id': run.body.run_id};
const r = await request('/v2/evaluations', fixture.request, headers);
assert.equal(r.status, 200); assert.equal(r.body.schema_version, '0.2'); assert.equal(r.body.status, 'completed');
assert.equal(r.body.installed_resources.arms, fixture.request.arm_count);
assert.ok(r.body.events.some(e => e.resource.startsWith('arm-') && e.kind === 'load'));
assert.deepEqual(await request('/v2/evaluations', fixture.request, headers), r);
const invalid = await request('/v2/evaluations', {...fixture.request, submission_id: 'zero-arms', arm_count: 0}, headers);
assert.equal(invalid.body.status, 'invalid'); assert.equal(invalid.body.metrics, null);
assert.equal((await request('/v2/runs/' + run.body.run_id)).body.used_calls, 2);
const html = await (await fetch(base + '/')).text();
assert.ok(html.includes('/counts.mjs') && html.includes('COMPLETION TIME'));
assert.ok(!/Equipment budget|COMPLETE AT H|USED CREDITS/.test(html));
for (const p of ['/counts.mjs', '/v2/catalog', '/legacy/', '/poc/', '/workshop/three-view.mjs', '/workshop/assets/xarm/link1.stl']) assert.equal((await fetch(base + p)).status, 200, p);
const proof = {status: 'passed', contract_version: '0.2', base,
  scope: 'Software integration fixture only; no model or method-comparison benchmark executed.',
  checks: ['room/count task context', 'same workload across room sizes', 'shared PoC engine', 'real arm events and exact arm count',
    'completed makespan', 'no credit or fixed-H score in default UI', 'invalid arm count', 'retry identity and call accounting', 'legacy and PoC routes']};
fs.mkdirSync(path.join(ROOT, 'results/local/validation'), {recursive: true});
fs.writeFileSync(path.join(ROOT, 'results/local/validation/counts-http.json'), JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify(proof, null, 2));
