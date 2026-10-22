import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';

export const root=fileURLToPath(new URL('../',import.meta.url));
export function exportBenchmarkUI(output=path.join(root,'dist/benchmark-ui')){
  const read=p=>fs.readFileSync(path.join(root,p),'utf8'),write=(p,v)=>{const f=path.join(output,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,v);};
  const manifest=JSON.parse(read('benchmark/published/manifest.json')),report=JSON.parse(read('frontend/benchmarks/report.json'));
  if(createHash('sha256').update(read('frontend/benchmarks/report.json')).digest('hex')!==manifest.source_report_sha256)throw new Error('Shared recordings do not match report; regenerate the recording bundle.');
  if(JSON.parse(read('docs/SCHEDULER_REFRESH_VALIDATION.json')).source_report_sha256!==manifest.source_report_sha256)throw new Error('Refresh validation does not match report; verify selected runs and regenerate validation.');
  for(const row of report.results){
    const f=manifest.files.find(f=>f.run_id===row.run_id&&f.task_id===row.task_id);if(!f)throw new Error('Missing shared recording');
    const bytes=fs.readFileSync(path.join(root,'benchmark/published',f.path));
    if(createHash('sha256').update(bytes).digest('hex')!==f.gzip_sha256||createHash('sha256').update(gunzipSync(bytes)).digest('hex')!==f.source_sha256)throw new Error('Recording hash mismatch');
    write(f.path,bytes);row.replay_url='../'+f.path.split(path.sep).join('/');
  }
  write('benchmarks/report.json',JSON.stringify(report));write('benchmarks/catalog.json',JSON.stringify(JSON.parse(read('fixtures/counts/room-14x10.json')).catalog));
  let html=read('frontend/benchmarks/index.html').replaceAll('="/','="../').replaceAll('":"/','":"../');
  html=html.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/,'<nav><a href="https://github.com/Luftalian/labops-bench">GitHub repository ↗</a><a href="../docs/SCHEDULER_CHALLENGES_RESULTS.md">Results &amp; assumptions ↗</a><a href="../docs/SOURCES.md">Sources &amp; papers ↗</a><a href="../THIRD_PARTY_NOTICES.md">Licenses ↗</a><span class="badge">RECORDED RESULTS</span></nav>');
  if(!html.includes('id="suite-badge"'))html=html.replace('class="badge">','class="badge" id="suite-badge">');
  write('benchmarks/index.html',html);
  for(const p of ['frontend/benchmarks/app.mjs','frontend/benchmarks/styles.css','frontend/replay-layout.mjs','frontend/stage1.css']){
    let text=read(p);if(p.endsWith('/app.mjs'))text=text.replaceAll("from '/","from '../").replaceAll("import('/","import('../").replaceAll("fetch('/benchmarks/","fetch('./");
    write(p.replace('frontend/',''),text);
  }
  for(const name of ['plan-view.mjs','three-view.mjs','timeline.mjs']){
    let text=read('backend/poc/demo/workshop/'+name);if(name==='three-view.mjs')text=text.replace("'/workshop/assets/xarm/'+n+'.stl'","new URL('./assets/xarm/'+n+'.stl',import.meta.url).href");write('workshop/'+name,text);
  }
  for(const dir of ['vendor','campus','hall']){
    if(dir==='vendor')fs.cpSync(path.join(root,'backend/poc/demo/vendor'),path.join(output,'vendor'),{recursive:true});
    else {const text=read('backend/poc/demo/'+dir+'/styles.css').replace("url('/campus/styles.css')","url('../campus/styles.css')");write(dir+'/styles.css',text);}
  }
  for(const n of ['base','link1','link2','link3','link4','link5','link6'])write('workshop/assets/xarm/'+n+'.stl',fs.readFileSync(path.join(root,'backend/poc/sim/physics/assets/xarm6/xarm_description/meshes/xarm6/visual/'+n+'.stl')));
  write('workshop/assets/xarm/LICENSE',read('backend/poc/sim/physics/assets/xarm6/LICENSE'));
  for(const f of ['SCHEDULER_CHALLENGES.md','SCHEDULER_CHALLENGES_RESULTS.md','LEMAT_SDL_BENCHMARK.md','LEMAT_SDL_RESULTS.md','SCHEDULER_INITIAL_LAYOUT_AUDIT.json','SCHEDULER_REFRESH_VALIDATION.json','SOURCES.md','LEMAT_SOURCE_RECORDS.md'])write('docs/'+f,read('docs/'+f));
  write('benchmark/scheduler-refresh.json',read('benchmark/scheduler-refresh.json'));
  for(const f of ['THIRD_PARTY_NOTICES.md','licenses/README.md','licenses/LeMat-Synth-APACHE-2.0.txt','data/source-references.json','data/lemat-source-inventory.json','benchmark/lemat-sdl/ATTRIBUTION.md','benchmark/lemat-sdl/workflows.json'])write(f,read(f));
  // Keep canonical notice paths as well as asset-local copies, so links work
  // when the package is read without the repository.
  write('backend/poc/sim/physics/assets/xarm6/LICENSE',read('backend/poc/sim/physics/assets/xarm6/LICENSE'));
  write('backend/poc/demo/vendor/LICENSE-three.txt',read('backend/poc/demo/vendor/LICENSE-three.txt'));
  write('manifest.json',JSON.stringify(manifest,null,2));write('serve.mjs',read('scripts/serve-static-results.mjs'));
  write('index.html','<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=./benchmarks/"><a href="./benchmarks/">Open LabOpsBench recorded results</a>');
  write('README.txt','LabOpsBench private results viewer\n\nNode.js >=18.16. No npm install, Python or API key is needed.\nFrom this folder: node serve.mjs\nOpen http://127.0.0.1:4181/\n\nRecorded results only; no simulation or provider calls. Keep this package within the repository collaborators.\n\nSources, original papers and adaptation scope: docs/SOURCES.md\nRetain THIRD_PARTY_NOTICES.md and licenses/ with this package. Original-paper prose rights are not all independently reviewed; this collaborator package is not a cleared public corpus.\n');
  return {output,recordings:report.results.length};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(exportBenchmarkUI(process.argv[2]?path.resolve(process.argv[2]):undefined)));
