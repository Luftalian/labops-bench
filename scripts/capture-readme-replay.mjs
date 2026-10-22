// Capture the README animation from the recorded-results viewer.
// Frames come from the real viewer scrubbed through a saved engine result; nothing is re-simulated or drawn by hand.
// Usage (macOS Google Chrome, ffmpeg): npm run view:results, then in another shell
//   node --experimental-websocket scripts/capture-readme-replay.mjs [--task ID --method ID --view three|plan --still 0.3]
// Defaults reproduce docs/assets/labopsbench-replay.gif: scenario 12, GPT-6 Luna, the whole run as a time-lapse.
import fs from 'node:fs';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const args=Object.fromEntries(process.argv.slice(2).join(' ').split(/\s*--/).filter(Boolean).map(a=>{const [k,...v]=a.split(' ');return [k,v.join(' ')||'true'];}));
const opt={url:'http://127.0.0.1:4181/benchmarks/',task:'lemat-sdl-12-overfull-inventory',method:'gpt-6-luna-medium',view:'three',from:'0',to:'1',frames:'240',fps:'24',width:'1200',still:'',out:'docs/assets/labopsbench-replay.gif',...args};
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',W=1400,H=1000;
const work=path.join(root,'results/local/readme-replay'),frames=path.join(work,'frames');
fs.rmSync(frames,{recursive:true,force:true});fs.mkdirSync(frames,{recursive:true});

class Cdp {
  constructor(url){this.ws=new WebSocket(url);this.seq=0;this.pending=new Map();this.ws.onmessage=e=>{const m=JSON.parse(e.data),p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);};}
  open(){return new Promise((resolve,reject)=>{this.ws.onopen=resolve;this.ws.onerror=reject;});}
  send(method,params={}){const id=++this.seq;this.ws.send(JSON.stringify({id,method,params}));return new Promise((resolve,reject)=>this.pending.set(id,{resolve,reject}));}
  async eval(expression){const r=await this.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;}
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(cdp,expression,label){for(let i=0;i<300;i++){if(await cdp.eval(expression).catch(()=>false))return;await sleep(100);}throw new Error('Timed out waiting for '+label);}

const profile=path.join(work,'chrome-profile');fs.rmSync(profile,{recursive:true,force:true});fs.mkdirSync(profile,{recursive:true});
const proc=spawn(chrome,['--headless=new','--no-first-run','--no-default-browser-check','--hide-scrollbars','--mute-audio','--force-color-profile=srgb','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding',`--user-data-dir=${profile}`,'--remote-debugging-port=0',`--window-size=${W},${H}`,'about:blank'],{stdio:'ignore'});
try{
  const portFile=path.join(profile,'DevToolsActivePort');for(let i=0;i<200&&!fs.existsSync(portFile);i++)await sleep(100);
  const port=fs.readFileSync(portFile,'utf8').split('\n')[0],targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const cdp=new Cdp(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await cdp.open();
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:W,height:H,deviceScaleFactor:1,mobile:false});await cdp.send('Page.enable');await cdp.send('Page.navigate',{url:opt.url});
  await until(cdp,'document.querySelectorAll("[data-result]").length>0','results table');
  const row=await cdp.eval(`fetch('./report.json').then(r=>r.json()).then(r=>{const i=r.results.findIndex(x=>x.task_id===${JSON.stringify(opt.task)}&&x.method===${JSON.stringify(opt.method)});if(i<0)throw new Error('No recorded result for task/method');document.querySelector('[data-result="'+i+'"]').click();const x=r.results[i];return {index:i,run_id:x.run_id,elapsed_s:x.elapsed_s,makespan_s:x.makespan_s,status:x.status,replay_url:x.replay_url};})`);
  await until(cdp,`document.querySelector('[data-result="${row.index}"]').getAttribute('aria-pressed')==='true'&&!document.querySelector('#play').disabled&&!document.querySelector('.factory').hasAttribute('aria-busy')`,'recording');
  if(opt.view==='three'){await cdp.eval(`document.querySelector('#view-three').click()`);await until(cdp,`!document.querySelector('#three-container').hidden&&document.querySelector('#three-container canvas')`,'3D view');await sleep(2500);}
  const clip=await cdp.eval(`(()=>{const lab=document.querySelector('#lab');window.scrollTo(0,lab.getBoundingClientRect().top+scrollY-16);const r=lab.querySelector('.benchmark-replay').getBoundingClientRect(),h=lab.querySelector('.run-heading').getBoundingClientRect();return {x:r.left+scrollX-20,y:h.top+scrollY-20,width:r.width+40,height:r.bottom-h.top+34,scale:1};})()`);
  const from=Number(opt.from),to=Number(opt.to),count=opt.still?1:Number(opt.frames),times=[];
  for(let k=0;k<count;k++){
    const f=opt.still?Number(opt.still):from+(to-from)*(count===1?0:k/(count-1));times.push(f*row.elapsed_s);
    await cdp.eval(`(()=>{const t=document.querySelector('#timeline');t.value=String(${f*1000});t.dispatchEvent(new Event('input'));return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r))));})()`);
    const shot=await cdp.send('Page.captureScreenshot',{format:'png',clip,fromSurface:true});
    fs.writeFileSync(path.join(frames,String(k).padStart(4,'0')+'.png'),Buffer.from(shot.data,'base64'));
  }
  if(opt.still){const file=path.join(work,`still-${opt.task}-${opt.method}-${opt.view}.png`);fs.copyFileSync(path.join(frames,'0000.png'),file);console.log(file);}
  else{
    const out=path.resolve(root,opt.out);fs.mkdirSync(path.dirname(out),{recursive:true});
    execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate',opt.fps,'-i',path.join(frames,'%04d.png'),'-vf',`scale=${opt.width}:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,'-loop','0',out]);
    const recording=fs.readFileSync(path.join(root,'benchmark/published',row.replay_url.replace(/^\.\.\//,'')));
    fs.writeFileSync(out.replace(/\.gif$/,'.json'),JSON.stringify({file:path.relative(root,out),source:'Recorded-results viewer (npm run view:results), scrubbed through a saved engine result; no simulation, model call or hand-drawn content',task_id:opt.task,method:opt.method,run_id:row.run_id,view:opt.view,status:row.status,makespan_s:row.makespan_s,recording:row.replay_url.replace(/^\.\.\//,'benchmark/published/'),recording_gzip_sha256:createHash('sha256').update(recording).digest('hex'),simulation_seconds:{from:times[0],to:times.at(-1)},frames:count,fps:Number(opt.fps),width_px:Number(opt.width),viewer_sources_sha256:Object.fromEntries(['frontend/benchmarks/app.mjs','frontend/benchmarks/index.html','frontend/benchmarks/styles.css'].map(f=>[f,createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')]))},null,2)+'\n');
    console.log(out,fs.statSync(out).size,'bytes');
  }
}finally{proc.kill();}
