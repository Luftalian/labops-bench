import test from 'node:test';
import assert from 'node:assert/strict';
import {createHall,catalog,planHall,hash,validateLayout} from '../tasks.mjs';
import {HallEnvironment} from '../environment.mjs';
import {runHall,chooseHallAction} from '../agents.mjs';
const start=t=>{const e=new HallEnvironment(t),p=planHall(t);assert.ok(p.validation.valid);assert.ok(e.apply({type:'set_layout',state_version:e.version,layout:p.layout}).accepted);assert.ok(e.apply({type:'start',state_version:e.version}).accepted);return e;};
test('one bounded room has shared resources; resource parameters preserve workloads',()=>{
 const a=createHall({jobs:60}),b=createHall({jobs:60,width_m:18,benches:10,furnaces:6});assert.equal(a.workload_hash,b.workload_hash);assert.equal(a.topology.kind,'single-shared-room');assert.equal(a.topology.shared_sample_amrs,1);assert.equal('cells'in a,false);assert.throws(()=>createHall({cells:4}));assert.equal(planHall(a).validation.valid,true);
});
test('capability reconfiguration consumes finite modules, cart and arm time atomically',()=>{
 const e=start(createHall({jobs:12})),d=e.layout.devices.find(d=>d.model==='flex_grinder'),before=e.stock();assert.ok(d);assert.ok(e.apply({type:'reconfigure',state_version:e.version,device_id:d.id,capability:'stirrer',reason:'Software fixture'}).accepted);const event=e.reconfigurations[0];assert.ok(event.end_s-event.start_s>=e.task.setup_s);assert.equal(e.stock().stirrer,before.stirrer-1);assert.equal(e.stock().grinder,before.grinder);assert.equal(e.deviceState[d.id].available_s,event.end_s);e.time=event.end_s;e.refresh();assert.equal(e.stock().grinder,before.grinder+1);
 const fixed=e.layout.devices.find(d=>d.model==='furnace'),prior=hash(e.layout);assert.equal(e.apply({type:'reconfigure',state_version:e.version,device_id:fixed.id,capability:'stirrer',reason:'Invalid fixed equipment change'}).code,'fixed_device');assert.equal(hash(e.layout),prior);
});
test('routes reserve per-arm future credits; committed modules cannot change',()=>{
 const e=start(createHall({jobs:30}));let admitted=0;for(let i=0;i<50&&e.phase==='running';i++){const a=chooseHallAction(e.observe({clone:false}),'fixed');assert.ok(e.apply(a).accepted);admitted=e.jobs.filter(j=>j.admitted_s!==undefined).length;if(admitted>0)break;}assert.ok(admitted>0);const job=e.jobs.find(j=>j.admitted_s!==undefined),id=job.routes['op-0'];assert.equal(e.apply({type:'reconfigure',state_version:e.version,device_id:id,capability:'filter',reason:'Would orphan committed work'}).code,'station_has_committed_work');for(const v of Object.values(e.credits()))assert.ok(v<=e.task.buffer_slots);
});
test('independent lines share common fixed instruments and one global carrier calendar',async()=>{
 const r=await runHall(createHall({jobs:45,family:'steady-mix'}));assert.equal(r.terminal_reason,'completed');assert.equal(r.metrics.invalid_actions,0);assert.ok(r.metrics.peak_parallel_processes>1);assert.equal(r.metrics.shared_amrs,1);
 const xrd=new Set(r.batches.filter(b=>b.model==='xrd').flatMap(b=>b.job_ids.map(id=>r.jobs.find(j=>j.id===id).line)));assert.ok(xrd.size>1);
 for(const resource of [...r.layout.robots.map(r=>r.id),'amr-1','configuration-cart',...r.layout.devices.map(d=>d.id)]){const s=r.trace.filter(s=>s.resource===resource).sort((a,b)=>a.start_s-b.start_s);for(let i=1;i<s.length;i++)assert.ok(s[i].start_s>=s[i-1].end_s-1e-6,'Overlap '+resource);}
 for(const history of r.layout_history)assert.ok(validateLayout(history.layout,r.configuration,catalog,{complete:false}).valid);
});
test('adaptive changes modules while other experiments continue; baseline keeps configuration',async()=>{
 const task=createHall({jobs:60}),fixed=await runHall(task,{policy:'fixed'}),adaptive=await runHall(task,{policy:'adaptive'});assert.equal(fixed.terminal_reason,'completed');assert.equal(adaptive.terminal_reason,'completed');assert.equal(fixed.workload_hash,adaptive.workload_hash);assert.equal(fixed.metrics.module_changes,0);assert.ok(adaptive.metrics.module_changes>0);assert.ok(adaptive.metrics.reconfigurations_during_other_processing>0);
 for(const e of adaptive.reconfigurations){assert.ok(e.other_running_batches.every(id=>adaptive.batches.some(b=>b.id===id&&b.process_start_s<=e.start_s&&b.process_end_s>e.start_s)));}
});
test('buffer credits and physical output tokens never exceed bounds',async()=>{
 const e=start(createHall({jobs:70,buffer_slots:4}));while(e.phase!=='done'){const a=chooseHallAction(e.observe({clone:false}));assert.ok(e.apply(a).accepted);for(const n of Object.values(e.credits()))assert.ok(n<=e.task.buffer_slots);for(const arm of e.layout.robots)assert.ok(e.tokens.filter(t=>t.robot_id===arm.id).length<=e.task.buffer_slots);for(const n of Object.values(e.stock()))assert.ok(n>=0);}assert.equal(e.terminal_reason,'completed');
});
test('source procedure programs are unchanged during routing and reconfiguration',async()=>{
 const t=createHall({family:'source-stream',jobs:18}),r=await runHall(t);assert.equal(r.terminal_reason,'completed');for(const j of r.jobs)for(const n of j.nodes)assert.equal(hash(n.program),hash(t.jobs.find(s=>s.id===j.id).nodes.find(s=>s.id===n.id).program));
});
test('deterministic execution repeats and observations have bounded future visibility',async()=>{
 const t=createHall({jobs:24}),a=await runHall(t),b=await runHall(t);assert.equal(hash(a.trace),hash(b.trace));const e=start(createHall({jobs:100,arrival_interval_s:7200})),o=e.observe();assert.ok(o.jobs.every(j=>j.arrival_s<=o.time_s+o.task.visibility_s));assert.equal('jobs'in o.task,false);assert.ok(!JSON.stringify(o).includes('H00100'));
});

test('module commissioning targets the validated input adapter inside the arm envelope',async()=>{
 const r=await runHall(createHall({jobs:60}));for(const s of r.trace.filter(s=>s.kind==='commission_module')){const arm=r.layout.robots.find(a=>a.id===s.resource);assert.ok(Math.hypot(s.to[0]-arm.x,s.to[1]-arm.y,s.to[2]-catalog.robot.shoulder_height_m)<=catalog.robot.reach_m+1e-6);}
});
