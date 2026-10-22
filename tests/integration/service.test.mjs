import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EvaluationService, search, ROOT} from '../../backend/stage1/service.mjs';

const fixture=JSON.parse(fs.readFileSync(path.join(ROOT,'fixtures/single-mix-valid.json')));
const request=fixture.request;
function setup(t, callLimit=3) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'labops-stage1-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const service=new EvaluationService({directory,callLimit});
  const {body:run,status}=service.create({task_id:request.task_id,task_version:request.task_version});
  assert.equal(status,201);return {service,run,directory};
}
test('actual evaluator, retries, conflicting ids, invalid and duplicate calls, hard cap',async t=>{
  const {service,run}=setup(t);
  const first=await service.evaluate(run.run_id,request);
  assert.equal(first.status,200);assert.equal(first.body.metrics.makespan_s,12);
  const reordered=Object.fromEntries(Object.entries(request).reverse());
  assert.deepEqual(await service.evaluate(run.run_id,reordered),first);
  assert.equal(service.runs.get(run.run_id).used_calls,1);
  assert.equal((await service.evaluate(run.run_id,{...request,simulation_seed:1})).status,409);
  const invalid=await service.evaluate(run.run_id,{...request,submission_id:'missing',equipment_counts:{...request.equipment_counts,mixer:0}});
  assert.equal(invalid.body.status,'invalid');assert.equal(invalid.body.metrics,null);
  assert.deepEqual((await service.evaluate(run.run_id,{...request,submission_id:'repeat'})).body.metrics,first.body.metrics);
  assert.equal(service.runs.get(run.run_id).used_calls,3);
  assert.equal((await service.evaluate(run.run_id,{...request,submission_id:'exhausted'})).status,429);
  assert.deepEqual(await service.evaluate(run.run_id,request),first);
});
test('shape and unknown task errors count, run cap cannot be changed by clients',async t=>{
  const {service,run}=setup(t);
  assert.equal(service.create({task_id:request.task_id,task_version:request.task_version,call_limit:100}).status,422);
  assert.equal((await service.evaluate(run.run_id,{...request,submission_id:'typed',equipment_counts:{...request.equipment_counts,mixer:1.5}})).status,422);
  assert.equal((await service.evaluate(run.run_id,{...request,submission_id:'unknown',task_version:'unknown'})).status,404);
  assert.equal((await service.evaluate(run.run_id,null)).status,422);
  assert.equal(service.runs.get(run.run_id).used_calls,3);
});
test('concurrent calls serialize without bypassing the cap; restart preserves retries and usage',async t=>{
  const {service,run,directory}=setup(t,1);
  const responses=await Promise.all([service.evaluate(run.run_id,request),service.evaluate(run.run_id,{...request,submission_id:'other'})]);
  assert.deepEqual(responses.map(r=>r.status),[200,429]);
  const restored=new EvaluationService({directory});
  assert.equal(restored.runs.get(run.run_id).used_calls,1);
  assert.deepEqual(await restored.evaluate(run.run_id,request),responses[0]);
  assert.equal((await restored.evaluate(run.run_id,{...request,submission_id:'after-restart'})).status,429);
});
test('failed computation is journaled, same-id retry spends no extra call',async t=>{
  const {service,run}=setup(t,1);
  const compute=service.compute.bind(service);service.compute=async()=>{throw new Error('simulated infrastructure failure');};
  assert.equal((await service.evaluate(run.run_id,request)).status,500);
  service.compute=compute;
  assert.equal((await service.evaluate(run.run_id,request)).body.metrics.makespan_s,12);
  assert.equal(service.runs.get(run.run_id).used_calls,1);
});
test('a restarted run cannot silently change its bound task inputs',async t=>{
  const {service,run,directory}=setup(t);
  service.runs.get(run.run_id).task_hash='changed-input-hash';service.save(service.runs.get(run.run_id));
  const restored=new EvaluationService({directory});
  assert.equal((await restored.evaluate(run.run_id,request)).body.error,'bound_task_changed');
});
test('random and greedy use the same cap and recommend only evaluated simulation results',async t=>{
  for(const method of ['random','greedy']){
    const {service}=setup(t,3);
    // Resolve the checked-in task id rather than inventing a task for the test.
    const actual=service.tasks().find(b=>b.workflow.workflow_id==='four-stage');
    const response=service.create({task_id:actual.task.task_id,task_version:actual.task.version,method,search_seed:17});
    assert.equal(response.status,201);
    const data=await search(service,response.body.run_id);
    assert.ok(data.run.used_calls<=3);
    if(method==='random')assert.equal(data.run.used_calls,3);
    if(data.run.recommendation){const best=data.results.find(r=>r.submission_id===data.run.recommendation);assert.ok(best.valid);assert.equal(best.result_origin,'simulation');}
    assert.equal(service.runs.get(response.body.run_id).cache.size,data.run.used_calls);
  }
});
