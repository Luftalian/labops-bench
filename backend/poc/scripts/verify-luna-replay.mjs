import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {recordedHall} from './recorded-hall.mjs';
const folder='results/v4/codex-luna-screening-2026-10-21',record=recordedHall(folder),r=JSON.parse(gunzipSync(record.gzip)),root=path.resolve(folder,'source-snapshot'),{createHall,planHall}=await import(pathToFileURL(root+'/sim/v4/tasks.mjs')),{HallEnvironment}=await import(pathToFileURL(root+'/sim/v4/environment.mjs')),{chooseHallAction}=await import(pathToFileURL(root+'/sim/v4/agents.mjs'));
const env=new HallEnvironment(createHall(record.manifest.parameters)),p=planHall(env.task);for(const a of [{type:'set_layout',layout:p.layout},{type:'start'}])assert.ok(env.apply({...a,state_version:env.version}).accepted);
for(const m of r.manager_evidence){assert.equal(env.time,m.observation.time_s);assert.equal(env.version,m.action.state_version);if(m.action.type==='reconfigure')assert.ok(env.apply(m.action).accepted);const target=env.time+600;while(env.phase!=='done'&&env.time<target-1e-7){let a=chooseHallAction(env.observe({clone:false}),'fixed');if(a.type==='wait')a={...a,until_s:Math.min(target,a.until_s??env.nextEvent()??target)};assert.ok(env.apply(a).accepted);}}
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');assert.equal(sha(env.result().trace),sha(r.trace));assert.equal(env.result().metrics.completed_jobs,24);const proof={status:'passed',source:record.source,completed:24,decisions:r.manager_evidence.length,trace_sha256:sha(r.trace),scope:'Saved Luna actions replayed against the verified original simulator snapshot. No model calls.'};fs.writeFileSync('results/v4/validation/large-hall/luna-replay.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
