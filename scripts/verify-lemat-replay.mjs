import fs from 'node:fs';
import path from 'node:path';
import {SchedulerSession} from '../backend/scheduler/session.mjs';
import {runController} from '../agent/scheduler-controller.mjs';
import {digest} from '../backend/scheduler/tasks.mjs';
import {sourceManifest} from './run-lemat-sdl.mjs';

const directory=path.resolve(process.argv[2]),checks=[];
for(const id of fs.readdirSync(directory).filter(n=>n.startsWith('lemat-sdl-')||n.startsWith('scheduler-room-'))) {
  const folder=path.join(directory,id),resultFile=path.join(folder,'result.json');if(!fs.existsSync(resultFile))continue;
  const old=JSON.parse(fs.readFileSync(resultFile)),bundle=JSON.parse(fs.readFileSync(path.join(folder,'task.json')));
  const journal=fs.readFileSync(path.join(folder,'journal.jsonl'),'utf8').trim().split('\n').map(s=>JSON.parse(s));
  if(journal.some(e=>['controller_failure','provider_failure','run_failure'].includes(e.kind))){checks.push({task_id:id,status:'not_replayed',reason:'Controller/provider failure is preserved, not replaced.'});continue;}
  const decisions=journal.filter(e=>e.kind==='submitted').map(e=>e.decision);let i=0;
  const session=new SchedulerSession(bundle,{sessionId:old.session_id,config:old.config});
  await runController(session,async()=>{if(!decisions[i])throw Object.assign(new Error('Missing recorded decision'),{fatal:true});return structuredClone(decisions[i++]);});
  const fresh=session.result(),fields=['metrics','installed_resources'];
  const matched=fields.every(k=>digest(old[k])===digest(fresh[k]))&&['trace','jobs','layout_history'].every(k=>digest(old.replay?.[k])===digest(fresh.replay?.[k]));
  const row={task_id:id,status:matched?'exact_match':'mismatch',decisions_replayed:i,makespan_s:fresh.metrics.makespan_s,
    trace_hash:digest(fresh.replay?.trace)};checks.push(row);console.log(JSON.stringify(row));
}
fs.writeFileSync(path.join(directory,'replay-verification.json'),JSON.stringify({kind:'deterministic replay verification; no fresh inference',source_hashes:sourceManifest(),checks},null,2)+'\n');
if(checks.some(c=>c.status==='mismatch'))process.exitCode=1;
