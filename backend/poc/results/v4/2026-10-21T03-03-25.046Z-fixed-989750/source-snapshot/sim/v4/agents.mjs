import {performance} from 'node:perf_hooks';
import {HallEnvironment} from './environment.mjs';
import {catalog,capabilities,planHall,matches,programPhases,physicalCapacity} from './tasks.mjs';
const durationCache=new Map();
const work=(n,d)=>{const key=n.compatibility_key+':'+d.model;if(!durationCache.has(key))durationCache.set(key,programPhases(n,catalog.equipment[d.model]).reduce((s,p)=>s+p.duration_s,0)+20);return durationCache.get(key);};
function committed(o,id){return o.jobs.some(j=>j.admitted_s!==undefined&&j.nodes.some(n=>n.status!=='done'&&j.routes[n.id]===id));}
function retoolAction(o){
 if(o.resources.configuration_cart_available_s>o.time_s+1e-7)return null;
 const commitments=new Set(o.jobs.filter(j=>j.admitted_s!==undefined).flatMap(j=>j.nodes.filter(n=>n.status!=='done').map(n=>j.routes[n.id])));
 const demand=Object.fromEntries(capabilities.map(c=>[c,0])),counts=Object.fromEntries(capabilities.map(c=>[c,o.layout.devices.filter(d=>d.model==='flex_'+c).length]));
 for(const j of o.jobs)for(const n of j.nodes)if(n.status==='pending'&&capabilities.includes(n.capability))demand[n.capability]+=n.duration_s*(j.arrival_s>o.time_s?.25:1);
 const target=capabilities.filter(c=>demand[c]>0&&o.resources.module_stock[c]>0).sort((a,b)=>demand[b]/Math.max(.15,counts[b])-demand[a]/Math.max(.15,counts[a]));
 let best=null;
 for(const cap of target)for(const d of o.layout.devices){if(!d.model.startsWith('flex_')||d.model==='flex_'+cap||o.resources.devices[d.id].available_s>o.time_s+1e-7||commitments.has(d.id))continue;const from=d.model.slice(5);if(counts[from]<=1&&demand[from]>0)continue;
  const before=Math.max(...capabilities.map(c=>demand[c]/Math.max(.15,counts[c]))),after=Math.max(...capabilities.map(c=>demand[c]/Math.max(.15,counts[c]+(c===cap?1:0)-(c===from?1:0)))),gain=before-after;
  if(counts[cap]===0||gain>o.task.setup_s*1.5){const score=counts[cap]===0?1e9+demand[cap]:gain;if(!best||score>best.score)best={score,device:d,cap,from,gain};}
 }
 return best?{state_version:o.state_version,type:'reconfigure',device_id:best.device.id,capability:best.cap,reason:`Visible ${best.cap.replaceAll('_',' ')} demand: exchange idle ${best.from} module; reserve commissioning cart and arm for ${o.task.setup_s}s. Existing experiments keep running.`}:null;
}
function routingState(o){
 const credits=Object.fromEntries(o.resources.buffers.map(b=>[b.robot_id,b.future_credits])),load=Object.fromEntries(o.layout.devices.map(d=>[d.id,Math.max(0,o.resources.devices[d.id].available_s-o.time_s)]));
 for(const job of o.jobs)if(job.admitted_s!==undefined)for(const n of job.nodes)if(n.status==='pending'){const d=o.layout.devices.find(d=>d.id===job.routes[n.id]);if(d)load[d.id]+=work(n,d)/physicalCapacity(catalog.equipment[d.model],o.task.batch_slots);}
 return {credits,load};
}
function routeJob(o,j,state){
 const credits={...state.credits},load={...state.load};
 const routes={};let prior=null;
 for(const n of j.nodes){const outputs=j.nodes.filter(c=>c.parents.includes(n.id)).length,candidates=o.layout.devices.filter(d=>matches(n.capability,d)&&credits[d.output_robot_id]+outputs<=o.task.buffer_slots).map(d=>({d,score:load[d.id]+(prior?Math.hypot(prior.x-d.x,prior.y-d.y)*15:0)})).sort((a,b)=>a.score-b.score||a.d.id.localeCompare(b.d.id));if(!candidates.length)return null;const d=candidates[0].d;routes[n.id]=d.id;credits[d.output_robot_id]+=outputs;load[d.id]+=work(n,d)/physicalCapacity(catalog.equipment[d.model],o.task.batch_slots);prior=d;}
 return routes;
}
export function chooseHallAction(o,policy='adaptive'){
 const stamp={state_version:o.state_version};
 if(o.phase==='done')return null;
 if(o.phase==='design'){if(o.layout.devices.length)return {...stamp,type:'start'};const p=planHall(o.task);return p.validation.valid?{...stamp,type:'set_layout',layout:p.layout}:{...stamp,type:'stop',reason:'Reference layout search failed; this is not an infeasibility proof.'};}
 if(policy==='adaptive'){const a=retoolAction(o);if(a)return a;}
 const groups=[];
 for(const d of o.layout.devices){const state=o.resources.devices[d.id];if(state.available_s>o.time_s+1e-7)continue;const ready=o.ready.filter(r=>r.device_id===d.id),byKey=new Map();for(const r of ready){if(!byKey.has(r.compatibility_key))byKey.set(r.compatibility_key,[]);byKey.get(r.compatibility_key).push(r);}
  for(const group of byKey.values()){group.sort((a,b)=>b.priority-a.priority||a.due_s-b.due_s||a.job_id.localeCompare(b.job_id));const members=group.slice(0,state.batch_slots),first=members[0],job=o.jobs.find(j=>j.id===first.job_id),node=job.nodes.find(n=>n.id===first.node_id);groups.push({device:d,ops:members,score:node.parents.length*20+members.length/state.batch_slots*10+job.priority});}
 }
 groups.sort((a,b)=>b.score-a.score||a.device.id.localeCompare(b.device.id));
 if(groups.length){const {device,ops}=groups[0];return {...stamp,type:'dispatch',device_id:device.id,operations:ops.map(r=>({job_id:r.job_id,node_id:r.node_id})),reason:`Shared-room dispatch: ${ops.length} compatible ${ops[0].capability} operations. Future output buffers already credited.`};}
 const waiting=o.jobs.filter(j=>j.arrival_s<=o.time_s&&j.admitted_s===undefined).sort((a,b)=>b.priority-a.priority||a.arrival_s-b.arrival_s||a.id.localeCompare(b.id));
 const state=waiting.length?routingState(o):null,seen=new Set();
 for(const j of waiting.slice(0,64)){const key=JSON.stringify(j.nodes.map(n=>[n.capability,n.compatibility_key,n.id,n.parents]));if(seen.has(key))continue;seen.add(key);const routes=routeJob(o,j,state);if(routes)return {...stamp,type:'admit',job_id:j.id,routes,reason:`Route ${j.line} workflow through shared stations; reserve per-arm future buffer credits.`};}
 return o.next_event_s!==null?{...stamp,type:'wait'}:{...stamp,type:'stop',reason:'No feasible dispatch, admission, reconfiguration or future event.'};
}
export async function runHall(task,{policy='adaptive',onProgress=null}={}){
 if(!['fixed','adaptive'].includes(policy))throw new Error('Unknown hall reference policy');const env=new HallEnvironment(task),started=performance.now();let guard=0;
 while(env.phase!=='done'){
  const o=env.observe({clone:false}),a=chooseHallAction(o,policy),receipt=env.apply(a);if(!receipt.accepted){env.finish('reference_action_rejected');break;}if(++guard%200===0)onProgress?.({time_s:env.time,completed:env.jobs.filter(j=>j.status==='done').length,actions:env.actions,reconfigurations:env.reconfigurations.length});
 }
 const r=env.result();r.policy=policy;r.metrics.host_runtime_ms=performance.now()-started;r.evidence.agent=`Deterministic ${policy} shared-room reference; not an LLM`;return r;
}
