import {ThreeView} from '/workshop/media-three.mjs';
import {PlanView} from '/workshop/plan-view.mjs';
import {projectedReplay} from '/replay-layout.mjs';

const $=s=>document.querySelector(s),canvas=$('#output'),c=canvas.getContext('2d'),status=$('#status');
const keys=['present','future','benchmark','luna','jev'];
const data=Object.fromEntries(await Promise.all(keys.map(async k=>[k,await(await fetch('/source/'+k+'.json')).json()])));
const catalog=await(await fetch('/source/catalog.json')).json(),report=await(await fetch('/source/report.json')).json();
const meta=await(await fetch('/source/media-meta.json')).json();
const view=new ThreeView($('#stage3'),()=>{}),plan=new PlanView($('#stage2'),()=>{});view.renderer.setPixelRatio(1);
const clips=[...$('#clip').options].map(o=>o.value),colors=['#a5875a','#6e8d66','#16838a','#8871c6','#d67e53'];
let activeKey=null,layoutSignature=null,busy=false;
const font='system-ui, -apple-system, sans-serif';
function text(s,x,y,size=24,color='#e5efdf',weight=400){c.fillStyle=color;c.font=`${weight} ${size}px ${font}`;c.textAlign='left';c.fillText(String(s),x,y);}
function box(x,y,w,h,color='#19382b',r=16){c.fillStyle=color;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}
function wrap(s,x,y,width,size=24,color='#bed1be',line=34,max=12){c.font=`400 ${size}px ${font}`;let lineText='',n=0;for(const word of String(s).split(/\s+/)){const next=lineText?lineText+' '+word:word;if(c.measureText(next).width>width&&lineText){text(lineText,x,y+n*line,size,color);n++;lineText=word;if(n>=max)return y+n*line;}else lineText=next;}if(lineText)text(lineText,x,y+n++*line,size,color);return y+n*line;}
function tag(s,x,y,color='#83c59c'){box(x,y,Math.min(1700,Math.max(95,s.length*12+28)),34,'#234735',9);text(s,x+14,y+24,18,color,600);}
function base(title,subtitle,number,white=false){
 c.fillStyle=white?'#fbfcf8':'#10251e';c.fillRect(0,0,1920,1080);
 text('▦  LabOpsBench',40,53,30,white?'#174630':'#e2f1df',700);text('ROOM × RESOURCES × TIME',1370,51,20,white?'#557365':'#9bbb9e',600);
 c.fillStyle=white?'#d9e3d7':'#31553e';c.fillRect(40,77,1840,1);
 text(title,40,138,44,white?'#143d2b':'#ecf2df',650);text(subtitle,42,181,23,white?'#526d5e':'#aac6ad');
 text('SIMULATION REPLAY  ·  '+number,40,1047,18,white?'#54705e':'#8ba88e',600);
 text(white?'Exploratory n=1 · restricted public candidate track · no chemistry prediction':'Recorded engine events · rendering never changes the completion score',700,1047,18,white?'#54705e':'#8ba88e');
}
function chip(s,x,y,w=162){box(x,y,w,43,'#234735',8);text(s,x+14,y+29,20,'#d5e8d0',550);}
function jobCount(r,t){return r.jobs.filter(j=>j.completed_s!=null&&j.completed_s<=t).length;}
function simclock(t){const h=Math.floor(t/3600),m=Math.floor(t%3600/60),s=(t%60).toFixed(1);return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.padStart(4,'0')}`;}
function priorityEvent(r,t){return r.decisions?.filter(e=>e.type==='scheduler_priorities'&&e.time_s<=t).at(-1);}
async function renderLab(key,t,mode='3d',pan=0){
 const r=data[key].replay,p=projectedReplay(r,t),sig=key+':'+p.layout.devices.map(d=>d.id).join(',');
 if(mode==='2d'){plan.set(p,catalog);plan.draw(t,{labels:true,ports:true,routes:true});return $('#stage2');}
 if(activeKey!==key||layoutSignature!==sig){await view.set(p,catalog);activeKey=key;layoutSignature=sig;}
 else{view.result=p;for(const m of view.devices){const d=p.layout.devices.find(d=>d.id===m.d.id);if(d){m.d=d;m.group.position.x=d.x;m.group.position.y=d.y;}}for(const robot of view.robots){const a=p.layout.robots.find(a=>a.id===robot.arm.id);if(a){robot.arm=a;robot.base.position.x=a.x;robot.base.position.y=a.y;}}}
 const room=r.configuration.room;
 if(key==='future'){
  const close=pan<.52,focus=close?[9.5,12.8,.4]:[11,13,.2];view.controls.target.set(...focus);
  view.camera.position.set(close?19.5:31,close?27:39,close?14:31);
 }else{
  const w=room.width_m,d=room.depth_m;view.controls.target.set(w/2,d/2,.35);view.camera.position.set(w*(.98+.06*Math.sin(pan*2)),d*1.5,Math.max(4.3,w*.85));
 }
 view.renderer.shadowMap.enabled=key!=='future';view.draw(t,{labels:false,ports:true,reach:false});return view.renderer.domElement;
}
function labPanel(image,t,mode,speed,r,{x=40,y=260,w=1248,h=650}={}){
 box(x,y-48,w,h+94,'#1b3d2d');text('●  '+mode.toUpperCase()+' LAB  /  RECORDED PLAYBACK',x+20,y-16,20,'#b2d3b6',600);
 c.save();c.beginPath();c.roundRect(x,y,w,h,6);c.clip();c.drawImage(image,x,y,w,h);c.restore();
 text('❚❚',x+20,y+h+32,22,'#d1e9d1',600);text(simclock(t)+'  SIM',x+70,y+h+31,21,'#d1e9d1');text(speed+'× playback',x+w-198,y+h+31,19,'#d1e9d1');
 const elapsed=r.metrics?.elapsed_s??1;c.fillStyle='#688773';c.fillRect(x+310,y+h+19,w-540,5);c.fillStyle='#d3ba75';c.fillRect(x+310,y+h+19,(w-540)*Math.min(1,t/elapsed),5);
}
function counters(r,t,x=1320,y=230){
 const room=r.configuration.room;chip(room.width_m+' × '+room.depth_m+' m',x,y,260);chip(r.layout.robots.length+' ARMS',x+282,y,260);
 text('COMPLETED JOBS',x,y+90,18,'#92b199',600);text(jobCount(r,t)+' / '+r.jobs.length,x,y+145,47,'#e4efd9',650);
 text('ACTIVE PROCESSING',x+280,y+90,18,'#92b199',600);text(r.batches.filter(b=>b.process_start_s<=t&&b.process_end_s>t).length,x+280,y+145,47,'#e4efd9',650);
}
function eventPanel(r,t,x=1320,y=550){
 text('ENGINE EVENT STREAM',x,y,21,'#cbe2c7',600);
 const events=r.trace.filter(e=>e.start_s<=t&&e.end_s>t).slice(0,Math.max(1,Math.min(7,Math.floor((968-y-22)/51))));
 if(!events.length)text('Waiting for the next recorded action',x,y+45,22,'#9cb39b');
 events.forEach((e,i)=>{box(x,y+22+i*51,540,44,'#1d402f',6);text(e.kind.toUpperCase(),x+12,y+51+i*51,17,'#e1ba77',650);text(e.resource,x+160,y+51+i*51,19,'#c5dcc1');text((e.job_ids??[]).slice(0,1).join(),x+435,y+51+i*51,17,'#b7d4b7');});
}
function priorities(r,t,x=1320,y=425,limit=7){
 const e=priorityEvent(r,t),ps=[...(e?.priorities??[])].sort((a,b)=>b.priority-a.priority||a.job_id.localeCompare(b.job_id));
 text('RECORDED JOB PRIORITIES',x,y,21,'#d9e6cd',600);text('Decision at '+simclock(e?.time_s??0),x,y+33,19,'#9fc2a2');
 ps.slice(0,limit).forEach((p,i)=>{text(p.job_id,x,y+77+i*41,23,'#c9dfc6',600);box(x+110,y+57+i*41,Math.max(3,p.priority/1000*330),24,'#638f69',3);text(p.priority,x+465,y+77+i*41,22,'#e4c58b',600);});
}
function lowerStrip(left,right){text(left,42,1002,22,'#cfddc4',550);text(right,1130,1002,21,'#a2bd9f');}

async function frame(id,sec){
 const progress=sec/30;
 if(id==='01-present-sdl'){
  const r=data.present.replay,t=sec<15?sec*2:620+(sec-15)*3;
  base('The SDL lab, one station at a time','One arm, one stirrer, one sample AMR — the present-scale simulation', '01 / 06');
  const image=await renderLab('present',t,'3d',progress);labPanel(image,t,'3d',sec<15?2:3,r);counters(r,t);
  wrap(sec<15?'24 literature-derived mixing jobs. The engine reserves the AMR handoff, arm load and device process before starting each batch.':'Time cut: the 600-second mixing operation ends. The arm unloads the sample, then loads the next job after the AMR handoff.',1320,465,535,26,'#c8dcc3',38);
  eventPanel(r,t,1320,680);lowerStrip('TASK 01 · single-station saturation','Room and per-type counts are constraints');
 }else if(id==='02-future-sdl'){
  const r=data.future.replay,t=sec<15?sec*2.6:3600+(sec-15)*4;
  base('A laboratory with 128 working arms','128 stirrers · 256 jobs · 8 AMRs · 22 × 24 m · separately executed scaling demo','02 / 06');
  const image=await renderLab('future',t,'3d',progress);labPanel(image,t,'3d',sec<15?'2.6':'4',r);counters(r,t);
  tag('SCALING DEMO · NOT A MODEL RANKING',1320,430);
  const peak=meta.future.concurrency;
  wrap(sec<15?'Prepared samples begin in finite local arm buffers. The trace reaches '+peak.peak_arm_actions+' simultaneous arm actions and '+peak.peak_processes+' simultaneous processes.':'Time cut: after the 3,600-second mixing operation. Recorded unload / reload actions start the next wave.',1320,520,528,28,'#c8dcc3',42);
  eventPanel(r,t,1320,735);lowerStrip('Actual resource IDs and engine events · no duplicated animation','Camera cut + simulation time cut are explicit');
 }else if(id==='03-benchmark-task'){
  const r=data.benchmark.replay,mode=sec<14?'3d':'2d',t=sec<14?sec*3:sec<22?11018.1+(sec-14)*4:11771.9+(sec-22)*4;
  base('Fit 36 owned instruments into a two-bay lab','TASK 12 · Keep instrument identities fixed; move equipment through the external gate','03 / 06');
  const image=await renderLab('benchmark',t,mode,progress);labPanel(image,t,mode,sec<14?3:4,r);counters(r,t);
  tag(sec<14?'3D → inspect physical equipment':'2D → inspect geometry and routes',1320,425);
  wrap('Instruction: complete the same '+r.jobs.length+' jobs in a 4 × 3.4 m room, with only 2 active device positions. Choose priorities and schedule physical equipment exchanges.',1320,514,535,27,'#c8dcc3',39);
  const p=projectedReplay(r,t);text('In-room view: '+p.layout.devices.length+' / owned: 36',1320,739,29,'#e3c58c',650);
  wrap(sec<14?'First 42 simulation seconds at 3×. The next shots cut to the recorded equipment exchange.':sec<22?'Time cut: two sonicators leave through the gate at 4×. Committed operations have already drained.':'Time cut: a centrifuge and stirrer enter at 4×. Calibration time remains included in the full recorded makespan.',1320,800,535,24,'#a3bfa3',36);
  lowerStrip('GPT Luna saved run · actual equipment identities and moves','At 00:14 the view switches from 3D to 2D');
 }else if(id==='05-model-decisions'){
  const key=sec<15?'luna':'jev',local=sec%15,t=local<7?local*7:(local-7)*6+1800,r=data[key].replay,mode=local<7?'3d':'2d';
  base((key==='luna'?'GPT Luna':'Jev')+' chooses which jobs go first','TASK 11 · six long single-stage jobs compete with six three-stage chains','05 / 06');
  const image=await renderLab(key,t,mode,local/15);labPanel(image,t,mode,local<7?7:6,r);counters(r,t);priorities(r,t,1320,434,6);
  const e=priorityEvent(r,t);text('POLICY RATIONALE · UNVERIFIED TEXT',1320,805,18,'#b8b88c',600);wrap(e?.reason??'',1320,846,535,20,'#aac1a5',29,5);
  lowerStrip('Same public state → policy adapter → engine priorities','Time cut exposes the next 1,800 s decision');
 }else if(id==='06-results')drawResults(sec);
 else await drawTour(sec);
}
function resultValue(task,method){return report.results.find(r=>r.task_id==='lemat-sdl-'+task&&r.method===method);}
function drawResults(sec){
 const cases=['11-priority-tail','12-overfull-inventory','13-lookahead-exchange','14-layout-distance'],index=Math.min(3,Math.floor(sec/7.5)),id=cases[index],scenario=report.scenarios.find(s=>s.id===id);
 base('Better decisions, measured in completion time','Same room, owned resources, workload, seed, decision cadence and execution engine','06 / 06',true);
 text('0'+(index+1)+'  /  '+scenario.name,55,252,31,'#194a32',650);
 const rows=report.methods.map(m=>({...m,r:resultValue(id,m.id)})),max=Math.max(...rows.map(x=>x.r.makespan_s));
 rows.forEach((m,i)=>{const y=320+i*103; text(m.label,58,y+16,24,'#315b42',550);box(380,y-18,870,49,'#e8eee4',5);box(380,y-18,870*m.r.makespan_s/max,49,colors[i],5);text((m.r.makespan_s/3600).toFixed(3)+' h',1282,y+16,28,'#294e37',600);});
 text('Full-workload makespan ↓  ·  simulation hours',380,858,22,'#5c7562');
 box(1460,233,410,661,'#edf2e9');text('WHY PRIORITY MATTERS',1483,280,21,'#305a3e',700);
 if(index===0){
  wrap('Fixed layout, same workload:',1483,333,355,25,'#3f6048',36);
  const a=report.ablations.find(r=>r.method==='ablation-packed-full-fifo'),b=report.ablations.find(r=>r.method==='ablation-packed-full-tail');
  text('FIFO',1483,431,24,'#6b7965');text((a.makespan_s/3600).toFixed(3)+' h',1483,480,44,'#30553a',650);
  text('Downstream-first',1483,555,24,'#6b7965');text((b.makespan_s/3600).toFixed(3)+' h',1483,604,44,'#30553a',650);
  text(((1-b.makespan_s/a.makespan_s)*100).toFixed(1)+'% less time',1483,700,35,'#26745a',700);
  wrap('Start long downstream chains early; overlap independent work.',1483,767,350,23,'#526e59',34);
 }else if(index===3){wrap('A workload-aware algorithm matches Jev and beats this Luna trial. LLM superiority is not assumed.',1483,342,350,29,'#365a40',43);wrap('No general optimum or stable model ranking is established by a single trial.',1483,652,350,26,'#647861',39);}
 else{
  text('SAVED INITIAL PRIORITIES',1483,327,18,'#648062',650);
  for(const [k,j]of [['luna',0],['jev',1]]){text(k==='luna'?'GPT Luna':'Jev',1483+j*185,375,25,colors[j===0?3:4],700);const ps=priorityEvent(data[k].replay,0).priorities;[6,7,8,0,1].forEach((n,i)=>text(ps[n].job_id+'  '+ps[n].priority,1483+j*185,423+i*48,22,'#426447'));}
  wrap('Priority illustration: task 11, t=0. Values are policy outputs, not probabilities.',1483,736,352,22,'#63795f',32);
 }
 text('One saved trial per method / condition. Restricted candidate menu. These are scheduling simulations, not wet-lab measurements.',55,975,23,'#5c735c');
}
const shots={};
for(const key of ['fixed','scheduler','benchmarks']){try{const im=new Image();im.src='/source/ui-'+key+'.png';await im.decode();shots[key]=im;}catch{}}
const nativeShots={},nativeCache=new Map();
for(const key of ['fixed','scheduler','benchmarks']){try{const response=await fetch('/source/native-'+key+'.json');if(response.ok)nativeShots[key]=await response.json();}catch{}}
async function nativeShot(key,seconds){
 const shot=nativeShots[key]?.filter(s=>s.time_ms<=seconds*1000).at(-1);if(!shot)return shots[key];
 const url='/source/native-'+key+'/'+shot.file;if(nativeCache.has(url))return nativeCache.get(url);
 const image=new Image();image.src=url;await image.decode();nativeCache.set(url,image);if(nativeCache.size>3)nativeCache.delete(nativeCache.keys().next().value);return image;
}
async function drawTour(sec){
 const step=Math.min(3,Math.floor(sec/7.5)),names=['Design the room and resource counts','Inspect the common scheduler interface','Compare stored benchmark results','Replay the actual engine in 3D and 2D'];
 base('One interface from lab design to evidence',names[step],'04 / 06');
 const sourceKey=['fixed','scheduler','benchmarks'][step];
 if(step<3&&!shots[sourceKey]&&!nativeShots[sourceKey]?.length)throw new Error('UI tour requires captured ui-*.png or native screen sequences in sources/. Other five clips use the saved engine recordings.');
 if(step<3){
  const shotKey=['fixed','scheduler','benchmarks'][step],im=await nativeShot(shotKey,sec%7.5),w=1248,h=im.height/im.width*w,x=40,y=229,f=(sec%7.5)/7.5;
  box(x-4,y-4,w+8,744,'#466b50',8);c.save();c.beginPath();c.rect(x,y,w,736);c.clip();c.drawImage(im,x,y-f*Math.max(0,h-736),w,h);c.restore();
  const details=[['Exact installed counts','Choose equipment, arms and AMRs under task ceilings. Inspect actual geometry before comparing the full-workload completion time.'],['Public observation and decision','The engine exposes remaining jobs, required capabilities, reservations and priorities. The same decision contract accepts algorithms and model adapters.'],['Saved evidence, ready to replay','Fourteen tasks and fifty saved trials. Compare all five policies, then inspect layouts, priority changes and event history without API credentials.']][step];
  text(details[0],1320,320,30,'#dfeccc',650);wrap(details[1],1320,390,530,29,'#afccad',43);tag(nativeShots[shotKey]?'ACTUAL UI RECORDING · PAN':'ACTUAL APP SCREENSHOT · PAN',1320,680);
 }else{
  const r=data.luna.replay,t=(sec-22.5)*8,mode=sec<26?'3d':'2d',image=await renderLab('luna',t,mode,sec/30);labPanel(image,t,mode,8,r);counters(r,t);priorities(r,t);
 }
 lowerStrip('Actual application screens · recordings need no API key','Full results UI is shared through the private repo');
}
async function preview(){status.textContent='Rendering preview…';await frame($('#clip').value,$('#clip').value==='02-future-sdl'?8:3);status.textContent='Ready · 1920×1080 · 30 fps · 900 deterministic frames per clip';}
async function capture(ids){
 if(busy)return;busy=true;document.querySelectorAll('button,select').forEach(e=>e.disabled=true);
 try{for(const id of ids){for(let n=0;n<900;n++){
  await frame(id,n/30);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.94));if(!blob)throw new Error('Frame encoding failed');
  const response=await fetch('/capture/'+id+'/'+String(n).padStart(4,'0')+'.jpg',{method:'POST',body:blob});if(!response.ok)throw new Error(await response.text());
  if(n%15===0){status.textContent=id+' · '+(n+1)+' / 900';await new Promise(resolve=>setTimeout(resolve,0));}
 }}status.textContent='Export complete · '+ids.join(', ')+' · frames saved locally';}
 catch(e){status.textContent='Export failed: '+e.message;console.error(e);}
 finally{busy=false;document.querySelectorAll('button,select').forEach(e=>e.disabled=false);}
}
$('#preview').onclick=()=>preview().catch(e=>status.textContent=e.message);$('#clip').onchange=preview;$('#export').onclick=()=>capture([$('#clip').value]);$('#all').onclick=()=>capture(clips);
await preview();
