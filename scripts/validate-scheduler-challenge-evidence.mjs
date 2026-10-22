import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {ROOT,sourceManifest} from './run-lemat-sdl.mjs';
import {digest} from '../backend/scheduler/tasks.mjs';
const read=p=>JSON.parse(fs.readFileSync(p)),hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const report=read(path.join(ROOT,'frontend/benchmarks/report.json')),base=path.join(ROOT,'results/lemat-sdl');
const rows=report.results.filter(r=>report.scenarios.find(s=>'lemat-sdl-'+s.id===r.task_id)?.category);
assert.equal(rows.length,20);assert(rows.every(r=>r.status==='completed'&&r.rejected===0));
const observations=[],newRuns=new Set();let lunaDecisions=0,jevDecisions=0;
for(const row of rows){
  const folder=path.join(base,row.run_id,row.task_id),journal=fs.readFileSync(path.join(folder,'journal.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  newRuns.add(row.run_id);assert(!journal.some(e=>['controller_failure','provider_failure','run_failure'].includes(e.kind)));
  const submitted=journal.filter(e=>e.kind==='submitted');assert.equal(submitted.length,row.decisions);
  for(const e of submitted){
    let input;
    if(row.method==='gpt-6-luna-medium'){input=read(path.join(folder,'luna-input-'+e.observation.epoch_id+'.json'));lunaDecisions++;}
    else if(row.method==='jev'){
      const prefix='jev-request-'+e.observation.epoch_id+'-',files=fs.readdirSync(folder).filter(f=>f.startsWith(prefix));assert.equal(files.length,1);
      input=read(path.join(folder,files[0])).body.state;jevDecisions++;
    }else input=read(path.join(folder,'policy-input-'+e.observation.epoch_id+'.json'));
    assert.equal(input.format,'labops.public-decision-problem.v1');assert.deepEqual(input.observation,e.observation);
    if(e.observation.epoch_id===0){const o=structuredClone(input);for(const k of ['session_id','snapshot_id'])delete o.observation[k];observations.push({task_id:row.task_id,method:row.method,initial_problem_hash_without_session_ids:digest(o)});}
  }
}
for(const s of report.scenarios.filter(s=>s.category)){
  const group=rows.filter(r=>r.task_id==='lemat-sdl-'+s.id);assert.equal(group.length,5);
  for(const f of ['task_hash','workload_hash','config'])assert.equal(new Set(group.map(r=>JSON.stringify(r[f]))).size,1);
  assert.equal(new Set(observations.filter(o=>o.task_id==='lemat-sdl-'+s.id).map(o=>o.initial_problem_hash_without_session_ids)).size,1);
}
const replayRuns=[...newRuns,...new Set(report.ablations.map(r=>r.run_id))];
const replays=replayRuns.map(run=>{const f=path.join(base,run,'replay-verification.json'),r=read(f);assert(r.checks.every(c=>c.status==='exact_match'));return {run,file:path.relative(ROOT,f),sha256:hash(f),exact_matches:r.checks.length};});
assert.equal(replays.reduce((s,r)=>s+r.exact_matches,0),24);
for(const spec of ['spread-full','packed-full']){
 const pair=report.ablations.filter(r=>r.method.startsWith('ablation-'+spec));assert.equal(pair.length,2);assert.equal(new Set(pair.map(r=>r.task_hash)).size,1);assert.equal(new Set(pair.map(r=>r.initial_design_hash)).size,1);
 const configs=pair.map(r=>read(path.join(base,r.run_id,r.task_id,'result.json')).config);assert.deepEqual(configs[0],configs[1]);
}
const originalAudit=report.layout_audit.filter(a=>a.track==='original-v1');assert.equal(originalAudit.length,10);assert(originalAudit.every(a=>a.same_initial_as_reference.every(m=>m.same)));
const dest=path.join(ROOT,'results/local/validation/scheduler-challenges');fs.mkdirSync(dest,{recursive:true});
const logs=[['npm run check','/private/tmp/labops-challenges-release-final.log',/Ran 46 tests[\s\S]*?OK[\s\S]*?# tests 48[\s\S]*?# pass 48[\s\S]*?# fail 0/],
 ['LABOPS_URL=http://127.0.0.1:4180 node scripts/smoke-scheduler.mjs','/private/tmp/labops-challenges-scheduler-http.log',/PASS scheduler HTTP/],
 ['LABOPS_URL=http://127.0.0.1:4180 node scripts/smoke-counts.mjs','/private/tmp/labops-challenges-counts-http.log',/"status": "passed"/]].map(([command,src,pattern])=>{const file=path.join(dest,path.basename(src)),evidence=fs.existsSync(src)?src:file;assert(pattern.test(fs.readFileSync(evidence,'utf8')));if(evidence!==file)fs.copyFileSync(evidence,file);return {command,status:'passed',log:path.relative(ROOT,file),sha256:hash(file),note:'Recorded check log; evidence validation does not rerun this command.'};});
const importCheck=execFileSync(path.join(ROOT,'.venv/bin/python'),['scripts/check_poc_import.py'],{cwd:ROOT,encoding:'utf8'}).trim();assert(importCheck.startsWith('PASS'));
const lunaRun=rows.find(r=>r.method==='gpt-6-luna-medium').run_id;
const diagnosticFile=path.join(dest,'whole-job-staging-diagnostic.json'),diagnostic=read(diagnosticFile);
assert.equal(diagnostic.result.terminal_reason,'scheduler_deadlock');assert.equal(diagnostic.result.metrics.makespan_s,null);
fs.writeFileSync(path.join(base,lunaRun,'model-execution-evidence.json'),JSON.stringify({requested_model:'gpt-6-luna',reasoning_effort:'medium',route:'Authorized isolated Codex app contestant subagent',agent:'/root/luna_challenges',fork_turns:'none',fresh_decisions:lunaDecisions,context_scope:'Only public inbox observations/candidates; no repository or other contestant outcomes.',token_usage:null,cost_usd:null,note:'Codex allowance; no metered usage exposed. This run used a fresh dedicated inbox.'},null,2)+'\n');
const v={generated_at:new Date().toISOString(),scope:'Software and source-derived scheduling proxy validation, not chemical/real-lab validation.',git_observed_at_validation:{head:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),dirty:!!execFileSync('git',['status','--porcelain'],{cwd:ROOT,encoding:'utf8'}).trim()},
 source_hashes_observed_at_validation:sourceManifest(),checks:logs,import_verification:importCheck,completed_new_trials:rows.length,all_report_trials:report.results.length,fresh_luna_decisions:lunaDecisions,jev_decisions:jevDecisions,jev_cumulative:report.jev,
 identical_initial_public_problems:observations,original_layout_audit:'docs/SCHEDULER_INITIAL_LAYOUT_AUDIT.json',exact_replays:replays,
 fixed_layout_order_ablation:report.ablations.map(r=>({method:r.method,makespan_s:r.makespan_s,task_hash:r.task_hash,initial_design_hash:r.initial_design_hash,run_id:r.run_id})),
 ui_checks:['Comparison table exposes all 5 methods and initial choice IDs','Recorded completion curves and same/different initial design shown','Packing preview was submitted through the actual UI: 8 devices/8 arms/1 AMR accepted and advanced to t=1800s','Tighter spacing rejects collisions without shrinking source device/robot dimensions'],
 screenshots:['results/local/scheduler-challenges-ui/comparison.png'],whole_job_checkpoint_diagnostic:{command:'node scripts/check-staging-checkpoint.mjs',file:path.relative(ROOT,diagnosticFile),sha256:hash(diagnosticFile),terminal_reason:diagnostic.result.terminal_reason,makespan_s:null},evidence_script_hashes:Object.fromEntries(['scripts/build-lemat-report.mjs','scripts/run-lemat-sdl.mjs','scripts/run-lemat-model.mjs','scripts/run-scheduler-ablations.mjs','scripts/verify-lemat-replay.mjs','scripts/check-staging-checkpoint.mjs','scripts/validate-scheduler-challenge-evidence.mjs'].map(f=>[f,hash(path.join(ROOT,f))])),limitations:report.caveats};
assert(report.jev.charged_or_reserved_usd<=3);fs.writeFileSync(path.join(ROOT,'docs/SCHEDULER_CHALLENGES_VALIDATION.json'),JSON.stringify(v,null,2)+'\n');
console.log(JSON.stringify({completed_new_trials:rows.length,all_report_trials:report.results.length,exact_new_replays:24,identical_initial_public_problems:4,luna_decisions:lunaDecisions,jev_decisions:jevDecisions,checks:logs.length,jev_cumulative:report.jev}));
