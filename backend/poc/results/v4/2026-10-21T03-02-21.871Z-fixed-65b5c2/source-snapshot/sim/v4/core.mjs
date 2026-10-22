import {createFleet,fleetRoom,tourReservations,trafficDelay} from './fleet.mjs';
import {routePath as findRoute,portPose,robotPoint,distance} from '../v2/geometry.mjs';
import {catalog,physicalCapacity,programPhases,validateLayout,matches} from './tasks.mjs';
const copy=structuredClone;
const paths=new WeakMap();
function routePath(from,to,layout,room,catalog){let cache=paths.get(layout);if(!cache){cache=new Map();paths.set(layout,cache);}const key=JSON.stringify([from,to]);if(!cache.has(key))cache.set(key,findRoute(from,to,layout,room,catalog));return cache.get(key);}
// This derived engine preserves v2 transitions. Completed jobs remain in an archive;
// the manager can inject new arrivals until it seals the cell at the end of demand.

const gap=(calendar,start,duration)=>{let t=start;for(const r of [...calendar].sort((a,b)=>a.start_s-b.start_s)){if(t+duration<=r.start_s+1e-8)break;if(t<r.end_s)t=r.end_s;}return t;};
export class SharedEventEngine{
 constructor(task){this.task=copy(task);this.time=0;this.phase='design';this.version=0;this.actions=0;this.invalid=0;this.layout={devices:[],robots:[]};this.trace=[];this.decisions=[];this.batches=[];this.tokens=[];this.calendars={};this.deviceState={};this.carriers=[{id:'amr-1',home:copy(task.intake),at:copy(task.intake),available_s:0}];this.carrier=this.carriers[0];this.traffic=[];this.fleetPaths=new Map();this.jobs=copy(task.jobs).map(j=>({...j,status:'future',completed_s:null,nodes:j.nodes.map(n=>({...n,status:'pending',completed_s:null}))}));this.terminal_reason=null;this.layoutHistory=[];}
 log(type,fields={}){this.decisions.push({time_s:this.time,type,...copy(fields)});}
 readyNodes(){return this.jobs.filter(j=>j.arrival_s<=this.time).flatMap(j=>j.nodes.filter(n=>n.status==='pending'&&n.parents.every(id=>j.nodes.find(x=>x.id===id)?.status==='done')).map(n=>({job:j,node:n})));}
 observe(){const publicTask=copy(this.task);delete publicTask.jobs;return {protocol:'labops.v2',last_receipt:copy(this.lastReceipt??null),state_version:this.version,time_s:this.time,phase:this.phase,task:publicTask,layout:copy(this.layout),jobs:copy(this.jobs.filter(j=>j.arrival_s<=this.time+this.task.visibility_s)),ready:this.readyNodes().map(({job,node})=>({job_id:job.id,node_id:node.id,capability:node.capability,compatibility_key:node.compatibility_key,due_s:job.due_s,priority:job.priority})),resources:{devices:copy(this.deviceState),sample_tokens:copy(this.tokens),buffers:this.layout.robots.map(r=>({robot_id:r.id,capacity:this.task.buffer_slots,occupied_and_reserved:this.tokens.filter(t=>t.robot_id===r.id).length})),carrier:copy(this.carrier)},next_event_s:this.nextEvent(),action_budget_remaining:this.task.action_budget-this.actions,terminal_reason:this.terminal_reason,geometry_scope:'directional-port / reach-envelope / body-clearance / carrier path; articulated IK is not certified'};}
 reject(code,detail={}){this.invalid++;this.log('rejected',{code,...detail});return this.lastReceipt={accepted:false,code,...detail,state_version:this.version};}
 apply(action){
  if(this.phase==='done')return {accepted:false,code:'episode_terminal',state_version:this.version};
  this.actions++;this.version++;
  if(this.actions>this.task.action_budget){this.finish('action_budget');return this.reject('action_budget');}
  if(!action||typeof action!=='object'||Array.isArray(action))return this.reject('invalid_action');
  if(action.state_version!==this.version-1)return this.reject('stale_state',{expected:this.version});
  const fields={validate_layout:['layout'],set_layout:['layout'],start:[],dispatch:['device_id','operations'],wait:['until_s'],stop:[]}[action.type];
  if(!fields)return this.reject('unknown_action_type');if(Object.keys(action).some(k=>!['state_version','type','reason',...fields].includes(k))||action.reason!==undefined&&(typeof action.reason!=='string'||action.reason.length>1000))return this.reject('invalid_action_fields');
  try{
   switch(action.type){
    case 'validate_layout':{const v=validateLayout(action.layout,this.task,catalog);this.log('layout_probe',{valid:v.valid,errors:v.errors});return this.lastReceipt={accepted:true,validation:v,state_version:this.version};}
    case 'set_layout':{
      if(this.phase!=='design')return this.reject('design_phase_required');const v=validateLayout(action.layout,this.task,catalog);if(!v.valid)return this.reject('invalid_layout',{validation:v});
      this.layout=copy(action.layout);this.layoutHistory.push({time_s:this.time,layout:copy(this.layout)});this.validation=v;this.log('layout_committed',{device_count:this.layout.devices.length,robot_count:this.layout.robots.length,cost:v.installed_cost});break;
    }
    case 'start':{
      if(this.phase!=='design')return this.reject('design_phase_required');const v=validateLayout(this.layout,this.task,catalog);if(!v.valid)return this.reject('invalid_layout',{validation:v});const fleet=createFleet(this.layout,this.task,catalog);this.carriers=fleet;this.carrier=fleet[0];this.phase='running';
      for(const d of this.layout.devices)this.deviceState[d.id]={available_s:0,last_recipe:null,batch_slots:physicalCapacity(catalog.equipment[d.model],this.task.batch_slots)};
      for(const r of this.layout.robots)this.calendars[r.id]=[];this.log('episode_started');this.refresh();break;
    }
    case 'dispatch':{if(this.phase!=='running')return this.reject('running_phase_required');const receipt=this.dispatch(action);if(!receipt.accepted)return receipt;break;}
    case 'wait':{if(this.phase!=='running')return this.reject('running_phase_required');const next=this.nextEvent();let until=action.until_s??next??this.task.horizon_s;if(!Number.isFinite(until)||until<=this.time||until>this.task.horizon_s)return this.reject('invalid_wait');if(next!==null)until=Math.min(until,next);this.time=until;this.refresh();if(this.time>=this.task.horizon_s)this.finish('time_horizon');break;}
    case 'relocate':{
      if(this.phase!=='running')return this.reject('running_phase_required');const old=this.layout.devices.find(d=>d.id===action.device_id);if(!old)return this.reject('unknown_device');if(catalog.equipment[old.model].mobility!=='mobile')return this.reject('fixed_device');
      if(this.batches.some(b=>b.end_s>this.time))return this.reject('quiescent_facility_required',{detail:'Relocation is an explicit stop-the-line intervention; no in-flight transport or process may be invalidated.'});
      const layout=copy(this.layout),target=layout.devices.find(d=>d.id===old.id);for(const k of ['x','y','rotation','input_robot_id','output_robot_id'])if(action[k]!==undefined)target[k]=action[k];const v=validateLayout(layout,this.task,catalog);if(!v.valid)return this.reject('invalid_layout',{validation:v});this.layout=layout;this.layoutHistory.push({time_s:this.time,layout:copy(this.layout)});const duration=120+distance([old.x,old.y],[target.x,target.y])/.1;this.trace.push({resource:old.id,kind:'setup',start_s:this.time,end_s:this.time+duration,job_ids:[]});this.deviceState[old.id].available_s=this.time+duration;this.log('relocated',{device_id:old.id,duration_s:duration});break;
    }
    case 'stop':this.log('agent_stopped',{reason:action.reason??null});this.finish('agent_stopped');break;
    default:return this.reject('unknown_action_type');
   }
   return this.lastReceipt={accepted:true,state_version:this.version};
  }catch(error){return this.reject('invalid_action',{message:error.message});}
 }
 reserve(calendar,start,duration,segment,trace){let at=gap(calendar,start,duration);const robot=this.layout.robots.find(r=>r.id===segment.resource);if(robot){let conflict;do{conflict=[...(this.futureArmReservations??[]),...trace].find(s=>{const other=this.layout.robots.find(r=>r.id===s.resource);return other&&other.id!==robot.id&&distance([robot.x,robot.y],[other.x,other.y])<catalog.robot.reach_m*2&&at<s.end_s&&at+duration>s.start_s;});if(conflict)at=gap(calendar,conflict.end_s,duration);}while(conflict);}const entry={start_s:at,end_s:at+duration,...segment};calendar.push(entry);trace.push(entry);return entry;}
 dispatch(a){
  for(const k of Object.keys(this.calendars))this.calendars[k]=this.calendars[k].filter(s=>s.end_s>this.time);
  this.futureArmReservations=Object.values(this.calendars).flat();
  const device=this.layout.devices.find(d=>d.id===a.device_id);if(!device)return this.reject('unknown_device');const state=this.deviceState[device.id],model=catalog.equipment[device.model];
  if(state.available_s>this.time+1e-6)return this.reject('device_busy',{until_s:state.available_s});
  if(!Array.isArray(a.operations)||a.operations.length<1||a.operations.length>state.batch_slots)return this.reject('batch_capacity',{maximum:state.batch_slots});
  const unique=new Set(),members=[];
  for(const ref of a.operations){const key=ref.job_id+':'+ref.node_id;if(unique.has(key))return this.reject('duplicate_operation');unique.add(key);const job=this.jobs.find(j=>j.id===ref.job_id),node=job?.nodes.find(n=>n.id===ref.node_id);if(!job||!node)return this.reject('unknown_operation');if(job.arrival_s>this.time||node.status!=='pending'||!node.parents.every(id=>job.nodes.find(n=>n.id===id)?.status==='done'))return this.reject('dependencies_not_ready');if(!matches(node.capability,device))return this.reject('incompatible_device');members.push({job,node});}
  if(members.some(m=>m.node.compatibility_key!==members[0].node.compatibility_key))return this.reject('incompatible_batch',{detail:'All members must share recipe, vessel, atmosphere and the complete process program.'});
  let phases;try{phases=programPhases(members[0].node,model);}catch(e){return this.reject(e.message);}
  const calendars=copy(this.calendars),tokens=copy(this.tokens),trace=[],carriers=copy(this.carriers),traffic=this.traffic.filter(r=>r.end_s>this.time),inputArm=this.layout.robots.find(r=>r.id===device.input_robot_id),outputArm=this.layout.robots.find(r=>r.id===device.output_robot_id),input=portPose(device,'input',catalog),output=portPose(device,'output',catalog),batchId='B'+String(this.batches.length+1).padStart(4,'0'),jobIds=members.map(m=>m.job.id);
  const outgoing=m=>m.job.nodes.filter(n=>n.parents.includes(m.node.id));
  // Reserve all result tokens before starting; consume only completed parent-edge tokens.
  for(const m of members)for(const parent of m.node.parents){const i=tokens.findIndex(t=>t.job_id===m.job.id&&t.parent_id===parent&&t.child_id===m.node.id);if(i<0)return this.reject('missing_sample_token');tokens.splice(i,1);}
  const newTokens=members.flatMap(m=>outgoing(m).map(child=>({job_id:m.job.id,parent_id:m.node.id,child_id:child.id,robot_id:outputArm.id,available_s:null})));
  if(tokens.filter(t=>t.robot_id===outputArm.id).length+newTokens.length>this.task.buffer_slots)return this.reject('output_buffer_full',{robot_id:outputArm.id});
  const handling=(arm,start,from,to,kind,job)=>this.reserve(calendars[arm.id],start,catalog.robot.handle_base_s+distance(from,to)/catalog.robot.handle_speed_m_s,{resource:arm.id,kind,from,to,device_id:device.id,batch_id:batchId,job_ids:[job]},trace);
  let loaded=this.time;
  for(const {job,node} of members){
    const origins=node.parents.length?node.parents.map(parent=>this.tokens.find(t=>t.job_id===job.id&&t.parent_id===parent&&t.child_id===node.id)):[null];
    for(const token of origins){
      const sourceArm=token?this.layout.robots.find(r=>r.id===token.robot_id):null;
      if(sourceArm?.id===inputArm.id){const p=robotPoint(inputArm,'handoff',catalog);loaded=handling(inputArm,loaded,p,input.point,'load',job.id).end_s;continue;}
      const from=sourceArm?robotPoint(sourceArm,'dock',catalog):this.task.intake,to=robotPoint(inputArm,'dock',catalog);
      if(carriers.length===1){const carrier=carriers[0];const pickup=routePath(carrier.at,from,this.layout,this.task.room,catalog),delivery=routePath(from,to,this.layout,this.task.room,catalog);if(!pickup||!delivery)return this.reject('transport_route_blocked');
      const start=Math.max(loaded,carrier.available_s),approach=pickup.distance_m/catalog.carrier.speed_m_s,pick=catalog.carrier.pickup_s,travel=delivery.distance_m/catalog.carrier.speed_m_s,drop=catalog.carrier.dropoff_s;let pickupReady=start+approach;
      if(sourceArm){const hand=robotPoint(sourceArm,'handoff',catalog);pickupReady=handling(sourceArm,pickupReady,hand,hand,'pickup',job.id).end_s;}
      const departure=pickupReady+pick,arrival=departure+travel+drop;
      loaded=handling(inputArm,arrival,robotPoint(inputArm,'handoff',catalog),input.point,'load',job.id).end_s;
      trace.push({resource:'amr-1',kind:'transport',start_s:start,end_s:loaded,empty_until_s:start+approach,loaded_from_s:departure,loaded_until_s:departure+travel,from:carrier.at,to,path:[...pickup.points,...delivery.points],empty_path:pickup.points,loaded_path:delivery.points,distance_m:pickup.distance_m+delivery.distance_m,loaded_distance_m:delivery.distance_m,device_id:device.id,batch_id:batchId,job_ids:[job.id],reservation_note:'Carrier waits for source handling and remains reserved through destination handoff; no unbounded dock queue.'});
      carrier.available_s=loaded;carrier.at=copy(to);
      }else{
       const candidates=[];
       for(const car of carriers){
        const key=JSON.stringify([car.id,car.home,from,to]);let paths=this.fleetPaths.get(key);
        if(!paths){const room=fleetRoom(this.task,carriers,car.id,catalog),pickup=findRoute(car.home,from,this.layout,room,catalog),delivery=findRoute(from,to,this.layout,room,catalog),back=findRoute(to,car.home,this.layout,room,catalog);if(!pickup||!delivery||!back)continue;paths={pickup,delivery,back};this.fleetPaths.set(key,paths);}
        candidates.push({car,paths,start:Math.max(loaded,car.available_s)});
       }
       if(!candidates.length)return this.reject('transport_route_blocked');
       const schedule=candidate=>{
        const {car,paths}=candidate,{pickup,delivery,back}=paths,approach=pickup.distance_m/catalog.carrier.speed_m_s,travel=delivery.distance_m/catalog.carrier.speed_m_s,returnTime=back.distance_m/catalog.carrier.speed_m_s;
        let start=candidate.start;
        for(;;){
         const localCalendars=copy(calendars),localTrace=[];
         const hand=(arm,at,f,to,kind)=>{const reservations=[...trace,...localTrace],entry=this.reserve(localCalendars[arm.id],at,catalog.robot.handle_base_s+distance(f,to)/catalog.robot.handle_speed_m_s,{resource:arm.id,kind,from:f,to,device_id:device.id,batch_id:batchId,job_ids:[job.id]},reservations);localTrace.push(entry);return entry;};
         let ready=start+approach;if(sourceArm){const h=robotPoint(sourceArm,'handoff',catalog);ready=hand(sourceArm,ready,h,h,'pickup').end_s;}
         const departure=ready+catalog.carrier.pickup_s,arrival=departure+travel+catalog.carrier.dropoff_s;
         const handoff=hand(inputArm,arrival,robotPoint(inputArm,'handoff',catalog),input.point,'load').end_s,end=handoff+returnTime;
         const cells=tourReservations({start_s:start,end_s:end,empty_until_s:start+approach,loaded_from_s:departure,loaded_until_s:departure+travel,to,return_start_s:handoff,empty_path:pickup.points,loaded_path:delivery.points,return_path:back.points},catalog);
         let delay=0;for(const r of traffic)if(r.id!==car.id&&start<r.end_s-1e-8&&end>r.start_s+1e-8){delay=trafficDelay(cells,r.cells);if(delay)break;}
         if(delay){start+=delay;continue;}
         return {car,paths,start,end,handoff,departure,approach,travel,cells,localCalendars,localTrace};
        }
       };
       const chosen=candidates.map(schedule).sort((a,b)=>a.handoff-b.handoff||a.end-b.end||a.car.id.localeCompare(b.car.id))[0],{car,paths,start,end,handoff,departure,approach,travel,cells,localCalendars,localTrace}=chosen;
       Object.assign(calendars,localCalendars);trace.push(...localTrace);
       trace.push({resource:car.id,kind:'transport',start_s:start,end_s:end,handoff_s:handoff,return_start_s:handoff,empty_until_s:start+approach,loaded_from_s:departure,loaded_until_s:departure+travel,from:car.home,to,return_to:car.home,path:[...paths.pickup.points,...paths.delivery.points,...paths.back.points],empty_path:paths.pickup.points,loaded_path:paths.delivery.points,return_path:paths.back.points,distance_m:paths.pickup.distance_m+paths.delivery.distance_m+paths.back.distance_m,loaded_distance_m:paths.delivery.distance_m,device_id:device.id,batch_id:batchId,job_ids:[job.id],reservation_note:'Closed tour; swept-grid space-time reservations include handoff and return. Other parking bays blocked. Conservative traffic abstraction.'});
       traffic.push({id:car.id,start_s:start,end_s:end,cells});car.available_s=end;car.at=copy(car.home);loaded=handoff;
      }
    }
  }
  const clean=state.last_recipe&&state.last_recipe!==members[0].node.recipe_key?model.process.clean_s:0;
  let cursor=loaded;if(clean){trace.push({resource:device.id,kind:'clean',start_s:cursor,end_s:cursor+clean,job_ids:jobIds,batch_id:batchId});cursor+=clean;}
  const processStart=cursor;
  for(const phase of phases){trace.push({...phase,resource:device.id,start_s:cursor,end_s:cursor+phase.duration_s,job_ids:jobIds,batch_id:batchId});cursor+=phase.duration_s;}
  const processEnd=cursor;
  for(const {job,node} of members){const count=Math.max(1,outgoing({job,node}).length);for(let i=0;i<count;i++)cursor=handling(outputArm,cursor,output.point,robotPoint(outputArm,'handoff',catalog),'unload',job.id).end_s;}
  // Device occupancy includes load, cleanup, process, cool and output-arm queue.
  const windows=this.task.maintenance.filter(w=>w.model===device.model&&device.id.endsWith('-'+w.device_index));
  const conflict=windows.find(w=>this.time<w.end_s&&cursor>w.start_s);if(conflict)return this.reject('maintenance_conflict',{window:conflict});
  this.calendars=calendars;this.carriers=carriers;this.carrier=carriers[0];this.traffic=traffic;this.trace.push(...trace);this.tokens=[...tokens,...newTokens.map(t=>({...t,available_s:cursor}))];
  const batch={id:batchId,device_id:device.id,job_ids:jobIds,operations:members.map(m=>({job_id:m.job.id,node_id:m.node.id})),model:device.model,slots:members.length,capacity:state.batch_slots,start_s:this.time,loaded_s:loaded,process_start_s:processStart,process_end_s:processEnd,end_s:cursor,compatibility_key:members[0].node.compatibility_key};this.batches.push(batch);state.available_s=cursor;state.last_recipe=members[0].node.recipe_key;
  for(const {job,node} of members){node.status='running';node.batch_id=batchId;node.device_id=device.id;node.input_robot_id=inputArm.id;node.output_robot_id=outputArm.id;node.start_s=this.time;node.completed_s=cursor;job.status='active';}
  this.log('batch_dispatched',{batch_id:batchId,device_id:device.id,job_ids:jobIds,slots:members.length,capacity:state.batch_slots,end_s:cursor,reason:a.reason??null});return {accepted:true};
 }
 nextEvent(){if(this.phase==='done')return null;const all=[...this.jobs.filter(j=>j.arrival_s>this.time).map(j=>j.arrival_s),...this.batches.filter(b=>b.end_s>this.time+1e-7).map(b=>b.end_s),...Object.values(this.deviceState).map(s=>s.available_s),...this.task.maintenance.flatMap(w=>[w.start_s,w.end_s])].filter(t=>t>this.time+1e-7);if(all.some(t=>t>=this.task.horizon_s)&&this.time<this.task.horizon_s)all.push(this.task.horizon_s);const candidates=all.filter(t=>t<=this.task.horizon_s);return candidates.length?Math.min(...candidates):null;}
 refresh(){for(const j of this.jobs){if(j.arrival_s<=this.time&&j.status==='future')j.status='queued';for(const n of j.nodes)if(n.status==='running'&&n.completed_s<=this.time+1e-7)n.status='done';if(j.nodes.every(n=>n.status==='done')){j.status='done';j.completed_s=Math.max(...j.nodes.map(n=>n.completed_s));}}
  if(this.jobs.every(j=>j.status==='done'))this.finish('completed');}
 finish(reason){if(reason==='completed'&&!this.sealed)return;this.phase='done';this.terminal_reason=reason;this.log('episode_finished',{reason});}
 result(){const done=this.jobs.filter(j=>j.status==='done'),end=this.time,den=Math.max(end,1),util={};for(const r of [...this.layout.devices.map(d=>d.id),...this.layout.robots.map(r=>r.id),...this.carriers.map(c=>c.id)]){const segments=this.layout.robots.some(arm=>arm.id===r)||r.startsWith('amr-')?this.trace.filter(t=>t.resource===r):this.batches.filter(b=>b.device_id===r).map(b=>({start_s:b.start_s,end_s:b.end_s}));util[r]=segments.reduce((t,s)=>t+Math.max(0,Math.min(end,s.end_s)-s.start_s),0)/den;}
  return {schema_version:'labops.result.v2',task_id:this.task.id,config_hash:this.task.config_hash,seed:this.task.seed,configuration:copy(this.task),terminal_reason:this.terminal_reason,metrics:{completed_jobs:done.length,total_jobs:this.jobs.length,completion_rate:done.length/this.jobs.length,makespan_s:this.terminal_reason==='completed'?end:null,elapsed_s:end,throughput_jobs_h:done.length/den*3600,total_tardiness_s:done.reduce((t,j)=>t+Math.max(0,j.completed_s-j.due_s),0),tardiness_lower_bound_s:this.jobs.filter(j=>j.arrival_s<=end).reduce((t,j)=>t+Math.max(0,(j.completed_s??end)-j.due_s),0),unfinished_late_jobs:this.jobs.filter(j=>j.status!=='done'&&j.due_s<end).length,invalid_actions:this.invalid,actions:this.actions,batches:this.batches.length,batch_fill:this.batches.filter(b=>b.capacity>1).length?this.batches.filter(b=>b.capacity>1).reduce((t,b)=>t+b.slots/b.capacity,0)/this.batches.filter(b=>b.capacity>1).length:0,batch_eligible_cycles:this.batches.filter(b=>b.capacity>1).length,transport_distance_m:this.trace.filter(t=>t.resource.startsWith('amr-')).reduce((t,s)=>t+s.distance_m,0),installed_cost:this.validation?.installed_cost??0,occupied_area_m2:this.validation?.occupied_area_m2??0,utilization:util},fleet:copy(this.carriers),layout:copy(this.layout),layout_history:copy(this.layoutHistory),validation:copy(this.validation??null),jobs:copy(this.jobs),trace:copy(this.trace),decisions:copy(this.decisions),batches:copy(this.batches),evidence:{process_timing:'source dwell unchanged where available; defaults/ramp/cooling explicit in programs',geometry:'geometric constraints checked; articulated motion not certified for this free layout',agent:'set by runner; no LLM evaluation implied'}};}
}
