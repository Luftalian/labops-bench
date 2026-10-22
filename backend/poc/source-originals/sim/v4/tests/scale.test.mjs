import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHall,planHall,catalog,programPhases,physicalCapacity} from '../tasks.mjs';
import {validateLayout as legacyValidate} from '../../v2/geometry.mjs';
import {concurrencyStats} from '../concurrency.mjs';
import {recordedHall} from '../../../scripts/recorded-hall.mjs';

test('100-device and 50-furnace one-room configurations pass global geometry without changing v2 limits',()=>{
 const t=createHall({family:'parallel-stress'}),p=planHall(t);assert.equal(t.jobs.length,100);assert.ok(t.jobs.every(j=>j.arrival_s===0));assert.equal(p.layout.devices.length,100);assert.equal(p.layout.robots.length,50);assert.ok(p.validation.valid);assert.equal(legacyValidate(p.layout,t,catalog).valid,false);
 const f=createHall({family:'furnace-burst'}),q=planHall(f);assert.equal(f.room.width_m,30);assert.equal(f.room.depth_m,30);assert.equal(q.layout.devices.filter(d=>d.model==='furnace').length,50);assert.ok(q.validation.valid);assert.equal(f.jobs[0].nodes[0].duration_s,7200);assert.ok(programPhases(f.jobs[0].nodes[0],catalog.equipment.furnace).reduce((s,p)=>s+p.duration_s,0)>7200);assert.equal(physicalCapacity(catalog.equipment.furnace,9),4);
 for(const p of [{furnaces:65},{benches:129},{xrd:33},{initial_modules:{stirrer:1}},{initial_modules:{unsupported:8}}])assert.throws(()=>createHall(p));
});

test('processing-job count unions parallel nodes and differs from station/reservation counts',()=>{
 const r={metrics:{elapsed_s:10},jobs:[{id:'a',arrival_s:0,admitted_s:0,completed_s:10,nodes:[{start_s:0,completed_s:10},{start_s:2,completed_s:8}]},{id:'b',arrival_s:1,admitted_s:1,completed_s:6,nodes:[{start_s:3,completed_s:6}]}],batches:[{device_id:'s',model:'flex_stirrer',job_ids:['a'],process_start_s:1,process_end_s:5},{device_id:'f1',model:'furnace',job_ids:['a'],process_start_s:3,process_end_s:7},{device_id:'f2',model:'furnace',job_ids:['b'],process_start_s:4,process_end_s:6}]};
 const c=concurrencyStats(r);assert.equal(c.peak_processing_jobs,2);assert.equal(c.peak_processing_jobs_at_s,4);assert.equal(c.peak_reserved_jobs,2);assert.equal(c.peak_work_in_progress_jobs,2);assert.equal(c.peak_processing_furnaces,2);assert.equal(c.furnaces_used,2);assert.equal(c.released_at_zero_jobs,1);
});

test('historical Luna replay requires verified archived sources and authentic result bytes',()=>{
 const folder='results/v4/codex-luna-screening-2026-10-21';assert.equal(recordedHall(folder).source,'archived-verified');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'hall-recording-'));fs.copyFileSync(folder+'/manifest.json',temp+'/manifest.json');fs.copyFileSync(folder+'/result.json.gz',temp+'/result.json.gz');assert.throws(()=>recordedHall(temp),/stale/);const bytes=fs.readFileSync(temp+'/result.json.gz');bytes[10]^=1;fs.writeFileSync(temp+'/result.json.gz',bytes);assert.throws(()=>recordedHall(temp),/checksum/);fs.rmSync(temp,{recursive:true});
});
