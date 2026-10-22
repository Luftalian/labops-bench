import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {suite,suiteConfig} from '../../benchmark/lemat-sdl/suite.mjs';
import {SchedulerSession} from '../../backend/scheduler/session.mjs';
import {SchedulerService} from '../../backend/scheduler/service.mjs';
import {validate} from '../../backend/scheduler/validate.mjs';
import {placeExact,requestViolations} from '../../backend/counts/evaluator.mjs';
import {relocationPlan} from '../../backend/scheduler/motion.mjs';
import {relocationModel} from '../../backend/scheduler/tasks.mjs';
import {actionMenu} from '../../agent/benchmark-actions.mjs';
import {decisionProblem,compilePolicyAnswer,policyController,fifoPolicy,advancedRulePolicy,createRuleController} from '../../agent/policy-runtime.mjs';
import {createJevController,createLunaInboxController,publicInput} from '../../agent/benchmark-providers.mjs';
import {runController} from '../../agent/scheduler-controller.mjs';

test('new challenges validate and fixed owned inventory exceeds room area without disappearing',async()=>{
  for(const b of suite().slice(10))assert.deepEqual(await validate(b,'Fixture'),[]);
  const b=suite()[11],s=new SchedulerSession(b,{config:suiteConfig});
  assert(36*.72*.58>b.task.room.width_m*b.task.room.depth_m);
  for(const c of actionMenu(s.snapshot())){
    assert.equal(c.design.layout.devices.length+c.design.layout.parked_devices.length,36);
    assert(c.design.layout.devices.length<=2);assert(placeExact(b.task,c.design).validation.valid);
  }
  const q=structuredClone(actionMenu(s.snapshot())[0].design);q.equipment_counts.flex_stirrer--;
  assert(requestViolations(b.task,q).some(e=>e.code==='OWNED_INVENTORY'));
});
test('tight packing keeps original geometry and rejects excessively close cell spacing',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'labops-pack-')),b=suite()[13],service=new SchedulerService({directory:dir,definitions:[b]});
  const body={task_id:b.task.task_id,task_version:b.task.version,equipment_counts:b.task.resource_limits.equipment,amr_count:1,pitch_x_m:1.2,pitch_y_m:2.6};
  const good=await service.packing(body);assert.equal(good.status,200);assert.equal(good.body.design.arm_count,8);
  const xs=good.body.design.layout.robots.map(r=>r.x);assert(Math.max(...xs)-Math.min(...xs)<10);
  const bad=await service.packing({...body,pitch_x_m:.2});assert.equal(bad.status,422);assert(bad.body.violations.some(v=>/collision|blocked/.test(v.code)));
  fs.rmSync(dir,{recursive:true,force:true});
});
test('algorithm, Luna JSON and Jev typed adapters expose the same public problem and compile canonical decisions',async()=>{
  const s=new SchedulerSession(suite()[10],{config:suiteConfig}),o=s.snapshot(),p=decisionProblem(o);
  assert.deepEqual(publicInput(o),p);assert.deepEqual(p.observation,o);assert(p.observation.reservations);
  const a=fifoPolicy(p),d=compilePolicyAnswer(p,a);assert.deepEqual(await validate(d,'SchedulerDecision'),[]);
  const custom=await policyController(input=>{assert.deepEqual(input,p);return d;})(o);assert.deepEqual(custom,d);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'labops-jev-shape-'));let called=0;
  const adapter=createJevController({apiKey:'software-test-only',ledgerFile:path.join(dir,'ledger.json'),fetchImpl:async(url,options)=>{
    called++;const body=JSON.parse(options.body);assert.deepEqual(body.state,p);
    return {ok:true,status:200,text:async()=>JSON.stringify({model:'mock-for-software-test-only',answers:{layout:{choice:a.layout_choice},...Object.fromEntries(o.jobs.map((j,i)=>['job_'+i,{score:2}]))},usage:{input_tokens:1}})};
  }});
  const jd=await adapter(o,{folder:dir,signal:new AbortController().signal});assert.equal(called,1);assert.deepEqual(await validate(jd,'SchedulerDecision'),[]);
  fs.rmSync(dir,{recursive:true,force:true});
});
test('same spread layout: downstream-aware job order beats FIFO on the designed tail challenge',async()=>{
  const results=[];
  for(const policy of [fifoPolicy,advancedRulePolicy]){
    const s=new SchedulerSession(suite()[10],{config:suiteConfig});
    results.push(await runController(s,policyController(p=>({...policy(p),layout_choice:p.observation.phase==='initial_design'?'spread-full':'keep'}))));
  }
  assert(results.every(r=>r.status==='completed'));assert.deepEqual(results[0].replay.layout,results[1].replay.layout);
  assert(results[1].metrics.makespan_s<results[0].metrics.makespan_s*.85);
});
test('a fresh Luna session cannot silently reuse an older inbox answer',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'labops-luna-fresh-')),folder=path.join(dir,'saved');fs.mkdirSync(folder);
  const s=new SchedulerSession(suite()[10],{config:suiteConfig}),o=s.snapshot(),answer=fifoPolicy(decisionProblem(o));
  fs.writeFileSync(path.join(dir,o.context.task_id+'-epoch-0.answer.json'),JSON.stringify({...answer,layout_choice:'stale-invalid-choice'}));
  fs.writeFileSync(path.join(dir,'done.json'),'{}');
  const controller=createLunaInboxController({directory:dir});assert(!fs.existsSync(path.join(dir,'done.json')));
  const promise=controller(o,{folder,signal:new AbortController().signal});
  const pending=JSON.parse(fs.readFileSync(path.join(dir,'pending.json')));assert(pending.id.startsWith(o.session_id));
  fs.writeFileSync(pending.answer_file,JSON.stringify(answer));const d=await promise;assert.equal(d.type,'initial_design');
  fs.rmSync(dir,{recursive:true,force:true});
});
test('multiple staging bays preserve all 36 owned IDs and use collision-checked exchanges',async()=>{
  const s=new SchedulerSession(suite()[11],{config:suiteConfig});
  const controller=createRuleController('algorithm-advanced');
  const r=await runController(s,async(o,options)=>{
    if(o.phase==='reschedule'&&o.reconfiguration_state.phase==='idle')for(const c of actionMenu(o).filter(c=>c.layout))assert.deepEqual(relocationPlan(s.env,c.layout,s.config,relocationModel).errors,[],c.id);
    return controller(o,options);
  });
  assert.equal(r.status,'completed');assert.equal(r.receipts.filter(r=>r.status==='rejected').length,0);
  assert.equal(Object.values(r.installed_resources.equipment_counts).reduce((s,n)=>s+n,0),36);
  assert(r.replay.decisions.filter(d=>d.type==='relocation_applied').length>=2);
});
