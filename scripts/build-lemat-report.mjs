import fs from 'node:fs';
import path from 'node:path';
import {ROOT,concurrency} from './run-lemat-sdl.mjs';
import {scenarios,curated,suiteConfig} from '../benchmark/lemat-sdl/suite.mjs';
import {digest} from '../backend/scheduler/tasks.mjs';
import {actionMenu} from '../agent/benchmark-actions.mjs';

const base=path.join(ROOT,'results/lemat-sdl'),read=p=>JSON.parse(fs.readFileSync(p));
const runs=fs.readdirSync(base).filter(d=>fs.existsSync(path.join(base,d,'manifest.json'))).map(id=>({id,...read(path.join(base,id,'manifest.json')),rows:fs.existsSync(path.join(base,id,'summary.json'))?read(path.join(base,id,'summary.json')):[]}));
const methods=[{id:'fifo',label:'FIFO'},{id:'heuristic',label:'Reference rule'},{id:'algorithm-advanced',label:'Workload-aware algorithm'},{id:'gpt-6-luna-medium',label:'GPT Luna'},{id:'jev',label:'Jev'}];
const selectedRuns=new Set(),results=[];
const signature=d=>digest({equipment_counts:d.equipment_counts,arm_count:d.arm_count,amr_count:d.amr_count,layout:d.layout});
for(const {id:method}of methods)for(const spec of scenarios){
  const id='lemat-sdl-'+spec.id,version=spec.version??'1';
  for(const run of runs.filter(r=>r.method===method).sort((a,b)=>b.created_at.localeCompare(a.created_at))){
    const row=run.rows.find(r=>r.task_id===id);if(!row)continue;
    const folder=path.join(base,run.id,id),result=read(path.join(folder,'result.json'));
    if(result.context.task_version!==version)continue;
    const journal=fs.readFileSync(path.join(folder,'journal.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
    const first=journal.find(e=>e.kind==='submitted'&&e.decision.type==='initial_design'),d=first?.decision.initial_design;
    let candidate='custom-canonical';if(first){const c=actionMenu(first.observation).find(c=>signature(c.design)===signature(d));candidate=c?.id??candidate;}
    const completion_points=(result.replay?.jobs??[]).filter(j=>j.status==='done'&&Number.isFinite(j.completed_s)).map(j=>({job_id:j.id,arrival_s:j.arrival_s,completed_s:j.completed_s})).sort((a,b)=>a.completed_s-b.completed_s);
    selectedRuns.add(run.id);results.push({...row,...concurrency(result.replay),task_version:version,task_hash:result.context.task_hash,workload_hash:result.context.workload_hash,config:result.config,run_id:run.id,
      initial_candidate:candidate,initial_design_hash:d?signature(d):null,initial_active_models:d?.layout?.devices.map(d=>d.model)??[],initial_parked_count:d?.layout?.parked_devices?.length??0,
      initial_priority_order:first?.decision.priorities.slice().sort((a,b)=>b.priority-a.priority||a.job_id.localeCompare(b.job_id)).map(p=>p.job_id)??[],
      mean_flow_s:completion_points.length?completion_points.reduce((n,j)=>n+j.completed_s-j.arrival_s,0)/completion_points.length:null,completion_points,
      replay_url:'/benchmark-recordings/'+run.id+'/'+id+'/result.json'});break;
  }
}
const spend=read(path.join(base,'jev-spend.json')),known=spend.requests.reduce((n,r)=>n+(r.estimated_billed_usd??0),0);
const layout_audit=scenarios.map(spec=>{
  const group=results.filter(r=>r.task_id==='lemat-sdl-'+spec.id);
  for(const field of ['task_hash','workload_hash','config'])if(new Set(group.map(r=>JSON.stringify(r[field]))).size>1)throw new Error('Incomparable '+field+': '+spec.id);
  const ref=group.find(r=>r.method==='heuristic');return {task_id:'lemat-sdl-'+spec.id,track:spec.category??'original-v1',same_initial_as_reference:group.map(r=>({method:r.method,same:r.initial_design_hash===ref?.initial_design_hash,candidate:r.initial_candidate,design_hash:r.initial_design_hash}))};
});
const ablations=runs.filter(r=>r.method.startsWith('ablation-')).sort((a,b)=>b.created_at.localeCompare(a.created_at)).filter((r,i,a)=>a.findIndex(s=>s.method===r.method)===i).flatMap(r=>r.rows.map(row=>{
  const result=read(path.join(base,r.id,row.task_id,'result.json')),journal=fs.readFileSync(path.join(base,r.id,row.task_id,'journal.jsonl'),'utf8').trim().split('\n').map(JSON.parse),d=journal.find(e=>e.kind==='submitted').decision.initial_design;
  return {...row,run_id:r.id,task_hash:result.context.task_hash,initial_design_hash:signature(d)};
}));
const report={version:'lemat-sdl-2',generated_at:new Date().toISOString(),methods,scenarios,results,layout_audit,ablations,
 conditions:{...suiteConfig,trials_per_method_scenario:1,candidate_search:'Original cases: capacity/reverse/half. Decision challenges: screened spread/packed/reverse/half or active model multisets; all compared methods receive the same public problem. Custom canonical policy plugins may submit arbitrary layouts in a separately declared track.',source_kind:curated.source_kind},
 selected_runs:Object.fromEntries(methods.map(({id})=>[id,[...new Set(results.filter(r=>r.method===id).map(r=>r.run_id))]])),
 prior_attempts:runs.map(r=>({id:r.id,method:r.method,selected:selectedRuns.has(r.id),completed_scenarios:r.rows.filter(x=>x.status==='completed').length,failures:r.rows.filter(x=>x.status!=='completed')})),
 jev:{model:spend.model,known_input_cost_usd:known,charged_or_reserved_usd:spend.charged_or_reserved_usd,max_usd:3,requests:spend.requests.length,note:'Usage-based estimate, not an invoice. Failed requests retain conservative reservations.'},
 failure_payload_note:'Initial failed Jev adapter overwrote same-epoch bodies; hashes/status/reservations and last payload survive. Final comparison calls once per epoch; new requests use UUID filenames.',
 caveats:['Public LeMat annotation subset, not gated full database. Operation times retain source provenance; workload composition, arrivals, geometry and staging are synthetic assumptions.',
 'Original ten cases offered a narrow three-layout menu; all three methods selected exactly the same initial design. They are retained as historical restricted comparisons.',
 'New challenge cases compare five policies through the same public observation, candidates, canonical decision and engine. Sophisticated algorithms are valid contestants; no LLM win is assumed.',
 'One trial per method/scenario version; no statistical ranking or global optimum claim. Missing method/scenario pairs mean not run, not failure or zero time.',
 'Case 03 v2 starts prepared samples in local finite buffers; setup transport is outside its boundary. Intake-fed v1 remains archived.',
 'After the shared 32-decision cap, last priorities persist. Exchange drains admitted whole jobs; workflows requiring all stages cannot span missing-device configurations in this draft. Staging challenges deliberately use independent source-derived unit operations.',
 'Tight packing preserves device dimensions, arm reach, buffers, AMR footprint and route checks. Geometry validity is not articulated robot collision or real laboratory safety certification.']};
fs.writeFileSync(path.join(ROOT,'frontend/benchmarks/report.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(ROOT,'docs/SCHEDULER_INITIAL_LAYOUT_AUDIT.json'),JSON.stringify({generated_at:report.generated_at,source:'Saved journal initial_design payloads; exact canonical signature includes selected counts, devices, arm poses and AMR count.',checks:layout_audit},null,2)+'\n');
const table=specs=>`| Scenario | Room (m) | Jobs | FIFO (h) | Reference (h) | Algorithm (h) | Luna (h) | Jev (h) |\n|---|---|---:|---:|---:|---:|---:|---:|\n`+specs.map(s=>`| ${s.id} v${s.version??'1'} | ${s.room.join(' × ')} | ${s.groups.reduce((n,g)=>n+g.count,0)} | ${methods.map(({id})=>{const r=results.find(r=>r.task_id==='lemat-sdl-'+s.id&&r.method===id);return r?(r.status==='completed'?(r.makespan_s/3600).toFixed(3):r.status):'—';}).join(' | ')} |`).join('\n');
const evidence=`\n## Reproduction and evidence\n\n- [Settings and source assumptions](LEMAT_SDL_BENCHMARK.md); [policy architecture and challenges](SCHEDULER_CHALLENGES.md).\n- [Scenarios](../benchmark/lemat-sdl/scenarios.json), [source fields](../benchmark/lemat-sdl/workflows.json), [initial layout audit](SCHEDULER_INITIAL_LAYOUT_AUDIT.json).\n- Raw immutable task/result/journal/provider input/output and source snapshots: results/lemat-sdl/<run>/<task>/. Large evidence files are Git-ignored, generated summaries remain reviewable.\n- Selected runs: ${Object.entries(report.selected_runs).map(([m,ids])=>m+' = '+ids.join(', ')).join('; ')}.\n- Prior failures remain in report.json; incomplete results have no finite completion score. Initial Jev failures used overwritten same-epoch body files; missing per-retry bodies are not claimed available.\n`;
fs.writeFileSync(path.join(ROOT,'docs/LEMAT_SDL_RESULTS.md'),`# LeMat SDL exploratory results\n\nGenerated ${report.generated_at} by node scripts/build-lemat-report.mjs. Simulated hours; completed-only makespan, lower is better.\n\n## New decision challenges\n\n${table(scenarios.filter(s=>s.category))}\n\n## Original restricted comparisons (preserved)\n\n${table(scenarios.filter(s=>!s.category))}\n\n${report.caveats.map(c=>'- '+c).join('\n')}\n\nCadence ${suiteConfig.decision_interval_s}s; maximum ${suiteConfig.max_decisions} decisions. Jev cumulative known input cost estimate USD ${known.toFixed(6)}, conservative charged/reserved USD ${spend.charged_or_reserved_usd.toFixed(6)} / 3. Luna uses the authorized isolated Codex contestant, medium reasoning; no token/USD meter exposed.\n${evidence}`);
const pairChecks=['spread-full','packed-full'].map(layout=>{
 const a=ablations.find(r=>r.method==='ablation-'+layout+'-fifo'),b=ablations.find(r=>r.method==='ablation-'+layout+'-tail');
 if(!a||!b)return null;if(a.task_hash!==b.task_hash||a.initial_design_hash!==b.initial_design_hash)throw new Error('Confounded ablation '+layout);
 return {layout,fifo_s:a.makespan_s,tail_s:b.makespan_s,reduction_pct:(a.makespan_s-b.makespan_s)/a.makespan_s*100};
}).filter(Boolean);
fs.writeFileSync(path.join(ROOT,'docs/SCHEDULER_CHALLENGES_RESULTS.md'),`# 判断課題の探索的な比較\n\n生成: ${report.generated_at}。各条件1試行、単位はsimulation時間。改善率は保存結果から計算し、実機性能や一般的なモデル順位を意味しない。\n\n${table(scenarios.filter(s=>s.category))}\n\n## 配置を固定して順番だけ変えた比較\n\n${pairChecks.map(p=>`- ${p.layout}: FIFO ${(p.fifo_s/3600).toFixed(3)}h → 下流工程を先に立ち上げる順番 ${(p.tail_s/3600).toFixed(3)}h（完了時間 ${p.reduction_pct.toFixed(2)}%減）。`).join('\n')}\n\n各pairでTask hashと初期design hashの一致を検証。単なる配置差を順序の効果と取り違えないための2×2比較。\n\n初期配置・台数の完全一致／相違は[監査記録](SCHEDULER_INITIAL_LAYOUT_AUDIT.json)、判断・priority・交換は[比較画面](http://127.0.0.1:4180/benchmarks/)で確認できる。\n${evidence}`);
console.log(JSON.stringify({scenarios:scenarios.length,results:results.length,completed:results.filter(r=>r.status==='completed').length,jev:report.jev,pairChecks}));
