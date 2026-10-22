import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {ROOT} from '../backend/stage1/service.mjs';
const base=process.env.LABOPS_URL??'http://127.0.0.1:4173';
async function request(p,body,headers={}) {
  const r=await fetch(base+p,body===undefined?undefined:{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  return {status:r.status,body:await r.json()};
}
let tasks;
for(let attempt=0;attempt<50;attempt++){
  try{tasks=await request('/v1/tasks');break;}catch(error){if(attempt===49)throw error;await new Promise(r=>setTimeout(r,100));}
}
assert.equal(tasks.status,200);
assert.ok(tasks.body.every(b=>!('result'in b)&&!('expected_violation_codes'in b)));
const fixture=JSON.parse(fs.readFileSync(path.join(ROOT,'fixtures/single-mix-valid.json')));
const run=await request('/v1/runs',{task_id:fixture.task.task_id,task_version:fixture.task.version});assert.equal(run.status,201);
const headers={'X-LabOps-Run-Id':run.body.run_id};
const result=await request('/v1/evaluations',fixture.request,headers);assert.equal(result.status,200);
assert.deepEqual(result.body.metrics,fixture.result.metrics);assert.equal(result.body.result_origin,'simulation');
assert.deepEqual(await request('/v1/evaluations',fixture.request,headers),result);
const invalid=await request('/v1/evaluations',{...fixture.request,submission_id:'missing-device',equipment_counts:{...fixture.request.equipment_counts,mixer:0}},headers);
assert.equal(invalid.body.status,'invalid');assert.equal(invalid.body.metrics,null);
assert.equal((await request('/v1/runs/'+run.body.run_id)).body.used_calls,2);
const config=await request('/api/v4/config');assert.equal(config.body.protocol,'labops.hall.v4');
const records=await request('/api/v4/recordings');assert.equal(records.body.length,4);
for(const record of records.body){const replay=await request('/api/v4/recordings/'+record.id);assert.equal(replay.status,200);assert.equal(replay.body.schema_version,'labops.hall.result.v4');}
const parameters={family:'screening-mix',jobs:3,amrs:2};
const session=await request('/api/v4/sessions',{parameters});assert.equal(session.status,201);
assert.equal((await request('/api/v4/sessions/'+session.body.session_id+'/result')).status,409);
const worker=await request('/api/v4/runs',{parameters,policy:'fixed'});assert.equal(worker.status,202);
const start=Date.now();let state;
do{state=await request('/api/v4/runs/'+worker.body.run_id);if(state.body.status==='running')await new Promise(r=>setTimeout(r,100));assert.ok(Date.now()-start<30000);}while(state.body.status==='running');
assert.equal(state.body.status,'done');
const dynamic=await request('/api/v4/runs/'+worker.body.run_id+'/result');assert.equal(dynamic.body.metrics.completed_jobs,3);
for(const p of ['/','/stage1.mjs','/stage1.css','/poc/','/hall/app.mjs','/hall/styles.css','/campus/styles.css','/workshop/styles.css','/workshop/plan-view.mjs','/workshop/three-view.mjs','/vendor/three.module.js','/workshop/assets/xarm/base.stl'])assert.equal((await fetch(base+p)).status,200,p);
assert.ok((await (await fetch(base+'/poc/')).text()).includes('ADDITIONAL MODE'));
const proof={status:'passed',base,checks:['12-second canonical HTTP result','retry identity','invalid and call accounting','four archived PoC replays','live PoC worker','shared CSS chain, 2D/3D and CAD assets'],stage1_makespan_s:result.body.metrics.makespan_s,dynamic_completed:dynamic.body.metrics.completed_jobs};
fs.mkdirSync(path.join(ROOT,'results/local/validation'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'results/local/validation/http-integration.json'),JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify(proof,null,2));
