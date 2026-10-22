import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {createHall} from '../sim/v4/tasks.mjs';
import {runHall} from '../sim/v4/agents.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
export async function executeHall({parameters={},policy='adaptive',onProgress=null}={}){
 const task=createHall(parameters),folder='results/v4/'+new Date().toISOString().replaceAll(':','-')+'-'+policy+'-'+Math.random().toString(16).slice(2,8);fs.mkdirSync(folder,{recursive:true});
 const files=['sim/v4/design.mjs','sim/v4/placement.mjs','sim/v4/tasks.mjs','sim/v4/core.mjs','sim/v4/fleet.mjs','sim/v4/diagnostics.mjs','sim/v4/concurrency.mjs','sim/v4/environment.mjs','sim/v4/agents.mjs','sim/v2/geometry.mjs','sim/v2/tasks.mjs','sim/v2/data/catalog.json','sim/v2/data/procedures.json'],manifest={created_at:new Date().toISOString(),parameters,policy,node:process.version,workload_hash:task.workload_hash,config_hash:task.config_hash,argv:['node','scripts/run-hall.mjs',JSON.stringify(parameters),policy],source_hashes:Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(f))]))};
 try{const result=await runHall(task,{policy,onProgress}),raw=Buffer.from(JSON.stringify(result)),gzip=gzipSync(raw);fs.writeFileSync(folder+'/result.json.gz',gzip);Object.assign(manifest,{status:result.terminal_reason,metrics:result.metrics,raw_sha256:sha(raw),gzip_sha256:sha(gzip)});fs.writeFileSync(folder+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');return {result,manifest,folder};}
 catch(e){manifest.status='failed';manifest.error=e.message;fs.writeFileSync(folder+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');throw Object.assign(e,{folder});}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){try{const r=await executeHall({parameters:JSON.parse(process.argv[2]??'{}'),policy:process.argv[3]??'adaptive'});console.log(JSON.stringify({folder:r.folder,status:r.manifest.status,...r.manifest.metrics,utilization:undefined},null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
