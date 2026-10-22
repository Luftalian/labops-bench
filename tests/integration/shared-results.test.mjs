import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {exportBenchmarkUI,root} from '../../scripts/export-benchmark-ui.mjs';

test('a raw-data-free results package preserves every selected score and supplies offline 2D/3D assets',()=>{
  const output=fs.mkdtempSync(path.join(os.tmpdir(),'labops-shared-ui-'));
  try{
    const built=exportBenchmarkUI(output),report=JSON.parse(fs.readFileSync(path.join(output,'benchmarks/report.json'))),manifest=JSON.parse(fs.readFileSync(path.join(output,'manifest.json')));
    assert.equal(built.recordings,report.results.length);assert.equal(manifest.files.length,report.results.length);
    for(const r of report.results){
      const file=path.resolve(output,'benchmarks',r.replay_url),raw=gunzipSync(fs.readFileSync(file)),result=JSON.parse(raw),m=manifest.files.find(m=>m.run_id===r.run_id&&m.task_id===r.task_id);
      assert(file.startsWith(output+path.sep));assert.equal(createHash('sha256').update(raw).digest('hex'),m.source_sha256);
      assert.equal(result.context.task_hash,r.task_hash);assert.equal(result.metrics.makespan_s,r.makespan_s);assert.equal(result.status,r.status);
      assert(result.replay.layout_history.length>0);assert(result.replay.trace.length>0);
    }
    for(const f of ['serve.mjs','benchmarks/catalog.json','workshop/plan-view.mjs','workshop/three-view.mjs','workshop/timeline.mjs','vendor/three.module.js','vendor/three.core.js','vendor/addons/loaders/STLLoader.js','workshop/assets/xarm/link6.stl','workshop/assets/xarm/LICENSE','vendor/LICENSE-three.txt','THIRD_PARTY_NOTICES.md','licenses/LeMat-Synth-APACHE-2.0.txt','docs/SOURCES.md','docs/LEMAT_SOURCE_RECORDS.md','data/lemat-source-inventory.json','data/source-references.json','benchmark/lemat-sdl/ATTRIBUTION.md'])assert(fs.existsSync(path.join(output,f)),f);
    for(const f of ['licenses/LeMat-Synth-APACHE-2.0.txt','THIRD_PARTY_NOTICES.md','backend/poc/sim/physics/assets/xarm6/LICENSE','backend/poc/demo/vendor/LICENSE-three.txt'])assert.deepEqual(fs.readFileSync(path.join(output,f)),fs.readFileSync(path.join(root,f)),f);
    assert.match(fs.readFileSync(path.join(output,'benchmarks/index.html'),'utf8'),/Sources &amp; papers/);
    for(const f of ['docs/SCHEDULER_REFRESH_VALIDATION.json','benchmark/scheduler-refresh.json'])assert(fs.existsSync(path.join(output,f)),f);
    assert.equal(JSON.parse(fs.readFileSync(path.join(output,'docs/SCHEDULER_REFRESH_VALIDATION.json'))).source_report_sha256,manifest.source_report_sha256);
    assert(!fs.existsSync(path.join(output,'.env')));assert(!fs.existsSync(path.join(output,'results/lemat-sdl')));
    assert(!/src="\/|href="\//.test(fs.readFileSync(path.join(output,'benchmarks/index.html'),'utf8')));
  }finally{fs.rmSync(output,{recursive:true,force:true});}
});
