import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {suite,suiteConfig} from '../benchmark/lemat-sdl/suite.mjs';
import {SchedulerSession} from '../backend/scheduler/session.mjs';
import {runController} from '../agent/scheduler-controller.mjs';
import {heuristicController} from '../agent/benchmark-actions.mjs';
import {createRuleController} from '../agent/policy-runtime.mjs';

export const ROOT=fileURLToPath(new URL('../',import.meta.url));
export function sourceManifest() {
  const folders=['agent','backend/counts','backend/scheduler','backend/poc/sim/v2','backend/poc/sim/v4','benchmark/lemat-sdl'];
  const files=[];
  const walk=p=>{for(const d of fs.readdirSync(p,{withFileTypes:true})){const f=path.join(p,d.name);if(d.isDirectory()&&d.name!=='tests'&&d.name!=='__pycache__'&&d.name!=='raw')walk(f);else if(d.isFile()&&/\.(mjs|json|py)$/.test(f))files.push(f);}};
  folders.forEach(f=>walk(path.join(ROOT,f)));files.push(path.join(ROOT,'contracts/labops.schema.json'));
  return Object.fromEntries(files.sort().map(f=>[path.relative(ROOT,f),createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
}
export function concurrency(replay) {
  const peak=intervals=>{const edges=intervals.filter(([a,b])=>b>a).flatMap(([a,b])=>[[a,1],[b,-1]]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);let n=0,max=0;for(const [,d]of edges){n+=d;max=Math.max(max,n);}return max;};
  return {peak_processes:peak((replay?.batches??[]).map(b=>[b.process_start_s,b.process_end_s])),
    peak_arm_actions:peak((replay?.trace??[]).filter(t=>['load','unload','pickup'].includes(t.kind)&&t.resource.startsWith('arm-')).map(t=>[t.start_s,t.end_s]))};
}

export async function runSuite({method='heuristic',controller=createRuleController(method),ids=null,directory=null}={}) {
  const dir=directory??path.join(ROOT,'results/lemat-sdl',new Date().toISOString().replaceAll(':','-')+'-'+method+'-'+randomUUID().slice(0,8));
  fs.mkdirSync(dir,{recursive:true});const source=sourceManifest(),rows=[];
  for(const file of Object.keys(source)){const dest=path.join(dir,'source-snapshot',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(ROOT,file),dest);}
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({method,created_at:new Date().toISOString(),node:process.version,git_base_commit:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),git_dirty:!!execFileSync('git',['status','--porcelain'],{cwd:ROOT,encoding:'utf8'}).trim(),source_hashes:source,
    config:suiteConfig,trials_per_scenario:1,authorization:{jev_max_usd:3,luna:'Codex allowance'},comparison_scope:'Public candidate menus, shared job priorities/engine; exploratory n=1, no optimum or robust ranking claim.'},null,2));
  for(const bundle of suite().filter(b=>!ids||ids.some(id=>b.task.task_id.includes(id)))) {
    const session=new SchedulerSession(bundle,{config:suiteConfig});session.record('provenance',{method,source_hashes:source});
    const folder=path.join(dir,bundle.task.task_id);fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'task.json'),JSON.stringify(bundle,null,2));
    const started=performance.now();
    try {await runController(session,(o,options)=>controller(o,{...options,folder,session}),{onEpoch:o=>{if(o.epoch_id%10===0)process.stderr.write(`${method} ${bundle.task.task_id} epoch=${o.epoch_id} t=${o.time_s} done=${o.completed_jobs}/${o.total_jobs}\n`);}});}
    catch(error){session.record('run_failure',{message:error.message});session.env.finish('run_failure');}
    const result=session.result();fs.writeFileSync(path.join(folder,'result.json'),JSON.stringify(result));
    fs.writeFileSync(path.join(folder,'journal.jsonl'),session.journal.map(e=>JSON.stringify(e)).join('\n')+'\n');
    const row={task_id:bundle.task.task_id,method,status:result.status,terminal_reason:result.terminal_reason,...result.metrics,...concurrency(result.replay),
      installed_resources:result.installed_resources,decisions:session.usedDecisions,external_exchanges:result.replay?.decisions.filter(d=>d.type==='relocation_applied').length??0,
      rejected:result.receipts.filter(r=>r.status==='rejected').length,wall_time_s:(performance.now()-started)/1000};
    rows.push(row);fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify(rows,null,2));console.log(JSON.stringify(row));
  }
  return {directory:dir,rows};
}
if(process.argv[1]===fileURLToPath(import.meta.url))await runSuite({method:process.env.LABOPS_RULE_POLICY??'heuristic',ids:process.argv.slice(2).length?process.argv.slice(2):null});
