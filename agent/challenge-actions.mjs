import {MODEL_IDS} from '../backend/counts/tasks.mjs';
import {placeExact} from '../backend/counts/evaluator.mjs';
import {packedCellLayout,stationTemplate} from './layout-packing.mjs';

export const isChallenge=o=>o.context.placement_policy==='dense-cell-candidates-v2';
const taskFrom=o=>({schema_version:'0.2',task_id:o.context.task_id,version:o.context.task_version,
  room:o.context.room,resource_limits:o.context.resource_limits,simulation_seed:o.context.simulation_seed,
  simulation_cutoff_s:o.context.simulation_cutoff_s,jobs:o.jobs.map(j=>({id:j.job_id,arrival_s:j.arrival_s,nodes:j.nodes.map(n=>({id:n.node_id,capability:n.required_capability,parents:n.depends_on,duration_s:n.process_s}))})),
  workload_parameters:{family:'screening-mix',jobs:1,seed:o.context.simulation_seed,benches:7,furnaces:0,ovens:0,xrd:0,amrs:1,batch_slots:1,buffer_slots:o.context.buffer_slots},
  policies:{placement:o.context.placement_policy,inventory:o.context.inventory_policy},external_staging:o.context.external_staging});
const instances=counts=>Object.entries(counts).flatMap(([model,n])=>Array.from({length:n},(_,i)=>({id:model+'-'+(i+1),model})));

// Offered sets are workload-independent combinatorial alternatives. No expected
// score or simulator rollout is supplied by the benchmark to any contestant.
function cohorts(counts,slots){
  const models=Object.keys(counts).filter(k=>counts[k]>0),sets=models.map(m=>[m]);
  if(slots>=2)for(let i=0;i<models.length;i++)for(let j=i;j<models.length;j++)if(i!==j||counts[models[i]]>=2)sets.push([models[i],models[j]]);
  return sets;
}
function activeIds(counts,models){const seen={};return models.map(m=>m+'-'+(seen[m]=(seen[m]??0)+1));}

export function challengeInitialCandidates(o,legacyLayout){
  const task=taskFrom(o),counts=o.context.resource_limits.equipment,candidates=[];
  const add=(id,description,selected,layout)=>{
    const design={schema_version:'0.2',submission_id:'public-geometry-screen',task_id:task.task_id,task_version:task.version,simulation_seed:task.simulation_seed,
      equipment_counts:selected,arm_count:layout.robots.length,amr_count:task.resource_limits.amrs,layout};
    const validation=placeExact(task,design).validation;
    if(validation.valid)candidates.push({id,description,design});
  };
  if(task.external_staging){
    for(const models of cohorts(counts,Math.min(task.external_staging.max_active_devices,task.resource_limits.arms))){
      const ids=activeIds(counts,models),layout=packedCellLayout(task,counts,{activeIds:ids,columns:2});
      // Keep both arms present even when only one device is initially active.
      if(layout.robots.length===1){const r=layout.robots[0];layout.robots.push({...r,id:'arm-2',x:r.x+1.2});}
      add('active-'+models.map(m=>m.replace('flex_','')).join('+'),'Initially active model set: '+models.join(', ')+'. Remaining selected inventory is outside.',counts,layout);
    }
  }else{
    add('spread-full','Full counts with cells distributed across the room.',counts,legacyLayout(task,counts));
    for(const [id,fraction,reverse]of [['packed-full',1,false],['packed-reverse',1,true],['packed-half',.5,false]]){
      const selected=Object.fromEntries(MODEL_IDS.map(k=>[k,counts[k]?Math.max(1,Math.floor(counts[k]*fraction)):0]));
      add(id,'Cells grouped near intake; '+(fraction===1?'full':'half rounded down, minimum one per type')+' counts'+(reverse?', reversed instrument assignment.':'.'),selected,packedCellLayout(task,selected,{reverse}));
    }
  }
  // Deduplicate physically identical designs; avoid multiple ballot positions
  // for the same layout when every count is one.
  const seen=new Set();return candidates.filter(c=>{const k=JSON.stringify(c.design.layout);if(seen.has(k))return false;seen.add(k);return true;});
}

export function challengeLayoutCandidates(o){
  const candidates=[{id:'keep',description:'Keep current active equipment and layout.'}];
  if(!o.context.external_staging||o.reconfiguration_state.phase!=='idle')return candidates;
  const all=[...o.layout.devices,...o.layout.parked_devices],counts=o.installed_resources.equipment_counts;
  for(const models of cohorts(counts,Math.min(o.context.external_staging.max_active_devices,o.layout.robots.length))){
    const layout=structuredClone(o.layout),remaining=[...models],retained=[];
    for(const d of layout.devices){const i=remaining.indexOf(d.model);if(i>=0){remaining.splice(i,1);retained.push(d);}}
    const used=new Set(retained.map(d=>d.id)),freeArms=layout.robots.filter(r=>!retained.some(d=>d.input_robot_id===r.id));
    const added=remaining.map((m,i)=>{
      const d=all.find(d=>d.model===m&&!used.has(d.id));used.add(d.id);const r=freeArms[i],t=stationTemplate(m);
      return {id:d.id,model:m,x:Math.round((r.x+t.dx)*10)/10,y:Math.round((r.y+t.dy)*10)/10,rotation:t.rotation,input_robot_id:r.id,output_robot_id:r.id};
    });
    layout.devices=[...retained,...added];layout.parked_devices=all.filter(d=>!used.has(d.id)).map(({id,model})=>({id,model}));
    if(added.length===0&&retained.length===o.layout.devices.length)continue;
    candidates.push({id:'active-'+models.map(m=>m.replace('flex_','')).join('+'),description:'Drain admitted jobs, then physically exchange to '+models.join(', ')+'. Pay disconnect, handling, travel, reconnect and calibration.',layout});
  }
  return candidates;
}
