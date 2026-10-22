import fs from 'node:fs';
import path from 'node:path';
import {runSuite,ROOT} from './run-lemat-sdl.mjs';
import {createJevController,createLunaInboxController,readKey} from '../agent/benchmark-providers.mjs';

const method=process.argv[2];
if(!['jev','luna'].includes(method))throw new Error('Usage: node scripts/run-lemat-model.mjs jev|luna [scenario IDs]');
const directory=process.env.LABOPS_MODEL_RUN_DIR;
const lunaDirectory=process.env.LABOPS_LUNA_INBOX??'/private/tmp/labops-luna-sdl-inbox';
const controller=method==='jev'?createJevController({apiKey:readKey(process.env.LABOPS_JEV_ENV_FILE??path.join(ROOT,'.env')),
  ledgerFile:path.join(ROOT,'results/lemat-sdl/jev-spend.json'),maxUSD:3}):createLunaInboxController({directory:lunaDirectory});
const result=await runSuite({method:method==='luna'?'gpt-6-luna-medium':method,controller,directory,ids:process.argv.slice(3).length?process.argv.slice(3):null});
if(method==='luna')fs.writeFileSync(path.join(lunaDirectory,'done.json'),JSON.stringify({directory:result.directory,scenarios:result.rows.length}));
console.log(JSON.stringify({directory:result.directory,scenarios:result.rows.length}));
