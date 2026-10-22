import test from 'node:test';
import assert from 'node:assert/strict';
import {createHall,hash,capabilities} from '../tasks.mjs';
import {runHall} from '../agents.mjs';

test('ambient fixtures have diverse nonthermal routes and explicit synthetic provenance',()=>{
 for(const family of ['screening-shift','screening-mix','transfer-stress']){
  const t=createHall({family,jobs:60}),repeat=createHall({family,jobs:60}),resized=createHall({family,jobs:60,benches:12,amrs:4});
  assert.equal(t.workload_hash,repeat.workload_hash);assert.equal(t.workload_hash,resized.workload_hash);
  assert.equal(t.scenario.thermal_processing,false);assert.ok(t.scenario.provenance.includes('Synthetic'));
  assert.equal(t.initial_inventory.furnace,undefined);assert.equal(t.initial_inventory.oven,undefined);assert.equal(t.initial_inventory.xrd,undefined);
  assert.equal(new Set(t.jobs.map(j=>j.line)).size,3);assert.ok(t.jobs.every(j=>j.procedure_id===null&&j.nodes.every(n=>capabilities.includes(n.capability)&&n.program.every(p=>p.temperature_c===null))));
  if(family==='transfer-stress')assert.ok(t.jobs.every(j=>j.nodes.every(n=>n.duration_s<=30)));
 }
 const shift=createHall({family:'screening-shift',jobs:60}),mix=createHall({family:'screening-mix',jobs:60});assert.equal(shift.jobs[0].line,shift.jobs[19].line);assert.notEqual(shift.jobs[19].line,shift.jobs[20].line);assert.equal(mix.jobs[0].line,mix.jobs[3].line);assert.notEqual(mix.jobs[0].line,mix.jobs[1].line);
 assert.throws(()=>createHall({furnaces:0}),/requires furnace/);assert.equal(createHall({ovens:2}).initial_inventory.oven,2);
 assert.equal(createHall({jobs:12}).jobs[0].nodes.find(n=>n.capability==='furnace').duration_s,7200);
});

test('new workloads complete with valid resource accounting for both references',async()=>{
 for(const family of ['screening-shift','screening-mix','transfer-stress'])for(const policy of ['fixed','adaptive']){
  const task=createHall({family,jobs:18}),r=await runHall(task,{policy});assert.equal(r.terminal_reason,'completed',family+' '+policy);assert.equal(r.metrics.completed_jobs,18);assert.equal(r.metrics.invalid_actions,0);assert.equal(r.diagnostics.thermal_process_resource_share,0);
  for(const row of r.diagnostics.resources)assert.ok(row.load>=0&&row.load<=1+1e-7,JSON.stringify(row));
  const total=r.batches.reduce((s,b)=>s+b.process_end_s-b.process_start_s,0);assert.ok(Math.abs(total-r.diagnostics.process_resource_s)<1e-6);
  for(const j of r.jobs)for(const n of j.nodes)assert.equal(hash(n.program),hash(task.jobs.find(x=>x.id===j.id).nodes.find(x=>x.id===n.id).program));
 }
});
