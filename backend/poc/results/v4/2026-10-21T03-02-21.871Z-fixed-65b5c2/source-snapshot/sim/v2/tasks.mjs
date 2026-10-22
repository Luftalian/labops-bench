import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {seeded} from './geometry.mjs';
export const catalog=JSON.parse(fs.readFileSync(new URL('./data/catalog.json',import.meta.url)));
export const dataset=JSON.parse(fs.readFileSync(new URL('./data/procedures.json',import.meta.url)));
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const thermal=new Set(['furnace','furnace_large','tube_furnace','oven','hydrothermal']);
export function compileProcedure(p){
  const nodes=[];
  for(const s of p.steps){
    const model=catalog.equipment[s.resource],previous=nodes.at(-1),segment={source_indices:[s.index],action:s.action,temperature_c:typeof s.conditions.temperature==='number'?(s.conditions.temp_unit==='K'?s.conditions.temperature-273.15:s.conditions.temp_unit==='F'?(s.conditions.temperature-32)*5/9:s.conditions.temperature):null,atmosphere:s.conditions.atmosphere??'unspecified',duration_s:s.duration_s??model.process.default_s,duration_source:s.duration_s===null?'catalog-default-assumption':s.duration_source};
    if(thermal.has(s.resource)&&previous?.capability===s.resource){previous.program.push(segment);previous.source_indices.push(s.index);}
    else nodes.push({id:'op-'+nodes.length,capability:s.resource,parents:nodes.length?['op-'+(nodes.length-1)]:[],label:s.action,program:[segment],source_indices:[s.index],recipe_key:p.id,vessel:'standard-50mm',duration_s:segment.duration_s});
  }
  for(const n of nodes){n.duration_s=n.program.reduce((t,s)=>t+s.duration_s,0);n.compatibility_key=digest([n.capability,n.program,n.recipe_key,n.vessel]);}
  return nodes;
}
function op(capability,duration_s,temperature_c=null,extra={}){return {capability,label:capability.replaceAll('_',' '),duration_s,program:[{action:thermal.has(capability)?'dwell':capability,duration_s,temperature_c,atmosphere:'air',duration_source:'synthetic-fixture'}],recipe_key:'oxide-A',vessel:'standard-50mm',...extra};}
const chains={
 'mixed-production':{name:'Mixed production',description:'Short preparation, grinding, pressing, furnace campaigns and XRD share robot and transport resources.',steps:[op('liquid_handler',90),op('stirrer',180),op('grinder',240),op('press',90),op('furnace',1800,800),op('xrd',300)]},
 'batch-campaign':{name:'Batch campaigns',description:'Cold-load compatible recipes together; multiple temperature and atmosphere programs cannot share a batch.',steps:[op('grinder',90),op('furnace',3600,900),op('xrd',180)]},
 'wet-chemistry':{name:'Wet chemistry',description:'Small liquid, stirring, separation and drying devices compete for finite buffers.',steps:[op('liquid_handler',75),op('stirrer',240),op('centrifuge',180),op('filter',120),op('oven',600,120)]},
 'thin-film':{name:'Thin-film campus',description:'Large fixed vacuum chambers have directional ports and scarce robot access.',steps:[op('liquid_handler',60),op('deposition',1200),op('epitaxy',1800),op('xrd',300)]},
 'through-flow':{name:'Opposite-port handoff',description:'The flow reactor input and output face opposite directions and need separate reachable arms.',steps:[op('liquid_handler',60),op('flow_reactor',240),op('xrd',180)]},
 'deadline-surge':{name:'Deadline surge',description:'A later urgent cohort competes with routine production. Minimize tardiness as well as completion time.',steps:[op('stirrer',240),op('press',120),op('oven',900,160),op('xrd',300)]},
 'finite-buffers':{name:'Buffer pressure',description:'Only four sample positions per arm; reserving downstream output space prevents overflow.',steps:[op('liquid_handler',45),op('grinder',300),op('press',90),op('xrd',600)]},
 'maintenance':{name:'Planned maintenance',description:'Published equipment downtime windows require choosing another station or postponing a cycle.',steps:[op('grinder',180),op('furnace',1800,750),op('xrd',300)]},
 'obstacle-course':{name:'Constrained floor',description:'A service core and a cut-out floor constrain tool approach and AMR routing.',steps:[op('liquid_handler',90),op('grinder',240),op('press',120),op('oven',900,180)]},
 'fork-join':{name:'Aliquot / join',description:'A declared split produces two tokens; parallel assay branches must both finish before join.',steps:[op('liquid_handler',60),op('stirrer',300),op('sonicator',420),op('liquid_handler',90),op('xrd',240)]},
 'heat-profiles':{name:'Multi-stage heat programs',description:'Contiguous ramp / dwell stages form one cold-loaded batch, with one final cooldown.',steps:[op('press',90),{...op('furnace',2400,600),program:[{action:'dwell',temperature_c:600,duration_s:900,atmosphere:'air',duration_source:'synthetic-fixture'},{action:'dwell',temperature_c:950,duration_s:1500,atmosphere:'air',duration_source:'synthetic-fixture'}]},op('xrd',180)]},
 'mobile-retooling':{name:'Flexible workstations',description:'Rotatable mobile prep stations can be relocated while idle; fixed hot/vacuum instruments stay anchored.',steps:[op('liquid_handler',90),op('stirrer',180),op('grinder',240),op('press',90),op('xrd',300)]}
};
export const suite=Object.entries(chains).flatMap(([family,f])=>['train','validation','test'].map((split,i)=>({id:family+'-'+split,family,split,name:f.name,description:f.description,data_kind:'synthetic-controlled',seed:17+i*113,job_count:i===0?32:48,room:{width_m:family==='thin-film'?10:8,depth_m:6.8,obstacles:family==='obstacle-course'?[{x:3.7,y:3.0,w:.6,h:.8}]:[],cutouts:family==='obstacle-course'?[{x:6.8,y:5.6,w:1.2,h:1.2}]:[]},robot_budget:family==='thin-film'?6:6,buffer_slots:family==='finite-buffers'?4:8,capital_budget:100,horizon_s:14*86400,action_budget:30000,visibility_s:3600,steps:f.steps})));
// Literature tasks are split by source paper, never by replicated job. No original dwell is rescaled.
for(const split of ['train','validation','test']){
 const pool=dataset.procedures.filter(p=>p.split===split&&p.executable);
 for(const [i,p] of pool.entries())suite.push({id:'lemat-'+p.id.toLowerCase()+'-'+split,family:'literature',split,name:p.material+' · '+p.method,description:'Pinned LeMat-Synth model extraction. Missing durations use explicit defaults; no independent chemical validation.',data_kind:'literature-extraction',procedure_id:p.id,seed:71+i,job_count:12,room:{width_m:10,depth_m:7.4,obstacles:[],cutouts:[]},robot_budget:8,buffer_slots:8,capital_budget:150,horizon_s:90*86400,action_budget:30000,visibility_s:86400,steps:compileProcedure(p)});
 const selected=pool.filter((p,i,a)=>a.findIndex(q=>q.method===p.method)===i).slice(0,3);
 suite.push({id:'literature-portfolio-'+split,family:'literature-portfolio',split,name:'Mixed source portfolio',description:'Different public source procedures compete for heterogeneous instruments, batch fixtures and shared handling.',data_kind:'literature-extraction',procedure_ids:selected.map(p=>p.id),seed:121,job_count:24,room:{width_m:12,depth_m:8.6,obstacles:[],cutouts:[]},robot_budget:10,buffer_slots:8,capital_budget:200,horizon_s:90*86400,action_budget:30000,visibility_s:86400,steps:selected.flatMap(p=>compileProcedure(p))});
}
export function createTask(id='mixed-production-train',parameters={}){
  const base=suite.find(t=>t.id===id);if(!base)throw new Error('Unknown v2 task');
  const t=structuredClone(base),permitted=['width_m','depth_m','robot_budget','buffer_slots','job_count','seed','batch_slots','inventory','capital_budget'];
  for(const k of Object.keys(parameters))if(!permitted.includes(k))throw new Error('Unknown parameter '+k);
  for(const k of ['width_m','depth_m'])if(parameters[k]!==undefined){if(!Number.isFinite(parameters[k])||parameters[k]<3||parameters[k]>18)throw new Error('Room dimension must be 3–18 m');t.room[k]=parameters[k];}
  for(const k of ['robot_budget','buffer_slots','job_count','seed','capital_budget'])if(parameters[k]!==undefined){if(!Number.isInteger(parameters[k])||parameters[k]<0||parameters[k]>(k==='seed'?2147483647:k==='job_count'?256:k==='capital_budget'?500:32))throw new Error('Invalid '+k);t[k]=parameters[k];}
  if(t.job_count<1||t.robot_budget<1||t.buffer_slots<1)throw new Error('At least one job, arm and buffer slot are required');
  t.required_capabilities=[...new Set(t.steps.map(s=>s.capability))];
  t.inventory=Object.fromEntries(t.required_capabilities.map(k=>[k,1]));
  if(t.family==='batch-campaign'||t.family==='maintenance')t.inventory.furnace=2;
  if(t.steps.some(s=>s.capability==='furnace'&&s.program.some(p=>p.temperature_c>1100))){delete t.inventory.furnace;t.inventory.furnace_large=1;}
  if(parameters.inventory!==undefined){if(!parameters.inventory||typeof parameters.inventory!=='object'||Array.isArray(parameters.inventory))throw new Error('inventory must be an object');for(const [k,n] of Object.entries(parameters.inventory)){if(!catalog.equipment[k]||!Number.isInteger(n)||n<0||n>16)throw new Error('Invalid inventory entry');}t.inventory=structuredClone(parameters.inventory);}
  if(Object.values(t.inventory).reduce((a,b)=>a+b,0)>64)throw new Error('Inventory limit: 64 instruments');
  if(parameters.batch_slots!==undefined&&(!Number.isInteger(parameters.batch_slots)||parameters.batch_slots<1||parameters.batch_slots>9))throw new Error('batch_slots must be 1–9');
  t.batch_slots=parameters.batch_slots??null;t.intake=[.5,t.room.depth_m-.5];
  const rng=seeded(t.seed);
  t.jobs=Array.from({length:t.job_count},(_,i)=>{
    const source=t.procedure_ids?dataset.procedures.find(p=>p.id===t.procedure_ids[i%t.procedure_ids.length]):t.procedure_id?dataset.procedures.find(p=>p.id===t.procedure_id):null;
    const nodes=structuredClone(t.procedure_ids?compileProcedure(source):t.steps).map((n,j)=>({...n,id:'op-'+j,parents:j?['op-'+(j-1)]:[],source_indices:n.source_indices??[],compatibility_key:''}));
    if(t.family==='fork-join'){nodes[1].parents=['op-0'];nodes[2].parents=['op-0'];nodes[3].parents=['op-1','op-2'];}
    if(t.family==='batch-campaign'){const variant=i%3;nodes[1].program[0].temperature_c=[800,900,950][variant];nodes[1].program[0].atmosphere=variant===2?'nitrogen':'air';nodes[1].recipe_key='campaign-'+variant;}
    for(const n of nodes)n.compatibility_key=digest([n.capability,n.program,n.recipe_key,n.vessel]);
    const arrival=i<4?0:Math.floor((i-4)*75+rng()*45),urgent=t.family==='deadline-surge'&&i>=t.job_count/2;
    return {id:'J'+String(i+1).padStart(3,'0'),name:source?source.material:['Oxide α','Catalyst β','Electrode γ','Film δ'][i%4],procedure_id:source?.id??null,source_kind:t.data_kind,arrival_s:arrival,due_s:arrival+(urgent?3600:86400*4),priority:urgent?3:1,nodes};
  });
  t.maintenance=t.family==='maintenance'?[{model:'furnace',start_s:2000,end_s:6500,device_index:1}]:[];
  delete t.steps;t.config_hash=digest(t);return t;
}
export function physicalCapacity(model,override=null){const b=model.batch;let slots=b.max_slots;if(b.uniform_zone_m){const [w,d]=b.uniform_zone_m,g=b.vessel_gap_m,v=b.vessel_diameter_m;slots=Math.min(slots,Math.floor((w+g)/(v+g))*Math.floor((d+g)/(v+g))*(b.layers??1));}return Math.min(slots,override??slots);}
export function programPhases(node,model){
 const phases=[];let temperature=25;
 for(const s of node.program){let target=s.temperature_c??temperature;
   if(s.action==='cool'){
    const assumed=s.duration_source!=='source-extraction'&&model.process.cool_tau_s;
    if(assumed){target=model.process.unload_c??60;const seconds=temperature>target?model.process.cool_tau_s*Math.log((temperature-25)/(target-25)):0;if(seconds>0)phases.push({kind:'cool',duration_s:seconds,from_c:temperature,to_c:target,source:'Newton-cooling-assumption; missing extracted cooldown duration'});temperature=Math.min(temperature,target);}
    else{target=s.temperature_c??25;phases.push({kind:'cool',duration_s:s.duration_s,from_c:temperature,to_c:target,source:s.duration_source});temperature=target;}
    continue;
   }
   if(model.process.max_temperature_c&&target>model.process.max_temperature_c)throw new Error('temperature_limit');
   if(model.process.ramp_c_min&&s.action!=='cool'&&Math.abs(target-temperature)>.01)phases.push({kind:target>temperature?'ramp':'controlled_cool',duration_s:Math.abs(target-temperature)/model.process.ramp_c_min*60,from_c:temperature,to_c:target,source:'catalog-assumption'});
   phases.push({kind:'process',duration_s:s.duration_s,from_c:target,to_c:target,source:s.duration_source});temperature=target;
 }
 if(model.process.cool_tau_s&&temperature>(model.process.unload_c??60)){const end=model.process.unload_c??60;phases.push({kind:'cool',duration_s:model.process.cool_tau_s*Math.log((temperature-25)/(end-25)),from_c:temperature,to_c:end,source:'Newton-cooling-assumption'});}
 return phases;
}
