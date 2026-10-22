// Software diagnostic: verify the documented whole-job drain boundary.
// No model call, performance ranking or new literature benchmark condition.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {suite,suiteConfig} from '../benchmark/lemat-sdl/suite.mjs';
import {MODEL_IDS,hash} from '../backend/counts/tasks.mjs';
import {SchedulerSession} from '../backend/scheduler/session.mjs';
import {runController,decisionEnvelope} from '../agent/scheduler-controller.mjs';
import {packedCellLayout} from '../agent/layout-packing.mjs';
import {ROOT,sourceManifest} from './run-lemat-sdl.mjs';
const b=suite()[10],supply=suite()[11];
b.task.task_id='software-checkpoint-diagnostic';b.task.version='diagnostic-1';
b.task.room=structuredClone(supply.task.room);b.task.external_staging={...structuredClone(supply.task.external_staging),capacity:1};
b.task.jobs=b.task.jobs.filter(j=>j.line==='ha-full').slice(0,1);b.task.workload_hash=hash(b.task.jobs);b.task.policies.inventory='fixed-owned-v1';
b.task.resource_limits.arms=2;const counts=Object.fromEntries(MODEL_IDS.map(m=>[m,['flex_stirrer','flex_liquid_handler','oven'].includes(m)?1:0]));b.task.resource_limits.equipment=counts;
b.request={...b.request,task_id:b.task.task_id,task_version:b.task.version,equipment_counts:counts,arm_count:2,amr_count:1,
 layout:packedCellLayout(b.task,counts,{activeIds:['flex_stirrer-1','oven-1']})};
const s=new SchedulerSession(b,{config:{...suiteConfig,max_decisions:2}});
const r=await runController(s,async o=>{const d={...decisionEnvelope(o),type:o.phase,reason:'Software diagnostic: retain the valid two-device configuration.',priorities:o.jobs.map(j=>({job_id:j.job_id,priority:1}))};if(o.phase==='initial_design')d.initial_design={...b.request,submission_id:d.decision_id};else d.reconfiguration={mode:'keep'};return d;});
assert.equal(r.receipts.filter(r=>r.status==='rejected').length,0);assert.equal(r.terminal_reason,'scheduler_deadlock');assert.equal(r.metrics.makespan_s,null);assert.equal(r.metrics.completed_jobs,0);
const folder=path.join(ROOT,'results/local/validation/scheduler-challenges');fs.mkdirSync(folder,{recursive:true});
fs.writeFileSync(path.join(folder,'whole-job-staging-diagnostic.json'),JSON.stringify({kind:'Software diagnostic only; controller keeps one of two required mobile models parked.',expected_boundary:'Admission requires the whole workflow route; no mid-workflow external sample checkpoint.',source_hashes:sourceManifest(),task:b,result:r,journal:s.journal},null,2)+'\n');
console.log(JSON.stringify({status:'passed',terminal_reason:r.terminal_reason,makespan_s:r.metrics.makespan_s,completed_jobs:r.metrics.completed_jobs,rejected:r.receipts.filter(r=>r.status==='rejected').length}));
