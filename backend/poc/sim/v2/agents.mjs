import {planLayout} from './geometry.mjs';
import {BenchmarkEnvironment} from './environment.mjs';
import {catalog,createTask} from './tasks.mjs';
export const policies=['fifo','shortest','batch-aware'];
export function chooseAction(observation,policy='batch-aware'){
 const o=observation,stamp={state_version:o.state_version};
 if(o.phase==='design'){
  if(o.layout.devices.length)return {...stamp,type:'start'};
  const plan=planLayout(o.task,catalog,o.task.seed);return plan.validation.valid?{...stamp,type:'set_layout',layout:plan.layout}:{...stamp,type:'stop',reason:'No feasible reference layout found'};
 }
 if(o.phase==='done')return null;
 const admitted=o.jobs.filter(j=>j.status==='active').length;
 const frontiers=o.jobs.map(j=>{const fanouts=j.nodes.map(n=>j.nodes.filter(c=>c.parents.includes(n.id)).length);return {frontier:1+fanouts.reduce((n,k)=>n+Math.max(0,k-1),0),fanout:Math.max(1,...fanouts)};});
 // Conservative admission bound: leave output space even if all WIP converges on one arm.
 const maxFrontier=Math.max(1,...frontiers.map(f=>f.frontier)),maxFanout=Math.max(1,...frontiers.map(f=>f.fanout)),wipLimit=Math.max(1,Math.floor((o.task.buffer_slots-maxFanout)/maxFrontier));
 const groups=[];
 for(const device of o.layout.devices){
  const state=o.resources.devices[device.id];if(state.available_s>o.time_s+1e-7)continue;
  const candidates=o.ready.filter(r=>{const match=r.capability===device.model||(r.capability==='furnace'&&device.model==='furnace_large');if(!match)return false;const job=o.jobs.find(j=>j.id===r.job_id);return policy!=='batch-aware'||job.status==='active'||admitted<wipLimit;});
  const byKey=new Map();for(const r of candidates){if(!byKey.has(r.compatibility_key))byKey.set(r.compatibility_key,[]);byKey.get(r.compatibility_key).push(r);}
  for(const group of byKey.values()){
   group.sort((a,b)=>{const ja=o.jobs.find(j=>j.id===a.job_id),jb=o.jobs.find(j=>j.id===b.job_id);return policy==='shortest'?ja.nodes.find(n=>n.id===a.node_id).duration_s-jb.nodes.find(n=>n.id===b.node_id).duration_s:policy==='batch-aware'?(b.priority-a.priority)||(a.due_s-b.due_s):ja.arrival_s-jb.arrival_s||ja.id.localeCompare(jb.id);});
   let newlyAdmitted=0;const eligible=group.filter(r=>{if(policy!=='batch-aware'||o.jobs.find(j=>j.id===r.job_id).status==='active')return true;return newlyAdmitted++<wipLimit-admitted;});if(!eligible.length)continue;
   const ops=eligible.slice(0,policy==='batch-aware'?state.batch_slots:1),sample=ops[0],job=o.jobs.find(j=>j.id===sample.job_id),node=job.nodes.find(n=>n.id===sample.node_id),outputs=job.nodes.filter(n=>n.parents.includes(node.id)).length,buffer=o.resources.buffers.find(b=>b.robot_id===device.output_robot_id),consumed=ops.reduce((sum,r)=>{const j=o.jobs.find(j=>j.id===r.job_id),n=j.nodes.find(n=>n.id===r.node_id);return sum+n.parents.filter(p=>o.resources.sample_tokens.some(t=>t.job_id===j.id&&t.parent_id===p&&t.child_id===n.id&&t.robot_id===device.output_robot_id)).length;},0);
   if(buffer.occupied_and_reserved+outputs*ops.length-consumed>buffer.capacity)continue;
   const maintenance=o.task.maintenance.find(w=>w.model===device.model&&device.id.endsWith('-'+w.device_index)&&o.time_s<w.end_s);if(maintenance&&o.time_s>=maintenance.start_s-20000)continue;
   const score=policy==='batch-aware'?ops.length/state.batch_slots*100+job.priority*30+node.parents.length*5:policy==='shortest'?-node.duration_s:-job.arrival_s;
   groups.push({device,ops,score});
  }
 }
 groups.sort((a,b)=>b.score-a.score||a.device.id.localeCompare(b.device.id));
 if(groups.length){const {device,ops}=groups[0];return {...stamp,type:'dispatch',device_id:device.id,operations:ops.map(r=>({job_id:r.job_id,node_id:r.node_id})),reason:policy==='batch-aware'?`Compatible campaign: ${ops.length} / ${o.resources.devices[device.id].batch_slots} slots; downstream buffer reserved.`:policy==='shortest'?'Shortest ready operation first.':'First-arrived ready job; single-sample baseline.'};}
 if(o.next_event_s!==null)return {...stamp,type:'wait'};
 return {...stamp,type:'stop',reason:'No dispatchable operation or future event'};
}
export function runTask(task,policy='batch-aware',onAction=null){
 if(!policies.includes(policy))throw new Error('Unknown reference policy');
 const env=new BenchmarkEnvironment(task);let consecutiveRejected=0;
 while(env.phase!=='done'){
  const observation=env.observe(),action=chooseAction(observation,policy),receipt=env.apply(action);onAction?.({action,receipt});
  if(!receipt.accepted){consecutiveRejected++;if(consecutiveRejected>3){env.finish('reference_policy_stalled');break;}if(env.nextEvent()!==null)env.apply({type:'wait',state_version:env.version});else {env.finish('reference_policy_stalled');break;}}
  else consecutiveRejected=0;
 }
 const result=env.result();result.evidence.agent='Deterministic '+policy+' reference policy using public observation/action interface; not an LLM';return result;
}
export const simulate=(id,parameters={},policy='batch-aware')=>runTask(createTask(id,parameters),policy);
