// Current managed-model harness: initial design is explicit and model-controlled.
import fs from 'node:fs';
import path from 'node:path';
import {serialize,deserialize} from 'node:v8';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createHall,catalog,capabilities,hash} from '../sim/v4/tasks.mjs';
import {HallEnvironment} from '../sim/v4/environment.mjs';
import {prepareHallDesign,chooseHallAction,previewHallLayout} from '../sim/v4/agents.mjs';
import {createFleet} from '../sim/v4/fleet.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),[command,folder,arg]=process.argv.slice(2);
if(!['init','observe','candidate','act','finalize'].includes(command)||!folder)throw new Error('init|observe|candidate|act|finalize FOLDER [JSON or candidate ID]');
const stateFile=path.join(folder,'private-state.v8'),historyFile=path.join(folder,'manager.jsonl'),designFile=path.join(folder,'design.jsonl');let env;
const readLines=f=>fs.readFileSync(f,'utf8').trim().split('\n').filter(Boolean).map(s=>JSON.parse(s));
if(command==='init'){
 if(fs.existsSync(stateFile))throw new Error('Session exists');fs.mkdirSync(folder,{recursive:true});const parameters=JSON.parse(arg??'{"family":"screening-mix","jobs":24}'),task=createHall(parameters);env=new HallEnvironment(task);env.designStudy=prepareHallDesign(task);env.designProposal=null;
 const files=[...fs.readdirSync('sim/v4').filter(f=>f.endsWith('.mjs')).map(f=>'sim/v4/'+f),'scripts/codex-hall-session.mjs','sim/v2/geometry.mjs','sim/v2/tasks.mjs','sim/v2/data/catalog.json','sim/v2/data/procedures.json'];
 fs.writeFileSync(folder+'/manifest.json',JSON.stringify({created_at:new Date().toISOString(),status:'design',model:'gpt-6-luna',transport:'Codex managed subagent',controller:'LLM initial design proposals/validation/commit and online module exchanges; fixed admission/routing/dispatch',decision_interval_s:600,design_budget:8,manager_budget:24,parameters,config_hash:task.config_hash,workload_hash:task.workload_hash,node:process.version,source_hashes:Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(f))]))},null,2)+'\n');fs.writeFileSync(historyFile,'');fs.writeFileSync(designFile,'');
}else env=Object.assign(new HallEnvironment({jobs:[],intake:[]}),deserialize(fs.readFileSync(stateFile)));
function observe(){
 const o=env.observe(),installed=Object.fromEntries(capabilities.map(c=>[c,o.layout.devices.filter(d=>d.model==='flex_'+c).length])),forecast=Object.fromEntries([...capabilities,'furnace','oven','xrd'].map(c=>[c,{pending_operations:0,pending_process_s:0,future_operations:0}]));
 for(const j of o.jobs)for(const n of j.nodes)if(n.status==='pending'&&forecast[n.capability]){const f=forecast[n.capability];if(j.arrival_s>o.time_s)f.future_operations++;else{f.pending_operations++;f.pending_process_s+=n.duration_s;}}
 const common={state_version:o.state_version,time_s:o.time_s,phase:o.phase,completed_jobs:env.jobs.filter(j=>j.status==='done').length,total_jobs:env.jobs.length,visibility_s:o.task.visibility_s,resource_limits:o.resources.resource_limits,installed_resources:o.resources.installed_resources,installed,forecast,design_rounds:readLines(designFile).length,manager_rounds:readLines(historyFile).length,terminal_reason:env.terminal_reason};
 if(o.phase==='design')return {...common,room:o.task.room,intake:o.task.intake,robot_budget:o.task.robot_budget,required_capabilities:o.task.required_process_capabilities,design_contract:{actions:['choose_candidate','propose_layout','commit_layout'],initial_geometry_not_yet_committed:true,preview_scope:env.designStudy.preview_scope,proposal_layout_schema:'{devices:[{id,model,x,y,rotation,input_robot_id,output_robot_id}],robots:[{id,x,y,yaw}]}',constraint_scope:'body, service zones, directional ports, reach envelope, finite resources and transport/fleet access; articulated IK not certified',online_spatial_relocation:false},candidates:env.designStudy.candidates.map(({layout,validation,...c})=>({...c,validation:{valid:validation.valid,error_count:validation.errors.length,examples:validation.errors.slice(0,6)}})),proposal:env.designProposal?{candidate_id:env.designProposal.candidate_id,layout_hash:hash(env.designProposal.layout),valid:env.designProposal.valid,receipt:env.designProposal.receipt,preview:env.designProposal.preview}:null,equipment:Object.fromEntries(Object.entries(catalog.equipment).filter(([id])=>o.task.inventory[id]>0).map(([id,m])=>[id,{capability:m.capability??id,size_m:m.size_m,ports:m.ports}])),robot:catalog.robot};
 return {...common,setup_s:o.task.setup_s,cart_available_s:env.cartAvailable,module_stock:o.resources.module_stock,stations:o.layout.devices.map(d=>({id:d.id,capability:catalog.equipment[d.model].capability??d.model,available_s:env.deviceState[d.id]?.available_s??0,can_reconfigure:!!env.canReconfigure(d)}))};
}
if(command==='candidate'){const c=env.designStudy.candidates.find(c=>c.id===arg);if(!c)throw new Error('Unknown candidate');console.log(JSON.stringify({id:c.id,layout:c.layout}));process.exit(0);}
if(command==='act'){
 const a=JSON.parse(arg);if(typeof a.reason!=='string'||!a.reason.length||a.reason.length>1000)throw new Error('Concise reason required');if(a.state_version!==env.version)throw new Error('Stale manager state');const before=observe();let receipt;
 if(env.phase==='design'){
  if(before.design_rounds>=8)throw new Error('Design budget exhausted');
  if(a.type==='choose_candidate'||a.type==='propose_layout'){
   const candidate=a.type==='choose_candidate'?env.designStudy.candidates.find(c=>c.id===a.candidate_id):null,layout=candidate?.layout??a.layout;if(!layout)throw new Error('Candidate or layout required');
   const probe=env.apply({type:'validate_layout',state_version:env.version,layout,reason:a.reason});let validation=probe.validation??{valid:false,errors:[{code:probe.code}]};if(validation.valid)try{createFleet(layout,env.task,catalog);}catch(error){validation={valid:false,errors:[{code:'fleet_access',message:error.message}]};}
   receipt={accepted:validation.valid,validation,state_version:env.version};const preview=validation.valid?(candidate?.preview??previewHallLayout(env.task,layout)):null;env.designProposal={candidate_id:candidate?.id??'custom-'+before.design_rounds,layout:structuredClone(layout),valid:validation.valid,receipt,preview,reason:a.reason};
  }else if(a.type==='commit_layout'){
   if(!env.designProposal?.valid)receipt={accepted:false,code:'validated_proposal_required',state_version:env.version};else{receipt=env.apply({type:'set_layout',state_version:env.version,layout:env.designProposal.layout,reason:a.reason});if(receipt.accepted){env.log('initial_design_committed',{candidate_id:env.designProposal.candidate_id,reason:a.reason,model:'gpt-6-luna'});receipt=env.apply({type:'start',state_version:env.version});}}
  }else throw new Error('Design phase requires choose_candidate, propose_layout or commit_layout');
  fs.appendFileSync(designFile,JSON.stringify({observation:before,action:a,receipt})+'\n');env.log('llm_design_decision',{model:'gpt-6-luna',reason:a.reason,action:a,accepted:receipt.accepted});
 }else{
  if(!['hold','reconfigure'].includes(a.type))throw new Error('Running phase allows hold/reconfigure; spatial relocation is not implemented');if(before.manager_rounds>=24)throw new Error('Manager budget exhausted');receipt=a.type==='reconfigure'?env.apply(a):{accepted:true,state_version:env.version};fs.appendFileSync(historyFile,JSON.stringify({observation:before,action:a,receipt})+'\n');env.log('llm_manager_decision',{model:'gpt-6-luna',reason:a.reason,action:a,accepted:receipt.accepted});
  if(receipt.accepted){const target=env.time+600;let steps=0;while(env.phase!=='done'&&env.time<target-1e-7){let action=chooseHallAction(env.observe({clone:false}),'fixed');if(action.type==='wait')action={...action,until_s:Math.min(target,action.until_s??env.nextEvent()??target)};const r=env.apply(action);if(!r.accepted){env.finish('executor_action_rejected');break;}if(++steps>10000)throw new Error('Executor guard');}}
 }
}
if(command==='finalize'){
 if(env.phase!=='done')throw new Error('Episode has not terminated');const r=env.result(),manager=readLines(historyFile),design=readLines(designFile);r.policy='codex-luna-manager';r.manager_evidence=manager;r.design_evidence=design;r.initial_design={...env.designStudy,controller:'gpt-6-luna',selected_id:env.designProposal?.candidate_id,selected_layout:env.designProposal?.layout,reason:env.designProposal?.reason,phase:'committed'};r.evidence.agent='GPT-6 Luna selected/proposed, validated and explicitly committed initial geometry, then controlled module exchanges/holds every 600 s. Geometry candidate generation and previews, admission/routing/dispatch remain deterministic. No online spatial relocation.';r.metrics.host_runtime_ms=Date.now()-Date.parse(JSON.parse(fs.readFileSync(folder+'/manifest.json')).created_at);const raw=Buffer.from(JSON.stringify(r)),gzip=gzipSync(raw);fs.writeFileSync(folder+'/result.json.gz',gzip);const m=JSON.parse(fs.readFileSync(folder+'/manifest.json'));Object.assign(m,{status:r.terminal_reason,metrics:r.metrics,manager_decisions:manager.length,design_decisions:design.length,invalid_manager_actions:manager.filter(x=>!x.receipt.accepted).length,invalid_design_actions:design.filter(x=>!x.receipt.accepted).length,raw_sha256:sha(raw),gzip_sha256:sha(gzip)});fs.writeFileSync(folder+'/manifest.json',JSON.stringify(m,null,2)+'\n');
}
fs.writeFileSync(stateFile,serialize({...env}));console.log(JSON.stringify(observe()));
