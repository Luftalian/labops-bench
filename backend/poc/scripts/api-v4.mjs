import {checkReferencePlacement} from '../sim/v4/placement.mjs';
import {recordedHall} from './recorded-hall.mjs';
import fs from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {createHall,catalog,families,capabilities,familyPresets} from '../sim/v4/tasks.mjs';
import {HallEnvironment} from '../sim/v4/environment.mjs';
const runs=new Map(),sessions=new Map();let running=0;const send=(res,status,x)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(x));};
async function body(req){let s='';for await(const b of req){s+=b;if(s.length>3e6)throw new Error('Request limit 3 MB');}return s?JSON.parse(s):{};}
export async function handleV4(req,res,p){
 if(!p.startsWith('/api/v4/'))return false;
 try{
  if(req.method==='GET'&&p==='/api/v4/config'){send(res,200,{protocol:'labops.hall.v4',catalog,families,capabilities,familyPresets,policies:['adaptive','fixed'],contract:'One shared room. Logical workflows share all resources. Shared AMR fleet (1–8). Room up to 60 × 40 m; up to 128 benches, 64 furnaces, 32 XRD (256 device / 128 arm structural ceiling). Counts are upper bounds; the reference selects a feasible subset and reports installed/unused resources. Geometry must still validate. Finite swappable-module inventory and commissioning time.'});return true;}
  if(req.method==='GET'&&['/api/v4/evaluation','/api/v4/luna-evaluation'].includes(p)){const f=p.endsWith('/luna-evaluation')?'results/v4/luna-evaluation.json':'results/v4/latest-evaluation.json';send(res,200,fs.existsSync(f)?JSON.parse(fs.readFileSync(f)):{status:'not_run'});return true;}
  if(req.method==='GET'&&['/api/v4/demo','/api/v4/luna-demo'].includes(p)){
   const f=p.endsWith('/luna-demo')?'results/v4/luna-demo.json':'results/v4/demo.json';if(!fs.existsSync(f)){send(res,404,{error:'No recorded shared-hall run'});return true;}const d=JSON.parse(fs.readFileSync(f)),record=recordedHall(d.folder);
   res.writeHead(200,{'Content-Type':'application/json','Content-Encoding':'gzip','Cache-Control':'no-store','X-LabOps-Simulator':record.source});res.end(record.gzip);return true;
  }
  if(req.method==='GET'&&p==='/api/v4/large-evaluation'){const f='results/v4/large-evaluation.json';send(res,200,fs.existsSync(f)?JSON.parse(fs.readFileSync(f)):{status:'not_run'});return true;}
  if(req.method==='GET'&&p==='/api/v4/recordings'){const f='results/v4/recordings.json';send(res,200,fs.existsSync(f)?JSON.parse(fs.readFileSync(f)):[]);return true;}
  const recorded=p.match(/^\/api\/v4\/recordings\/([a-z0-9-]+)$/);if(req.method==='GET'&&recorded){const all=JSON.parse(fs.readFileSync('results/v4/recordings.json')),entry=all.find(e=>e.id===recorded[1]);if(!entry){send(res,404,{error:'Unknown recording'});return true;}const record=recordedHall(entry.folder);res.writeHead(200,{'Content-Type':'application/json','Content-Encoding':'gzip','Cache-Control':'no-store','X-LabOps-Simulator':record.source});res.end(record.gzip);return true;}
  if(req.method==='POST'&&p==='/api/v4/layout-check'){const b=await body(req);send(res,200,checkReferencePlacement(createHall(b.parameters??{})));return true;}
  if(req.method==='POST'&&p==='/api/v4/runs'){
   const b=await body(req);createHall(b.parameters??{});if(!['fixed','adaptive'].includes(b.policy??'adaptive'))throw new Error('Unknown hall policy');if(running>=2){send(res,429,{error:'Two simulations already running'});return true;}
   const id=randomUUID();if(runs.size>=16)for(const [key,r]of runs)if(r.status!=='running'){runs.delete(key);break;}runs.set(id,{status:'running',id});running++;
   const worker=new Worker(new URL('./hall-worker.mjs',import.meta.url),{workerData:{parameters:b.parameters??{},policy:b.policy??'adaptive'}}),timer=setTimeout(()=>{runs.set(id,{id,status:'failed',error:'10 minute computation limit'});worker.terminate();},600000);
   worker.on('message',m=>runs.set(id,{id,...m}));worker.on('error',e=>runs.set(id,{id,status:'failed',error:e.message}));worker.on('exit',code=>{running--;clearTimeout(timer);if(runs.get(id).status==='running')runs.set(id,{id,status:'failed',error:'Worker exited '+code});});send(res,202,{run_id:id});return true;
  }
  const run=p.match(/^\/api\/v4\/runs\/([a-f0-9-]+)(\/result)?$/);if(run&&req.method==='GET'){const r=runs.get(run[1]);if(!r){send(res,404,{error:'Unknown run'});return true;}if(!run[2])send(res,200,r);else if(r.status!=='done')send(res,409,{error:'Run has not terminated'});else {res.writeHead(200,{'Content-Type':'application/json','Content-Encoding':'gzip','Cache-Control':'no-store'});res.end(fs.readFileSync(r.folder+'/result.json.gz'));}return true;}
  if(req.method==='POST'&&p==='/api/v4/sessions'){const b=await body(req),env=new HallEnvironment(createHall(b.parameters??{})),id=randomUUID();if(sessions.size>=8)sessions.delete(sessions.keys().next().value);sessions.set(id,env);send(res,201,{session_id:id,observation:env.observe()});return true;}
  const session=p.match(/^\/api\/v4\/sessions\/([a-f0-9-]+)\/(observation|actions|result)$/);if(session){const env=sessions.get(session[1]);if(!env){send(res,404,{error:'Unknown session'});return true;}if(req.method==='GET'&&session[2]==='observation')send(res,200,env.observe());else if(req.method==='POST'&&session[2]==='actions'){const receipt=env.apply(await body(req));send(res,receipt.accepted?200:422,{receipt,observation:env.observe()});}else if(req.method==='GET'&&session[2]==='result')send(res,env.phase==='done'?200:409,env.phase==='done'?env.result():{error:'Terminal result only'});else send(res,405,{error:'Unsupported method'});return true;}
  send(res,404,{error:'Unknown hall endpoint'});
 }catch(e){send(res,400,{error:e.message});}return true;
}
