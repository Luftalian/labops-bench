import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {developmentFixture,hash,nativeTask,MODEL_IDS} from '../backend/counts/tasks.mjs';
import {catalog} from '../backend/poc/sim/v4/tasks.mjs';
import {planLayout,rotate} from '../backend/poc/sim/v2/geometry.mjs';
import {evaluateCounts,CountEnvironment,placeExact} from '../backend/counts/evaluator.mjs';
import {chooseHallAction} from '../backend/poc/sim/v4/agents.mjs';
import {concurrency,sourceManifest} from './run-lemat-sdl.mjs';
const root=path.resolve(new URL('../',import.meta.url).pathname),out=path.join(root,'results/local/hackathon-media-v3');
fs.mkdirSync(path.join(out,'sources'),{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex'),snap=x=>Math.round(x*10)/10;
// Original synthetic demonstration programs. These are not modified LeMat data,
// chemical procedures, measured durations or new benchmark comparisons.
const recipes=[
 {name:'Liquid formulation',caps:['liquid_handler','stirrer','centrifuge']},
 {name:'Dispersion and recovery',caps:['liquid_handler','sonicator','centrifuge','oven']},
 {name:'Solid-state preparation',caps:['grinder','press','furnace']},
 {name:'Filtration and analysis',caps:['stirrer','filter','xrd']},
];
function jobsFor(count,caps,offset=0){
 return Array.from({length:count},(_,i)=>{
  const recipe=caps[i%caps.length],nodes=recipe.caps.map((cap,k)=>{const duration=['furnace','oven'].includes(cap)?45:18+((i+k)%4)*7;return {id:'op-'+k,parents:k?['op-'+(k-1)]:[],capability:cap,label:cap,duration_s:duration,program:[{action:'demo_process',duration_s:duration,temperature_c:null,atmosphere:'unspecified',duration_source:'synthetic-cinematic-demo'}],source_indices:[],recipe_key:recipe.name,compatibility_key:hash([recipe.name,cap]),vessel:'standard-50mm'};});
  return {id:'D'+String(i+offset+1).padStart(4,'0'),line:recipe.name,name:recipe.name,source_kind:'synthetic-cinematic-demo',arrival_s:0,due_s:1e8,priority:1000-(i%17),nodes};
 });
}
function bundleFor(id,room,inventory,arms,amrs,jobs,layout){
 const b=developmentFixture(...room);b.task.task_id=id;b.task.version='cinematic-2';b.task.room={width_m:room[0],depth_m:room[1]};b.task.jobs=jobs;b.task.workload_hash=hash(jobs);b.task.initial_sample_policy='local-arm-buffer';b.task.resource_limits={equipment:Object.fromEntries(MODEL_IDS.map(k=>[k,inventory[k]??0])),arms,amrs};b.task.simulation_seed=20261022;b.task.simulation_cutoff_s=2*86400;b.task.workload_parameters.buffer_slots=16;b.task.provenance='Original synthetic cinematic workload, condensed ambient operation programs; no chemistry or benchmark score claim.';
 b.request={...b.request,submission_id:id,task_id:id,task_version:b.task.version,equipment_counts:{...b.task.resource_limits.equipment},arm_count:arms,amr_count:amrs,simulation_seed:b.task.simulation_seed,layout};return b;
}
const presentInventory={flex_liquid_handler:1,flex_stirrer:1,flex_centrifuge:1,flex_grinder:1,flex_press:1,flex_sonicator:1,oven:1,furnace:1};
const smallTask={room:{width_m:7,depth_m:6,obstacles:[],cutouts:[]},intake:[.5,5.5],inventory:presentInventory,robot_budget:2,required_capabilities:[],buffer_slots:16};
const p=planLayout(smallTask,catalog,31,{devicesPerArm:4});if(!p.validation.valid)throw new Error('Present geometry failed');
const present=bundleFor('cinematic-present-v2',[7,6],presentInventory,2,3,jobsFor(20,recipes.slice(0,3)),p.layout);
const groups=[['flex_liquid_handler','flex_stirrer','flex_centrifuge'],['flex_grinder','flex_press','furnace'],['flex_sonicator','flex_filter','oven'],['flex_liquid_handler','flex_stirrer','xrd']];
const layout={devices:[],robots:[]},inventory={},templates=new Map();
for(let i=0;i<96;i++){
 const group=groups[(i*7+Math.floor(i/12))%groups.length],key=group.join('|');let template=templates.get(key);
 if(!template){const t={...smallTask,room:{width_m:6,depth_m:6,obstacles:[],cutouts:[]},inventory:Object.fromEntries(group.map(k=>[k,1])),robot_budget:1};template=planLayout(t,catalog,31,{devicesPerArm:3});if(!template.validation.valid)throw new Error('Cluster failed '+key);templates.set(key,template);}
 const col=i%12,row=Math.floor(i/12),yaw=(col+row)%3===0?180:0,arm={id:'arm-'+(i+1),x:snap(2+col*3.1+(row%2)*.2),y:snap(3+row*3.4+(col%3)*.1),yaw};layout.robots.push(arm);
 const origin=template.layout.robots[0];for(const d of template.layout.devices){const delta=rotate([d.x-origin.x,d.y-origin.y],yaw),n=inventory[d.model]=(inventory[d.model]??0)+1;layout.devices.push({...d,id:d.model+'-'+n,x:snap(arm.x+delta[0]),y:snap(arm.y+delta[1]),rotation:(d.rotation+yaw)%360,input_robot_id:arm.id,output_robot_id:arm.id});}
}
const futureJobs=[],pinned={};
// Preserve prepared sample identity, then work locally before sending the sample
// across the room for a final analysis/recovery step. This is a declared demo
// policy; it is not one of the ranked benchmark contestants.
const rootCaps=['liquid_handler','grinder','sonicator'];
for(let wave=0;wave<3;wave++)for(const cap of rootCaps){
 const model='flex_'+cap;
 for(const rootDevice of layout.devices.filter(d=>d.model===model).sort((a,b)=>a.id.localeCompare(b.id))){
  const local=layout.devices.filter(d=>d.input_robot_id===rootDevice.input_robot_id),caps=local.map(d=>d.model.replace('flex_',''));caps.splice(caps.indexOf(cap),1);caps.unshift(cap);
  const final=caps.includes('xrd')?'centrifuge':'xrd';caps.push(final);
  const [j]=jobsFor(1,[{name:cap==='grinder'?'Solid-state':'Liquid-phase',caps}],futureJobs.length);j.priority=1000-wave*50;j.nodes.forEach((n,k)=>{n.duration_s=24+((futureJobs.length+k)%5)*6;n.program[0].duration_s=n.duration_s;n.compatibility_key=hash([n.capability,n.program]);});futureJobs.push(j);
  const routes={};j.nodes.forEach((n,k)=>{const own=local.find(d=>(d.model.replace('flex_',''))===n.capability);if(k<3&&own)routes[n.id]=own.id;else{const candidates=layout.devices.filter(d=>d.model.replace('flex_','')===n.capability),dest=candidates[(futureJobs.length+wave*3)%candidates.length];routes[n.id]=dest.id;}});pinned[j.id]=routes;
 }
}
const future=bundleFor('cinematic-future-v2',[39,30],inventory,96,18,futureJobs,layout);future.demo_routes=pinned;future.task.simulation_cutoff_s=480;
async function executeWindow(bundle){
 const p=placeExact(bundle.task,bundle.request);if(!p.validation.valid)throw new Error(JSON.stringify(p.validation.errors));console.log('future geometry / global fleet validated');
 const env=new CountEnvironment(p.native);for(const a of [{type:'set_layout',layout:p.layout},{type:'start'}]){const r=env.apply({...a,state_version:env.version});if(!r.accepted)throw new Error(JSON.stringify(r));}
 let actions=0;while(env.phase!=='done'){
  const o=env.observe({clone:false}),a=chooseHallAction(o,'fixed');if(a.type==='admit'){a.routes=bundle.demo_routes[a.job_id];a.reason='Cinematic task policy: preserve prepared sample station, local preparation, then cross-room analysis.';}
  const receipt=env.apply(a);if(!receipt.accepted)throw new Error(JSON.stringify({a,receipt}));if(++actions%100===0)console.log('future actions='+actions+' t='+env.time.toFixed(1));
 }
 const replay=env.result();replay.metrics={elapsed_s:env.time,completed_jobs:replay.jobs.filter(j=>j.status==='done').length,total_jobs:replay.jobs.length};
 return {status:replay.terminal_reason==='completed'?'completed':'truncated',result_origin:'simulation',valid:true,terminal_reason:replay.terminal_reason,metrics:{...replay.metrics,makespan_s:replay.terminal_reason==='completed'?env.time:null},installed_resources:{equipment_counts:bundle.request.equipment_counts,arms:replay.layout.robots.length,amrs:replay.fleet.length},replay};
}
const manifest={version:'cinematic-media-2',created_at:new Date().toISOString(),git_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),node:process.version,command:'node --experimental-loader ./scripts/media-route-cache-loader.mjs scripts/prepare-cinematic-media.mjs',engine_source_hashes:sourceManifest(),route_cache_loader_sha256:sha(fs.readFileSync(new URL('./media-route-cache-loader.mjs',import.meta.url))),sources:{}};
for(const [key,bundle]of [['present',present],['future',future]]){
 const input=path.join(out,'sources',key+'-input.json'),dest=path.join(out,'sources',key+'.json');
 let r;if(fs.existsSync(dest)){if(hash(JSON.parse(fs.readFileSync(input)))!==hash(bundle))throw new Error('Preserve old demo before changing input');r=JSON.parse(fs.readFileSync(dest));}
 else{fs.writeFileSync(input,JSON.stringify(bundle,null,2));console.log('Executing '+key+' '+bundle.request.arm_count+' arms / '+bundle.request.amr_count+' AMRs');r=bundle.demo_routes?await executeWindow(bundle):await evaluateCounts(bundle,bundle.request,{onProgress:p=>{if(p.phase==='placement')console.log(key,p);}});fs.writeFileSync(dest,JSON.stringify(r));}
 if(!r.valid||!r.replay||!['completed','truncated'].includes(r.status))throw new Error(key+' '+JSON.stringify(r.failure??r.violations));
 manifest.sources[key]={kind:'synthetic-cinematic-demo',input_sha256:sha(fs.readFileSync(input)),result_sha256:sha(fs.readFileSync(dest)),metrics:r.metrics,concurrency:concurrency(r.replay),installed_resources:r.installed_resources};console.log(key,JSON.stringify({makespan:r.metrics.makespan_s,...manifest.sources[key].concurrency}));
}
const published=JSON.parse(fs.readFileSync(path.join(root,'benchmark/published/manifest.json')));
for(const [key,id,method]of [['benchmark','12-overfull-inventory','gpt-6-luna-medium'],['luna','11-priority-tail','gpt-6-luna-medium'],['jev','11-priority-tail','jev'],['ui','04-staggered-jobs','heuristic']]){
 const e=published.files.find(e=>e.task_id.endsWith(id)&&e.method===method),bytes=gunzipSync(fs.readFileSync(path.join(root,'benchmark/published',e.path)));if(sha(bytes)!==e.source_sha256)throw new Error('Recording hash mismatch');fs.writeFileSync(path.join(out,'sources',key+'.json'),bytes);manifest.sources[key]={...e,decoded_sha256:sha(bytes)};
}
fs.writeFileSync(path.join(out,'sources/catalog.json'),JSON.stringify(present.catalog));fs.writeFileSync(path.join(out,'provenance.json'),JSON.stringify(manifest,null,2));
console.log('Prepared '+out);
