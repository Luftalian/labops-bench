import fs from 'node:fs';
import path from 'node:path';
import {serialize,deserialize} from 'node:v8';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createHall,catalog,capabilities,planHall} from '../sim/v4/tasks.mjs';
import {HallEnvironment} from '../sim/v4/environment.mjs';
import {chooseHallAction} from '../sim/v4/agents.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),[command,folder,arg]=process.argv.slice(2);
if(!['init','observe','act','finalize'].includes(command)||!folder)throw new Error('init|observe|act|finalize FOLDER [JSON]');
const stateFile=path.join(folder,'private-state.v8'),historyFile=path.join(folder,'manager.jsonl');
let env;
if(command==='init'){
 if(fs.existsSync(stateFile))throw new Error('Session exists');fs.mkdirSync(folder,{recursive:true});const task=createHall(JSON.parse(arg??'{"family":"screening-mix","jobs":24}'));env=new HallEnvironment(task);const p=planHall(task);if(!p.validation.valid)throw new Error('Seed layout failed');
 for(const a of [{type:'set_layout',layout:p.layout},{type:'start'}])if(!env.apply({...a,state_version:env.version}).accepted)throw new Error('Seed start failed');
 const files=['sim/v4/tasks.mjs','sim/v4/core.mjs','sim/v4/fleet.mjs','sim/v4/diagnostics.mjs','sim/v4/environment.mjs','sim/v4/agents.mjs','scripts/codex-hall-session.mjs','sim/v2/geometry.mjs','sim/v2/data/catalog.json','sim/v2/data/procedures.json'];
 fs.writeFileSync(folder+'/manifest.json',JSON.stringify({created_at:new Date().toISOString(),status:'running',model:'gpt-6-luna',transport:'Codex managed subagent; CLI startup failed with exit 137',controller:'LLM module manager; rule-based feasible initial layout, admission/routing/dispatch/transport executor',decision_interval_s:600,manager_budget:24,parameters:JSON.parse(arg??'{"family":"screening-mix","jobs":24}'),config_hash:task.config_hash,workload_hash:task.workload_hash,node:process.version,source_hashes:Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(f))]))},null,2)+'\n');
 fs.writeFileSync(historyFile,'');
}else{env=Object.assign(new HallEnvironment({jobs:[],intake:[]}),deserialize(fs.readFileSync(stateFile)));}
function observe(){
 const o=env.observe(),installed=Object.fromEntries(capabilities.map(c=>[c,o.layout.devices.filter(d=>d.model==='flex_'+c).length])),forecast=Object.fromEntries(capabilities.map(c=>[c,{pending_operations:0,pending_process_s:0,future_operations:0}]));
 for(const j of o.jobs)for(const n of j.nodes)if(n.status==='pending'&&forecast[n.capability]){const f=forecast[n.capability];if(j.arrival_s>o.time_s)f.future_operations++;else{f.pending_operations++;f.pending_process_s+=n.duration_s;}}
 return {state_version:o.state_version,time_s:o.time_s,phase:o.phase,completed_jobs:env.jobs.filter(j=>j.status==='done').length,total_jobs:env.jobs.length,visibility_s:o.task.visibility_s,installed,forecast,setup_s:o.task.setup_s,cart_available_s:env.cartAvailable,module_stock:o.resources.module_stock,stations:o.layout.devices.map(d=>({id:d.id,capability:catalog.equipment[d.model].capability??d.model,available_s:env.deviceState[d.id].available_s,can_reconfigure:!!env.canReconfigure(d)})),manager_rounds:fs.readFileSync(historyFile,'utf8').trim().split('\n').filter(Boolean).length,terminal_reason:env.terminal_reason};
}
if(command==='act'){
 const a=JSON.parse(arg);if(!['hold','reconfigure'].includes(a.type)||typeof a.reason!=='string'||a.reason.length>1000)throw new Error('Expected hold/reconfigure with concise reason');if(a.state_version!==env.version)throw new Error('Stale manager state');
 const before=observe();if(before.manager_rounds>=24)throw new Error('Manager budget exhausted');let receipt={accepted:true};
 if(a.type==='reconfigure')receipt=env.apply(a);
 fs.appendFileSync(historyFile,JSON.stringify({observation:before,action:a,receipt})+'\n');
 env.log('llm_manager_decision',{model:'gpt-6-luna',reason:a.reason,action:a,accepted:receipt.accepted});
 // Never apply the reference reconfiguration policy. It only executes jobs.
 if(receipt.accepted){const target=env.time+600;let steps=0;while(env.phase!=='done'&&env.time<target-1e-7){let action=chooseHallAction(env.observe({clone:false}),'fixed');if(action.type==='wait')action={...action,until_s:Math.min(target,action.until_s??env.nextEvent()??target)};const r=env.apply(action);if(!r.accepted){env.finish('executor_action_rejected');break;}if(++steps>10000)throw new Error('Executor guard');}}
}
if(command==='finalize'){
 if(env.phase!=='done')throw new Error('Episode has not terminated');const r=env.result(),manager=fs.readFileSync(historyFile,'utf8').trim().split('\n').filter(Boolean).map(s=>JSON.parse(s));r.policy='codex-luna-manager';r.manager_evidence=manager;r.evidence.agent='GPT-6 Luna via Codex managed subagent chooses a module exchange or hold every 600 simulation seconds. Rule-based layout, admission, routing and dispatch. No claim of LLM-designed geometry or every-action control.';r.metrics.host_runtime_ms=Date.now()-Date.parse(JSON.parse(fs.readFileSync(folder+'/manifest.json')).created_at);const raw=Buffer.from(JSON.stringify(r)),gzip=gzipSync(raw);fs.writeFileSync(folder+'/result.json.gz',gzip);
 const m=JSON.parse(fs.readFileSync(folder+'/manifest.json'));Object.assign(m,{status:r.terminal_reason,metrics:r.metrics,manager_decisions:manager.length,invalid_manager_actions:manager.filter(x=>!x.receipt.accepted).length,raw_sha256:sha(raw),gzip_sha256:sha(gzip)});fs.writeFileSync(folder+'/manifest.json',JSON.stringify(m,null,2)+'\n');
}
fs.writeFileSync(stateFile,serialize({...env}));console.log(JSON.stringify(observe()));
