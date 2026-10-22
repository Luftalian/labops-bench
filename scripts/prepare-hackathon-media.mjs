import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {buildScenario,scenarios} from '../benchmark/lemat-sdl/suite.mjs';
import {packedCellLayout} from '../agent/layout-packing.mjs';
import {evaluateCounts} from '../backend/counts/evaluator.mjs';
import {concurrency,sourceManifest} from './run-lemat-sdl.mjs';

const root=path.resolve(new URL('../',import.meta.url).pathname);
const out=path.join(root,'results/local/hackathon-media');
fs.mkdirSync(path.join(out,'sources'),{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const published=JSON.parse(fs.readFileSync(path.join(root,'benchmark/published/manifest.json')));
const entries=published.files;
if(!entries)throw new Error('Unknown published manifest shape');
const selected=[['present','01-single-station','heuristic'],['benchmark','12-overfull-inventory','gpt-6-luna-medium'],['luna','11-priority-tail','gpt-6-luna-medium'],['jev','11-priority-tail','jev']];
const provenance={created_at:new Date().toISOString(),git_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),node:process.version,command:'node scripts/prepare-hackathon-media.mjs',engine_source_hashes:sourceManifest(),sources:{}};
for(const [key,id,method]of selected){
  const e=entries.find(e=>e.task_id.endsWith(id)&&e.method===method);
  if(!e)throw new Error('Missing recording '+id+' '+method);
  const bytes=gunzipSync(fs.readFileSync(path.join(root,'benchmark/published',e.path)));
  if(sha(bytes)!==e.source_sha256)throw new Error('Source hash mismatch');
  fs.writeFileSync(path.join(out,'sources',key+'.json'),bytes);
  provenance.sources[key]={...e,decoded_sha256:sha(bytes)};
}
const spec={...structuredClone(scenarios.find(s=>s.id==='03-many-arms')),id:'media-128-arms',version:'media-1',room:[22,24],equipment:{flex_stirrer:128},arms:128,amrs:8,groups:[{workflow:'cbi-mix',count:256,interval_s:0}],purpose:'Synthetic scaling demonstration; excluded from benchmark comparison.'};
const bundle=buildScenario(spec);bundle.request.submission_id='hackathon-media-128';
bundle.request.layout=packedCellLayout(bundle.task,bundle.request.equipment_counts,{columns:16,pitch_x_m:1.2,pitch_y_m:2.6});
const dest=path.join(out,'sources/future.json');
let future;
if(fs.existsSync(dest)){
  const prior=JSON.parse(fs.readFileSync(path.join(out,'sources/future-input.json')));
  if(sha(JSON.stringify(prior))!==sha(JSON.stringify(bundle)))throw new Error('Cached demo input differs; preserve the previous output before creating a new run directory.');
  const previous=JSON.parse(fs.readFileSync(path.join(out,'provenance.json')));
  if(previous.engine_source_hashes&&JSON.stringify(previous.engine_source_hashes)!==JSON.stringify(provenance.engine_source_hashes))throw new Error('Cached demo engine differs; use a new run directory.');
  future=JSON.parse(fs.readFileSync(dest));
}
else{
  future=await evaluateCounts(bundle,bundle.request,{onProgress:p=>{if(p.phase==='placement')console.log(p);}});
  if(future.status!=='completed')throw new Error(JSON.stringify(future.failure??future.violations));
  fs.writeFileSync(dest,JSON.stringify(future));
}
if(future.installed_resources.arms!==128||future.metrics.completed_jobs!==256)throw new Error('Incomplete scaling demonstration');
fs.writeFileSync(path.join(out,'sources/future-input.json'),JSON.stringify(bundle,null,2));
provenance.sources.future={kind:'separate-synthetic-scaling-demonstration',sha256:sha(fs.readFileSync(dest)),metrics:future.metrics,concurrency:concurrency(future.replay),installed_resources:future.installed_resources,input_sha256:sha(JSON.stringify(bundle))};
fs.writeFileSync(path.join(out,'sources/media-meta.json'),JSON.stringify({future:provenance.sources.future}));
fs.copyFileSync(path.join(root,'frontend/benchmarks/report.json'),path.join(out,'sources/report.json'));
fs.writeFileSync(path.join(out,'sources/catalog.json'),JSON.stringify(bundle.catalog));
fs.writeFileSync(path.join(out,'provenance.json'),JSON.stringify(provenance,null,2));
console.log(JSON.stringify({out,future:provenance.sources.future},null,2));
