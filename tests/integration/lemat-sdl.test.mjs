import {customizeTask,loadCustomTasks} from '../../backend/counts/custom-tasks.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {suite,suiteConfig,curated} from '../../benchmark/lemat-sdl/suite.mjs';
import {SchedulerSession} from '../../backend/scheduler/session.mjs';
import {validate} from '../../backend/scheduler/validate.mjs';
import {relocationPlan} from '../../backend/scheduler/motion.mjs';
import {relocationModel} from '../../backend/scheduler/tasks.mjs';
import {runController} from '../../agent/scheduler-controller.mjs';
import {heuristicController,initialCandidates,decisionFromAnswer,heuristicAnswer,layoutCandidates} from '../../agent/benchmark-actions.mjs';
import {createJevController} from '../../agent/benchmark-providers.mjs';
import {initialSampleTokens} from '../../backend/poc/sim/v4/initial-samples.mjs';
import {concurrency} from '../../scripts/run-lemat-sdl.mjs';
import {createHall} from '../../backend/poc/sim/v4/tasks.mjs';
import {placeExact} from '../../backend/counts/evaluator.mjs';

test('all source-derived tasks validate, preserve selected source times and matched workloads',async()=>{
  const tasks=suite();assert.equal(tasks.length,14);
  for(const b of tasks)assert.deepEqual(await validate(b,'Fixture'),[]);
  assert.equal(tasks[8].task.workload_hash,tasks[9].task.workload_hash);
  assert.equal(curated.workflows.find(w=>w.id==='ha-mix').steps[0].duration_s,600);
  assert.equal(curated.workflows.find(w=>w.id==='ag-sonicate').steps[0].duration_s,5400);
  assert(curated.workflows.every(w=>w.steps.every(s=>s.source_pointer&&s.duration_provenance&&s.mapping_provenance)));
});
test('configuration accepts room/count values beyond former product caps without clamping',async()=>{
  assert.deepEqual(await validate({width_m:100,depth_m:.5},'Room'),[]);
  const b=suite()[0];b.task.resource_limits.arms=100;b.task.resource_limits.amrs=40;b.task.resource_limits.equipment.flex_stirrer=100;
  assert.deepEqual(await validate(b.task,'Task'),[]);
  const hall=createHall({family:'parallel-stress',jobs:1,width_m:90,depth_m:70,benches:130,amrs:20,initial_modules:{stirrer:130},furnaces:0,ovens:0,xrd:0});
  assert.equal(hall.room.width_m,90);assert.equal(hall.initial_inventory.flex_stirrer,130);assert.equal(hall.topology.shared_sample_amrs,20);
});
test('large cell candidate installs exact 32 arms and 8 cars',()=>{
  const b=suite()[2],s=new SchedulerSession(b,{config:suiteConfig});const plan=placeExact(b.task,initialCandidates(s.snapshot())[0].design);
  assert.equal(plan.validation.valid,true,JSON.stringify(plan.validation.errors));assert.equal(plan.layout.robots.length,32);assert.equal(plan.fleet.length,8);
});
test('external exchange completes both cohorts, preserves models and charges all stages',async()=>{
  const s=new SchedulerSession(suite()[1],{config:suiteConfig});const result=await runController(s,heuristicController);
  assert.equal(result.status,'completed');assert.equal(result.metrics.completed_jobs,16);
  assert.equal(result.installed_resources.equipment_counts.flex_stirrer,1);assert.equal(result.installed_resources.equipment_counts.flex_centrifuge,1);
  const trace=result.replay.trace;
  for(const stage of ['relocation_disconnect','external_egress','external_handling','external_ingress','relocation_reconnect','relocation_calibrate'])assert(trace.some(t=>t.kind===stage&&t.end_s>t.start_s));
  assert.equal(result.replay.layout.devices[0].model,'flex_centrifuge');assert.equal(result.replay.layout.parked_devices[0].model,'flex_stirrer');
  assert.equal(result.receipts.filter(r=>r.status==='rejected').length,0);
});
test('exchange rejects inventory mutation, blocked gate and storage overflow atomically',async()=>{
  const s=new SchedulerSession(suite()[1],{config:suiteConfig});await s.submit(await heuristicController(s.snapshot()));
  const target=layoutCandidates(s.snapshot())[1].layout;
  const bad=structuredClone(target);bad.parked_devices[0].model='flex_filter';
  assert(relocationPlan(s.env,bad,s.config,relocationModel).errors.some(e=>e.code==='inventory_changed'));
  const narrow=structuredClone(s.env.task);narrow.external_staging.gate.width_m=.1;
  const probe=Object.assign(Object.create(Object.getPrototypeOf(s.env)),s.env,{task:narrow});
  assert(relocationPlan(probe,target,s.config,relocationModel).errors.some(e=>e.code==='gate_alignment'));
  bad.parked_devices.push({id:'extra',model:'flex_filter'});
  assert(relocationPlan(s.env,bad,s.config,relocationModel).errors.some(e=>e.code==='staging_capacity'));
  assert.equal(s.env.layout.devices[0].model,'flex_stirrer');
});
test('Jev budget prevents a network call and fatal provider errors stop retrying',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jev-test-'));let calls=0;
  const provider=createJevController({apiKey:'test-only',ledgerFile:path.join(dir,'spend.json'),maxUSD:0,fetchImpl:async()=>{calls++;throw new Error('must not call');}});
  const s=new SchedulerSession(suite()[0],{config:suiteConfig});
  await assert.rejects(()=>provider(s.snapshot(),{folder:dir,signal:new AbortController().signal}),/spending_cap/);assert.equal(calls,0);
  await runController(s,async()=>{calls++;throw Object.assign(new Error('fatal test'),{fatal:true});});
  assert.equal(calls,1);assert.equal(s.env.terminal_reason,'provider_failure');
  fs.rmSync(dir,{recursive:true,force:true});
});


