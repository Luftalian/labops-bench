import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';

export const root=fileURLToPath(new URL('../',import.meta.url));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function publishRecordings(){
  const report=JSON.parse(fs.readFileSync(path.join(root,'frontend/benchmarks/report.json'))),folder=path.join(root,'benchmark/published'),files=[];
  for(const row of report.results){
    if(!/^[a-zA-Z0-9T._-]+$/.test(row.run_id)||!/^lemat-sdl-[a-z0-9-]+$/.test(row.task_id))throw new Error('Invalid recording identity');
    const raw=fs.readFileSync(path.join(root,'results/lemat-sdl',row.run_id,row.task_id,'result.json')),result=JSON.parse(raw);
    if(result.status!==row.status||result.context.task_hash!==row.task_hash||result.context.workload_hash!==row.workload_hash||result.metrics.makespan_s!==row.makespan_s)throw new Error('Report/result disagreement: '+row.task_id);
    const bytes=gzipSync(raw,{level:9});if(!gunzipSync(bytes).equals(raw))throw new Error('Lossy recording export');
    const relative=path.join('recordings',row.run_id,row.task_id,'result.json.gz'),file=path.join(folder,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);
    files.push({run_id:row.run_id,task_id:row.task_id,method:row.method,path:relative,source_sha256:digest(raw),gzip_sha256:digest(bytes),bytes:raw.length,gzip_bytes:bytes.length});
  }
  const manifest={version:'labops.shared-recordings.v1',source_report_generated_at:report.generated_at,source_report_sha256:digest(fs.readFileSync(path.join(root,'frontend/benchmarks/report.json'))),scope:'Selected engine results only, exact lossless compression. API credentials, provider requests, local journals and source snapshots are excluded.',files};
  fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const m=publishRecordings();console.log(JSON.stringify({recordings:m.files.length,bytes:m.files.reduce((n,f)=>n+f.bytes,0),gzip_bytes:m.files.reduce((n,f)=>n+f.gzip_bytes,0)}));}
