import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ROOT,sourceManifest} from './run-lemat-sdl.mjs';
import {benchmarkSuite} from '../benchmark/scheduler-suite.mjs';
import {SchedulerSession} from '../backend/scheduler/session.mjs';
import {digest} from '../backend/scheduler/tasks.mjs';
import {decisionProblem} from '../agent/policy-runtime.mjs';
import {suiteConfig} from '../benchmark/lemat-sdl/suite.mjs';
import {eligibleResult} from './benchmark-result-selection.mjs';

const read=p=>JSON.parse(fs.readFileSync(p)),base=path.join(ROOT,'results/lemat-sdl');
const report=read(path.join(ROOT,'frontend/benchmarks/report.json')),selection=report.result_selection;
const tasks=benchmarkSuite(),checks=[],replays=new Map(),modelEvidence=new Map();
const currentSource=sourceManifest();
const allowIncomplete=process.argv.includes('--allow-incomplete'),missing=[];
const normalized=p=>{const q=structuredClone(p);delete q.observation.session_id;delete q.observation.snapshot_id;return digest(q);};
assert.equal(report.scenarios.length,16);if(!allowIncomplete)assert.equal(report.results.length,80);
for(const bundle of tasks){
  const rows=report.results.filter(r=>r.task_id===bundle.task.task_id);
  for(const method of report.methods)if(!rows.some(r=>r.method===method.id))missing.push({task_id:bundle.task.task_id,method:method.id});
  if(!allowIncomplete)assert.equal(rows.length,5);
  assert.equal(new Set(rows.map(r=>r.method)).size,rows.length);
  const initialHash=normalized(decisionProblem(new SchedulerSession(bundle,{config:suiteConfig}).snapshot()));
  for(const row of rows){
    const runFolder=path.join(base,row.run_id),folder=path.join(runFolder,row.task_id);
    const result=read(path.join(folder,'result.json')),manifest=read(path.join(runFolder,'manifest.json'));
    if(row.evidence==='fresh-run')assert.equal(digest(manifest.source_hashes),digest(currentSource),'Fresh run source changed: '+row.run_id);
    assert(eligibleResult({run:{id:row.run_id,...manifest},result,task:bundle.task,config:suiteConfig,selection}));
    assert.equal(result.status,'completed');assert.equal(result.metrics.completed_jobs,result.metrics.total_jobs);
    assert.equal(result.metrics.makespan_s,row.makespan_s);assert.equal(row.rejected,0);
    assert.equal(digest(read(path.join(folder,'task.json'))),digest(bundle));
    const journal=fs.readFileSync(path.join(folder,'journal.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
    assert(!journal.some(e=>['controller_failure','provider_failure','run_failure','timeout'].includes(e.kind)));
    const submitted=journal.filter(e=>e.kind==='submitted');assert.equal(submitted.length,row.decisions);
    if(row.method==='gpt-6-luna-medium'&&row.evidence==='fresh-run'){
      if(!modelEvidence.has(row.run_id))modelEvidence.set(row.run_id,read(path.join(runFolder,'model-execution-evidence.json')));
      const evidence=modelEvidence.get(row.run_id);
      assert.equal(evidence.requested_model,'gpt-6-luna');assert.equal(evidence.reasoning_effort,'medium');
      assert.equal(evidence.fork_turns,'none');assert.equal(evidence.fresh_inference,true);
    }
    for(const [i,e]of submitted.entries()){
      const epoch=e.observation.epoch_id;let input;
      if(row.method==='gpt-6-luna-medium'){
        input=read(path.join(folder,`luna-input-${epoch}.json`));
        assert(fs.existsSync(path.join(folder,`luna-answer-${epoch}.json`)));
      }
      else if(row.method==='jev'){
        const files=fs.readdirSync(folder).filter(f=>f.startsWith(`jev-request-${epoch}-`));assert.equal(files.length,1);
        input=read(path.join(folder,files[0])).body.state;
      }else input=read(path.join(folder,`policy-input-${epoch}.json`));
      assert.equal(digest(input),digest(decisionProblem(e.observation)));
      if(i===0)assert.equal(normalized(input),initialHash,'Different initial public problem: '+row.task_id+' / '+row.method);
    }
    if(!replays.has(row.run_id))replays.set(row.run_id,read(path.join(runFolder,'replay-verification.json')));
    const replay=replays.get(row.run_id).checks.find(c=>c.task_id===row.task_id);
    assert.equal(replay?.status,'exact_match');
    checks.push({task_id:row.task_id,method:row.method,run_id:row.run_id,evidence:row.evidence,
      decisions:submitted.length,status:result.status,makespan_s:row.makespan_s,initial_public_problem_sha256:initialHash,
      result_sha256:createHash('sha256').update(fs.readFileSync(path.join(folder,'result.json'))).digest('hex'),replay_status:replay.status});
  }
}
const freshCount=checks.filter(c=>c.evidence==='fresh-run').length;
if(!allowIncomplete)assert.equal(freshCount,60);
assert.equal(checks.filter(c=>c.evidence==='retained-challenge').length,20);
assert(report.jev.charged_or_reserved_usd<=3);
for(const [run,evidence]of modelEvidence){
  const runRows=read(path.join(base,run,'summary.json'));
  assert.equal(evidence.fresh_decisions,runRows.reduce((n,c)=>n+c.decisions,0));
  evidence.selected_scenarios=checks.filter(c=>c.run_id===run).length;
  evidence.selected_decisions=checks.filter(c=>c.run_id===run).reduce((n,c)=>n+c.decisions,0);
}
const validation={generated_at:new Date().toISOString(),scope:'Software and scheduling proxy evidence; one trial per condition, no chemical or statistical validation.',
  source_report_sha256:createHash('sha256').update(fs.readFileSync(path.join(ROOT,'frontend/benchmarks/report.json'))).digest('hex'),
  complete:missing.length===0,missing_results:missing,expected_results:80,
  scenarios:tasks.length,selected_results:checks.length,fresh_results:freshCount,retained_results:20,
  task_and_config_match:true,fresh_source_matches_current:true,source_hashes_at_validation:currentSource,
  identical_initial_public_problems:true,exact_recorded_replays:checks.length,jev:report.jev,
  model_execution_evidence:Object.fromEntries(modelEvidence),checks};
const finalLogPath=path.join(ROOT,'results/local/validation/scheduler-refresh/check-final.log');
const logPath=fs.existsSync(finalLogPath)?finalLogPath:path.join(ROOT,'results/local/validation/scheduler-refresh/check.log'),log=fs.readFileSync(logPath,'utf8');
assert(/\nOK\n/.test(log));assert(/# fail 0\n/.test(log));
validation.software_checks={command:'npm run check',python_tests:Number(log.match(/Ran (\d+) tests/)[1]),node_tests:Number(log.match(/# pass (\d+)/)[1]),
  log:path.relative(ROOT,logPath),sha256:createHash('sha256').update(log).digest('hex')};
validation.http=read(path.join(ROOT,'results/local/validation/scheduler-refresh/http.json'));
const uiFile=path.join(ROOT,'results/local/validation/scheduler-refresh/ui-audit.json');
if(fs.existsSync(uiFile)){
  const ui=read(uiFile);assert.equal(ui.rows,16);assert.equal(ui.result_buttons,report.results.length);assert.equal(ui.missing_cells,missing.length);
  validation.ui={...ui,file:path.relative(ROOT,uiFile),sha256:createHash('sha256').update(fs.readFileSync(uiFile)).digest('hex')};
}
fs.writeFileSync(path.join(ROOT,'docs/SCHEDULER_REFRESH_VALIDATION.json'),JSON.stringify(validation,null,2)+'\n');
console.log(JSON.stringify({scenarios:16,complete:validation.complete,selected_results:checks.length,fresh_results:freshCount,retained_results:20,exact_replays:checks.length,missing_results:missing.length,jev:report.jev}));
