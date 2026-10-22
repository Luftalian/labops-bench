import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {carriersAt} from '../backend/poc/demo/workshop/timeline.mjs';
const base=new URL('../results/local/hackathon-media-v2/',import.meta.url),read=k=>JSON.parse(fs.readFileSync(new URL('sources/'+k+'.json',base)));
const active=(e,t)=>e.start_s<=t&&e.end_s>t;
const activity=new WeakMap();
function count(r,t,prefix){let memo=activity.get(r);if(!memo){memo={};activity.set(r,memo);}if(!memo[prefix]){const es=r.trace.filter(e=>e.resource.startsWith(prefix));memo[prefix]=[es.map(e=>e.start_s).sort((a,b)=>a-b),es.map(e=>e.end_s).sort((a,b)=>a-b)];}const upper=es=>{let l=0,h=es.length;while(l<h){const m=(l+h)>>1;if(es[m]<=t)l=m+1;else h=m;}return l;};return upper(memo[prefix][0])-upper(memo[prefix][1]);}
function peak(intervals,end){const edges=intervals.filter(e=>e.start_s<end).flatMap(e=>[[e.start_s,1],[Math.min(end,e.end_s),-1]]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);let n=0,p=0;for(const [,d]of edges){n+=d;p=Math.max(p,n);}return p;}
function choose(r,length,{car=1,arm=3,start=0,end=r.metrics.elapsed_s-length,exclude=[]}={}){
 let best={score:-Infinity,time_s:start};
 const candidates=new Set([start,...r.trace.filter(e=>e.resource.startsWith('arm-')||e.resource.startsWith('amr-')).flatMap(e=>[Math.floor(e.start_s/3)*3,Math.floor((e.start_s-length/2)/3)*3])]);
 for(const t of [...candidates].sort((a,b)=>a-b)){if(t<start||t>end||exclude.some(e=>Math.abs(t-e)<length+8))continue;let score=0;for(let u=t;u<t+length;u+=3)score+=count(r,u,'arm-')*arm+count(r,u,'amr-')*car;if(score>best.score)best={score,time_s:t};}return best.time_s;
}
const present=read('present').replay,future=read('future').replay,ui=read('ui').replay;
const small=[];for(let i=0;i<3;i++)small.push(choose(present,30,{arm:4,car:1.5,exclude:small}));
const f0=choose(future,30,{arm:2,car:4,start:30,end:240}),f1=choose(future,30,{arm:1,car:2,start:0,end:300,exclude:[f0]}),f2=choose(future,30,{arm:.4,car:6,start:60,end:future.metrics.elapsed_s-35,exclude:[f0,f1]});
const moving=carriersAt(future,f2+12).filter(c=>c.segment),mid=[future.configuration.room.width_m/2,future.configuration.room.depth_m/2];
moving.sort((a,b)=>Math.hypot(a.point[0]-mid[0],a.point[1]-mid[1])-Math.hypot(b.point[0]-mid[0],b.point[1]-mid[1]));
const track=moving[0]?.id??future.fleet[0].id;
const focus=t=>{const arms=future.layout.robots.filter(a=>future.trace.some(e=>e.resource===a.id&&active(e,t)));return (arms.length?arms:future.layout.robots).sort((a,b)=>Math.hypot(a.x-mid[0],a.y-mid[1])-Math.hypot(b.x-mid[0],b.y-mid[1])).slice(0,1).map(a=>[a.x,a.y])[0];};
const plan={version:'cinematic-2',present:{starts:small,rates:[3,3,3]},future:{starts:[f0,f1,f2],rates:[3,3,3],focus:[focus(f0+15),mid,focus(f2+15)],tracking_car:track},ui:{start:choose(ui,180,{arm:4,car:1})}};
const diagnostics={};for(const [key,r]of [['present',present],['future',future]]){const end=r.metrics.elapsed_s;diagnostics[key]={elapsed_s:end,unique_arms_with_executed_actions:new Set(r.trace.filter(e=>e.resource.startsWith('arm-')&&e.start_s<end).map(e=>e.resource)).size,peak_arm_actions:peak(r.trace.filter(e=>e.resource.startsWith('arm-')),end),peak_amr_tours:peak(r.trace.filter(e=>e.resource.startsWith('amr-')),end),active_device_models:[...new Set(r.trace.filter(e=>e.kind==='process'&&e.start_s<end).map(e=>r.layout.devices.find(d=>d.id===e.resource)?.model))]};}
if(diagnostics.future.peak_arm_actions<64||diagnostics.future.peak_amr_tours<12||diagnostics.future.active_device_models.length<8)throw new Error('Future shot lacks requested activity / diversity');
fs.writeFileSync(new URL('sources/shot-plan.json',base),JSON.stringify(plan,null,2));fs.writeFileSync(new URL('motion-validation.json',base),JSON.stringify(diagnostics,null,2));
const current=fs.readFileSync(new URL('sources/present.json',base)),sha=b=>createHash('sha256').update(b).digest('hex');
const verified=JSON.parse(fs.readFileSync(new URL('route-cache-equivalence.json',base)));if(!verified.identical||verified.unmodified_engine_sha256!==sha(current))throw new Error('Run node scripts/verify-cinematic-engine.mjs first');
console.log(JSON.stringify({plan,diagnostics},null,2));