test('prepositioned samples use finite buffers once and permit 32 simultaneous real arm loads',async()=>{
  const b=suite()[2],s=new SchedulerSession(b,{config:suiteConfig});
  const result=await runController(s,heuristicController);
  assert.equal(result.status,'completed');assert.equal(result.context.task_version,'2');
  assert.equal(concurrency(result.replay).peak_arm_actions,32);assert.equal(concurrency(result.replay).peak_processes,32);
  assert.equal(result.replay.trace.filter(t=>t.kind==='load').length,64);assert.equal(s.env.tokens.length,0);
  assert.equal(result.replay.trace.filter(t=>t.kind==='transport').length,0);
  const badTask={initial_sample_policy:'local-arm-buffer',buffer_slots:1,jobs:[{id:'a',arrival_s:0,nodes:[{id:'op-0',parents:[],capability:'stirrer'}]},{id:'b',arrival_s:0,nodes:[{id:'op-0',parents:[],capability:'stirrer'}]}]};
  const invalid=initialSampleTokens({devices:[{id:'d',model:'stirrer',input_robot_id:'a'}],robots:[{id:'a'}]},badTask,(cap,d)=>cap===d.model);
  assert(invalid.errors.some(e=>e.code==='initial_buffer_full'));
});


test('room/count editing preserves the base workload and persists a separate condition',async()=>{
  const definitions=[suite()[0]],base=structuredClone(definitions[0]);const dir=fs.mkdtempSync(path.join(os.tmpdir(),'labops-custom-'));
  const resource_limits=structuredClone(base.task.resource_limits);resource_limits.equipment.flex_stirrer=100;resource_limits.arms=100;resource_limits.amrs=20;
  const response=await customizeTask(definitions,{task_id:base.task.task_id,task_version:base.task.version,room:{width_m:100,depth_m:70},resource_limits},dir);
  assert.equal(response.status,201);assert.equal(definitions[0].task.room.width_m,5);assert.equal(definitions[1].task.room.width_m,100);
  assert.equal(definitions[1].task.workload_hash,base.task.workload_hash);assert.equal(loadCustomTasks(dir).length,1);
  fs.rmSync(dir,{recursive:true,force:true});
});


test('an idle room can wait for a later periodic exchange instead of ending prematurely',async()=>{
  const s=new SchedulerSession(suite()[1],{config:suiteConfig});
  const result=await runController(s,async o=>{
    const answer=heuristicAnswer(o);if(o.phase==='reschedule'&&o.time_s<10800)answer.layout_choice='keep';
    return decisionFromAnswer(o,answer);
  });
  assert.equal(result.status,'completed');assert(result.metrics.makespan_s>10800);
  assert(result.replay.decisions.some(e=>e.type==='relocation_applied'&&e.time_s>10800));
});
