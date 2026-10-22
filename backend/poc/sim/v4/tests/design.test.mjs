import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHall,hash,validateLayout} from '../tasks.mjs';
import {prepareHallDesign,runHall} from '../agents.mjs';

test('design compares arm grouping and commits a validated three-device configuration',async()=>{
 const task=createHall({family:'parallel-stress',jobs:100,width_m:8,depth_m:7}),d=prepareHallDesign(task),selected=d.candidates.find(c=>c.id===d.selected_id);assert.ok(selected);assert.ok(validateLayout(selected.layout,task).valid);assert.ok(Object.values(selected.devices_per_arm).includes(3));assert.equal(selected.preview.jobs,12);assert.equal(selected.preview.status,'completed');assert.ok(d.candidates.some(c=>c.group_size===2));assert.ok(d.candidates.every(c=>!c.valid||c.preview));assert.ok(d.candidates.filter(c=>c.valid).every(c=>Object.values(c.devices_per_arm).every(n=>n<=c.group_size)));
 const r=await runHall(task,{policy:'fixed'});assert.equal(r.terminal_reason,'completed');assert.equal(r.metrics.completed_jobs,100);assert.equal(r.initial_design.selected_id,d.selected_id);assert.equal(hash(r.layout),hash(selected.layout));assert.ok(r.decisions.some(d=>d.type==='initial_design_committed'));
});

test('preview excludes arrivals outside the public visibility window and repeats',()=>{
 const task=createHall({family:'parallel-stress',jobs:20,benches:3,arrival_interval_s:7200}),a=prepareHallDesign(task),b=prepareHallDesign(task);assert.ok(a.candidates.filter(c=>c.valid).every(c=>c.preview.jobs===4));assert.deepEqual(a,b);
});

test('LLM harness starts in design, gives invalid-proposal feedback and requires explicit commit',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'hall-design-test-')),call=(command,arg)=>JSON.parse(execFileSync(process.execPath,['scripts/codex-hall-session.mjs',command,folder,...(arg===undefined?[]:[typeof arg==='string'?arg:JSON.stringify(arg)])],{encoding:'utf8',maxBuffer:10e6}));
 try{let o=call('init',{family:'parallel-stress',jobs:3,benches:3,amrs:1});assert.equal(o.phase,'design');assert.equal(o.time_s,0);assert.equal(o.installed_resources.benches,0);assert.ok(o.candidates.length>=3);
 o=call('act',{type:'commit_layout',state_version:o.state_version,reason:'Regression: no proposal yet'});assert.equal(o.phase,'design');
 const c=call('candidate','arm-group-3');const invalid=structuredClone(c.layout);invalid.devices[0].x=-5;o=call('act',{type:'propose_layout',layout:invalid,state_version:o.state_version,reason:'Regression invalid geometry'});assert.equal(o.phase,'design');assert.equal(o.proposal.valid,false);assert.ok(o.proposal.receipt.validation.errors.length>0);
 o=call('act',{type:'choose_candidate',candidate_id:'arm-group-3',state_version:o.state_version,reason:'Correct geometry after feedback'});assert.equal(o.proposal.valid,true);assert.equal(o.phase,'design');
 o=call('act',{type:'commit_layout',state_version:o.state_version,reason:'Explicitly commit the validated layout'});assert.equal(o.phase,'running');assert.equal(o.time_s,0);assert.equal(o.installed_resources.benches,3);assert.equal(fs.readFileSync(folder+'/manager.jsonl','utf8'),'');
 }finally{fs.rmSync(folder,{recursive:true});}
});
