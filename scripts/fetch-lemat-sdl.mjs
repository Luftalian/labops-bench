import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),curated=JSON.parse(fs.readFileSync(path.join(root,'benchmark/lemat-sdl/workflows.json')));
const destination=path.resolve(process.argv[2]??path.join(root,'results/local/lemat-source'));
for(const record of curated.records) {
  const file=path.join(destination,record.raw_file);let bytes;
  if(fs.existsSync(file))bytes=fs.readFileSync(file);
  else {const response=await fetch(record.url);if(!response.ok)throw new Error('Public annotation fetch failed: HTTP '+response.status);bytes=Buffer.from(await response.arrayBuffer());}
  if(createHash('sha256').update(bytes).digest('hex')!==record.sha256)throw new Error('Pinned source hash mismatch: '+record.paper_id);
  fs.mkdirSync(path.dirname(file),{recursive:true});if(!fs.existsSync(file))fs.writeFileSync(file,bytes,{flag:'wx'});
  console.log(JSON.stringify({paper_id:record.paper_id,sha256:record.sha256,verified:true}));
}
