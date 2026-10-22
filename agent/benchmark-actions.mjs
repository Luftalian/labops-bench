import {catalog} from '../backend/poc/sim/v4/tasks.mjs';
import {planLayout} from '../backend/poc/sim/v2/geometry.mjs';
import {nativeTask,MODEL_IDS} from '../backend/counts/tasks.mjs';
import {decisionEnvelope} from './scheduler-controller.mjs';
import {isChallenge,challengeInitialCandidates,challengeLayoutCandidates} from './challenge-actions.mjs';

const templates=new Map(), snap=v=>Math.round(v/.1)*.1;
function template(model) {
  if(!templates.has(model)) {
    const task={room:{width_m:4,depth_m:4,obstacles:[],cutouts:[]},intake:[.5,3.5],robot_budget:1,
      inventory:{[model]:1},required_capabilities:[],buffer_slots:8};
    const p=planLayout(task,catalog,17,{devicesPerArm:1});
    if(!p.validation.valid)throw new Error('No cell template for '+model);
    const a=p.layout.robots[0],d=p.layout.devices[0];
    templates.set(model,{...d,dx:d.x-a.x,dy:d.y-a.y});
  } return templates.get(model);
}
export function cellLayout(task,counts,{reverse=false,activeModel=null}={}) {
  let entries=Object.entries(counts).flatMap(([model,n])=>Array.from({length:n},(_,i)=>({id:model+'-'+(i+1),model})));
  const parked=[];
  if(activeModel)entries=entries.filter(d=>{if(d.model===activeModel)return true;parked.push(d);return false;});
  if(reverse)entries.reverse();
  const n=entries.length,cols=Math.min(n,Math.max(1,Math.ceil(Math.sqrt(n*task.room.width_m/task.room.depth_m)))),rows=Math.ceil(n/cols);
  const layout={devices:[],robots:[]};
  for(const [i,d] of entries.entries()) {
    const t=template(d.model),arm={id:'arm-'+(i+1),x:snap((i%cols+.5)*task.room.width_m/cols),
      y:snap((Math.floor(i/cols)+.5)*task.room.depth_m/rows-.3),yaw:0};
    const x=task.external_staging?.gate.x??snap(arm.x+t.dx);
    if(task.external_staging)arm.x=snap(x-t.dx);
    layout.robots.push(arm);layout.devices.push({...d,x,y:snap(arm.y+t.dy),rotation:t.rotation,input_robot_id:arm.id,output_robot_id:arm.id});
  }
  if(task.external_staging)layout.parked_devices=parked;
  return layout;
}
export function initialCandidates(o) {
  if(isChallenge(o))return challengeInitialCandidates(o,cellLayout);
  const task={room:o.context.room,external_staging:o.context.external_staging},counts=o.context.resource_limits.equipment;
  const models=Object.entries(counts).filter(([,n])=>n>0).map(([m])=>m);
  const candidates=[];
  for(const [id,fraction,reverse] of [['capacity',1,false],['reverse',1,true],['compact',.5,false]]) {
    const selected=Object.fromEntries(MODEL_IDS.map(k=>[k,counts[k]?Math.max(1,Math.floor(counts[k]*fraction)):0]));
    const activeModel=task.external_staging?models.find(m=>o.jobs.some(j=>j.arrival_s===0&&j.nodes.some(n=>'flex_'+n.required_capability===m)))??models[0]:null;
    const layout=cellLayout(task,selected,{reverse,activeModel});
    const design={schema_version:'0.2',task_id:o.context.task_id,task_version:o.context.task_version,
      simulation_seed:o.context.simulation_seed,equipment_counts:selected,arm_count:layout.robots.length,
      amr_count:Math.min(o.context.resource_limits.amrs,id==='compact'?1:o.context.resource_limits.amrs),layout};
    candidates.push({id,description: id==='capacity'?'Install maximum offered parallel station cells.':id==='reverse'?'Same counts, reversed instrument-to-cell assignment.':'Use half of each multi-instance instrument count, fewer arms and one AMR.',design});
  }
  // Existing synthetic scheduler tasks allow 8 arms for 12 device ceilings.
  // The one-arm-per-cell menu must offer only feasible selections; do not
  // change the task ceilings or silently shrink an installed design.
  return o.context.task_id.startsWith('scheduler-room-')
    ? candidates.filter(c=>c.design.arm_count<=o.context.resource_limits.arms)
    : candidates;
}
export function layoutCandidates(o) {
  if(isChallenge(o))return challengeLayoutCandidates(o);
  const candidates=[{id:'keep',description:'Keep current layout; avoid draining or movement.'}];
  if(!o.context.external_staging||o.reconfiguration_state.phase!=='idle')return candidates;
  const slot=o.layout.devices[0];
  for(const d of o.layout.parked_devices??[]) {
    const layout=structuredClone(o.layout);
    layout.devices=[{...slot,id:d.id,model:d.model}];
    layout.parked_devices=[...o.layout.parked_devices.filter(p=>p.id!==d.id),{id:slot.id,model:slot.model}];
    candidates.push({id:'activate-'+d.id,description:'Drain committed work, remove '+slot.id+' and bring in '+d.id+' via external storage; no module conversion.',layout});
  }
  return candidates;
}
export function actionMenu(o) {
  return o.phase==='initial_design'?initialCandidates(o):layoutCandidates(o);
}
export function decisionFromAnswer(o,answer,menu=actionMenu(o)) {
  if(!menu.some(c=>c.id===answer.layout_choice))throw new Error('Invalid candidate choice');
  if(!Array.isArray(answer.priorities)||answer.priorities.length!==o.jobs.length||
    new Set(answer.priorities.map(p=>p.job_id)).size!==o.jobs.length||answer.priorities.some(p=>!o.jobs.some(j=>j.job_id===p.job_id)||!Number.isInteger(p.priority)||p.priority<0||p.priority>1000))throw new Error('Invalid job priorities');
  const d={...decisionEnvelope(o),type:o.phase,reason:answer.reason??'Public candidate decision',priorities:answer.priorities};
  const candidate=menu.find(c=>c.id===answer.layout_choice);
  if(o.phase==='initial_design')d.initial_design={...structuredClone(candidate.design),submission_id:d.decision_id};
  else d.reconfiguration=candidate.id==='keep'?{mode:'keep'}:{mode:'replace_layout',layout:candidate.layout};
  return d;
}
export function heuristicAnswer(o,menu=actionMenu(o)) {
  // Capacity first; priorities use longest remaining critical chain, with age
  // and arrived/future status. No simulator rollout or hidden result is used.
  let choice=menu[0].id;
  if(o.phase!=='initial_design'&&o.context.external_staging) {
    const demand=model=>o.jobs.filter(j=>j.arrival_s<=o.time_s+o.config.decision_interval_s).reduce((s,j)=>s+j.nodes.filter(n=>n.status!=='completed'&&'flex_'+n.required_capability===model).reduce((a,n)=>a+n.remaining_process_s,0),0);
    const active=o.layout.devices[0];
    if(demand(active.model)===0) {
      const target=menu.slice(1).sort((a,b)=>demand(b.layout.devices[0].model)-demand(a.layout.devices[0].model))[0];
      if(target&&demand(target.layout.devices[0].model)>0)choice=target.id;
    }
  }
  const sorted=[...o.jobs].sort((a,b)=>Number(b.arrival_s<=o.time_s)-Number(a.arrival_s<=o.time_s)||
    b.nodes.reduce((s,n)=>s+n.remaining_process_s,0)-a.nodes.reduce((s,n)=>s+n.remaining_process_s,0)||a.arrival_s-b.arrival_s||a.job_id.localeCompare(b.job_id));
  return {layout_choice:choice,priorities:sorted.map((j,i)=>({job_id:j.job_id,priority:Math.round(1000*(1-i/Math.max(1,sorted.length)))})),
    reason:'Capacity-first cells; arrived jobs then longest remaining process chain, arrival and ID; exchange only when active-model demand clears.'};
}
export const heuristicController=async o=>decisionFromAnswer(o,heuristicAnswer(o));
export const decisionInstructions='Minimize full-workload completion time. Choose one offered layout action and assign every remaining job an integer priority 0..1000 (higher first). Device/arm processing is nonpreemptive. Layout movement drains commitments and costs time. External staging preserves owned instruments. Use only this public state; do not claim chemical predictions or measured performance.';
