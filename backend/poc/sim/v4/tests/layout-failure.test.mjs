import test from 'node:test';
import assert from 'node:assert/strict';
import {createHall,planHall,validateLayout} from '../tasks.mjs';
import {runHall} from '../agents.mjs';
import {checkReferencePlacement} from '../placement.mjs';

test('100 benches is a ceiling: a small room selects a valid subset and completes every job',async()=>{
 const task=createHall({family:'parallel-stress',jobs:100,width_m:8,depth_m:7}),before=JSON.stringify(task),r=await runHall(task,{policy:'fixed'});
 assert.equal(r.terminal_reason,'completed');assert.equal(r.metrics.completed_jobs,100);assert.equal(r.metrics.invalid_actions,0);assert.equal(r.resource_limits.benches,100);assert.ok(r.installed_resources.benches>0&&r.installed_resources.benches<100);assert.equal(r.unused_resources.benches,100-r.installed_resources.benches);assert.equal(r.configuration.room.width_m,8);assert.equal(r.configuration.room.depth_m,7);assert.equal(JSON.stringify(task),before);assert.ok(validateLayout(r.layout,task).valid);assert.ok(r.installed_resources.amrs<=2);assert.equal(r.layout_selection.unused_devices,r.unused_resources.benches);
});

test('preflight reports selected resources, preserves limits and permits partial module allocations',()=>{
 const task=createHall({family:'parallel-stress',jobs:1,width_m:8,depth_m:7}),check=checkReferencePlacement(task);assert.ok(check.valid);assert.equal(check.resource_limits.benches,100);assert.ok(check.installed_resources.benches<100);assert.equal(check.infeasibility_proven,false);
 const partial=createHall({family:'parallel-stress',jobs:1,benches:100,initial_modules:{stirrer:2}});assert.equal(planHall(partial).layout.devices.length,2);
 const furnace=createHall({family:'furnace-burst',jobs:1,width_m:8,depth_m:7});const p=planHall(furnace);assert.ok(p.validation.valid);assert.ok(p.layout.devices.some(d=>d.model==='furnace'));assert.ok(p.layout.devices.filter(d=>d.model==='furnace').length<50);
 const missing={...p.layout,devices:p.layout.devices.filter(d=>d.model!=='furnace')};assert.ok(validateLayout(missing,furnace).errors.some(e=>e.code==='missing_capability'));
});

test('if no tested subset works, report a design failure without claiming physical impossibility',async()=>{
 const task=createHall({family:'parallel-stress',jobs:1,width_m:8,depth_m:7});task.room.obstacles=[{x:0,y:0,w:8,h:7}];
 const r=await runHall(task,{policy:'fixed'});assert.equal(r.terminal_reason,'layout_search_failed');assert.equal(r.failure.phase,'design');assert.equal(r.failure.infeasibility_proven,false);assert.ok(r.failure.error_count>0);assert.equal(r.metrics.elapsed_s,0);assert.equal(r.metrics.completed_jobs,0);
});
