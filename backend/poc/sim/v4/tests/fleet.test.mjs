import test from 'node:test';
import assert from 'node:assert/strict';
import {createHall,catalog,hash,planHall,validateLayout} from '../tasks.mjs';
import {runHall} from '../agents.mjs';
import {carriersAt} from '../../../demo/workshop/timeline.mjs';
import {bounds,distance} from '../../v2/geometry.mjs';

test('expanded resource ranges retain the same workload and reserve fleet identifiers',()=>{
 const a=createHall({jobs:12}),b=createHall({jobs:12,width_m:60,depth_m:40,benches:32,furnaces:16,xrd:12,amrs:8});
 assert.equal(a.workload_hash,b.workload_hash);assert.equal(b.robot_budget,31);assert.equal(b.topology.shared_sample_amrs,8);
 for(const parameters of [{amrs:9},{width_m:61},{depth_m:41},{benches:129},{furnaces:65},{xrd:33}])assert.doesNotThrow(()=>createHall(parameters));
 for(const parameters of [{amrs:0},{width_m:0},{depth_m:-1},{benches:1.5}])assert.throws(()=>createHall(parameters));
 const p=planHall(a);p.layout.robots[0].id='amr-2';assert.ok(validateLayout(p.layout,a).errors.some(e=>e.code==='reserved_fleet_id'));
});

test('shared fleet has exclusive vehicles, stationary bays and separated concurrent tours',async()=>{
 const r=await runHall(createHall({jobs:36,family:'steady-mix',amrs:4}),{policy:'fixed'});
 assert.equal(r.terminal_reason,'completed');assert.equal(r.metrics.invalid_actions,0);assert.equal(r.metrics.shared_amrs,4);assert.equal(r.fleet.length,4);
 const trips=r.trace.filter(s=>s.resource.startsWith('amr-'));assert.ok(new Set(trips.map(s=>s.resource)).size>1);assert.ok(trips.some((a,i)=>trips.slice(i+1).some(b=>a.resource!==b.resource&&a.start_s<b.end_s&&a.end_s>b.start_s)),'Fleet should support concurrent transport');
 for(const id of [...r.fleet.map(c=>c.id),...r.layout.robots.map(a=>a.id)]){const segments=r.trace.filter(s=>s.resource===id).sort((a,b)=>a.start_s-b.start_s);for(let i=1;i<segments.length;i++)assert.ok(segments[i].start_s>=segments[i-1].end_s-1e-6,id);}
 // Independent geometric screen: sample full tours and parked cars at regular
 // simulation times, plus all segment boundaries. Software model validation only.
 const times=new Set(trips.flatMap(s=>[s.start_s,s.empty_until_s,s.loaded_from_s,s.loaded_until_s,s.return_start_s,s.end_s]));
 for(const s of trips)for(let t=s.start_s;t<s.end_s;t+=.5)times.add(t);
 const separation=2*catalog.carrier.radius_m;
 for(const t of times){const cars=carriersAt(r,t);for(let i=0;i<cars.length;i++)for(let j=0;j<i;j++)assert.ok(distance(cars[i].point,cars[j].point)>=separation-1e-6,`Vehicle collision at ${t}`);}
 for(const s of trips){assert.deepEqual(s.return_to,r.fleet.find(c=>c.id===s.resource).home);assert.ok(s.end_s>=s.handoff_s);for(const p of s.path)for(const d of r.layout.devices){const b=bounds(d,catalog),r0=catalog.carrier.radius_m;assert.ok(!(p[0]>b.x-r0+1e-6&&p[0]<b.x+b.w+r0-1e-6&&p[1]>b.y-r0+1e-6&&p[1]<b.y+b.h+r0-1e-6),'Route intersects equipment');}}
 const two=createHall({jobs:8,amrs:2}),a=await runHall(two),b=await runHall(two);assert.equal(hash(a.trace),hash(b.trace));
});
