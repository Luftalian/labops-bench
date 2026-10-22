import fs from 'node:fs';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function recordedHall(folder){
 const m=JSON.parse(fs.readFileSync(folder+'/manifest.json')),gzip=fs.readFileSync(folder+'/result.json.gz');if(sha(gzip)!==m.gzip_sha256)throw new Error('Recorded result checksum mismatch');
 const current=Object.entries(m.source_hashes).every(([f,h])=>fs.existsSync(f)&&sha(fs.readFileSync(f))===h);
 if(!current){const archive=folder+'/source-snapshot.json';if(!fs.existsSync(archive))throw new Error('Recorded simulation is stale and has no verified source snapshot');const s=JSON.parse(fs.readFileSync(archive));for(const [f,h]of Object.entries(m.source_hashes))if(s.snapshot_hashes[f]!==h)throw new Error('Snapshot does not match original manifest');for(const [f,h]of Object.entries(s.snapshot_hashes))if(sha(fs.readFileSync(folder+'/source-snapshot/'+f))!==h)throw new Error('Archived source checksum mismatch');}
 return {gzip,source:current?'current':'archived-verified',manifest:m};
}
