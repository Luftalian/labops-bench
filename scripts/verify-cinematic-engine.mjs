// Intentionally run WITHOUT the media loader to verify its complete small trace.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {evaluateCounts} from '../backend/counts/evaluator.mjs';
const base=new URL('../results/local/hackathon-media-v2/',import.meta.url),bundle=JSON.parse(fs.readFileSync(new URL('sources/present-input.json',base)));
const result=await evaluateCounts(bundle,bundle.request),hash=b=>createHash('sha256').update(b).digest('hex');
const actual=hash(JSON.stringify(result)),cached=hash(fs.readFileSync(new URL('sources/present.json',base)));
if(actual!==cached)throw new Error('Media acceleration differs from the unmodified engine');
fs.writeFileSync(new URL('route-cache-equivalence.json',base),JSON.stringify({case:bundle.task.task_id,unmodified_engine_sha256:actual,current_media_engine_sha256:cached,identical:true},null,2));console.log('PASS complete unmodified engine trace equals media-cached trace: '+actual);
