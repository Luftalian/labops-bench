import {ThreeView} from '/workshop/media-three.mjs';
import {PlanView} from '/workshop/plan-view.mjs';
import {projectedReplay} from '/replay-layout.mjs';
import {furnish} from '/media/lab-furniture.mjs';
import {carriersAt} from '/workshop/timeline.mjs';
const $=q=>document.querySelector(q),canvas=$('#output'),ctx=canvas.getContext('2d'),status=$('#status');
const names=['present','future','benchmark','luna','jev','ui'];
const data=Object.fromEntries(await Promise.all(names.map(async k=>{const r=await fetch('/source/'+k+'.json');return [k,r.ok?await r.json():null];})));
const catalog=await(await fetch('/source/catalog.json')).json(),shots=await(await fetch('/source/shot-plan.json')).json();
const view=new ThreeView($('#stage3'),()=>{}),plan=new PlanView($('#stage2'),()=>{});view.renderer.setPixelRatio(1);
let keyNow=null,signature=null,fixtures=null,busy=false,modeSize='';
const ease=f=>{f=Math.max(0,Math.min(1,f));return f*f*(3-2*f);},lerp=(a,b,f)=>a+(b-a)*f;
function type(s,x,y,size=18,color='#e7efea',weight=500){ctx.font=`${weight} ${size}px system-ui`;ctx.fillStyle=color;ctx.fillText(s,x,y);}
function rect(x,y,w,h,color,r=12){ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function textPill(s,x,y,w){rect(x,y,w,38,'#16302dcc',8);type(s,x+13,y+25,17);}
function tinyUI(label,rate,t,{policy=false,clean=false}={}){
 if(clean){rect(1790,1035,105,27,'#17342b60',5);type('Simulation',1802,1054,14,'#e4eee5');return;}
 textPill(label,28,25,label.length*11+30);
 type('LabOpsBench',28,1054,16,'#eaf3ec',650);type(policy?'Saved decisions':'Simulation',1742,1054,14,'#e4eee5');
 if(rate)textPill(`${rate}×`,1810,25,81);
}
function adjustResolution(id){
 const large=id==='03-benchmark-task',width=large?3840:1920,height=large?2160:1080,sceneH=large?2160:1080;
 const s=width+'x'+sceneH;if(modeSize!==s){canvas.width=width;canvas.height=height;$('#stage3').style.width=width+'px';$('#stage3').style.height=sceneH+'px';$('#stage2').style.width=width+'px';$('#stage2').style.height=sceneH+'px';modeSize=s;}
 ctx.setTransform(width/1920,0,0,width/1920,0,0);ctx.fillStyle='#dce4df';ctx.fillRect(0,0,1920,1080);
}
async function lab(key,t,mode,camera,options={}){
 if(!data[key])throw new Error(key+' simulation is still being prepared');
 const replay=projectedReplay(data[key].replay,t),sig=key+':'+replay.layout.devices.map(d=>d.id).join(',');
 if(mode==='2d'){plan.set(replay,catalog);plan.draw(t,{labels:options.labels??false,ports:false,routes:true,reach:false});return $('#stage2');}
 if(keyNow!==key||signature!==sig){await view.set(replay,catalog);if(['present','future'].includes(key))fixtures=furnish(view,replay);else{fixtures={sun:view.scene.children.find(o=>o.isDirectionalLight)};view.renderer.toneMapping=0;view.renderer.toneMappingExposure=1;view.scene.children.filter(o=>o.isHemisphereLight).forEach(l=>l.intensity=2.8);fixtures.sun.intensity=4;fixtures.sun.position.set(-4,-2,12);fixtures.sun.target.position.set(0,0,0);}keyNow=key;signature=sig;}
 else{view.result=replay;for(const machine of view.devices){const d=replay.layout.devices.find(d=>d.id===machine.d.id);if(d){machine.d=d;machine.group.position.x=d.x;machine.group.position.y=d.y;machine.group.rotation.z=d.rotation*Math.PI/180;}}}
 view.controls.enableDamping=false;view.controls.target.set(...camera.target);view.camera.position.set(...camera.at);view.camera.fov=camera.fov??40;view.camera.updateProjectionMatrix();
 const shadow=key!=='future'||options.close;view.renderer.shadowMap.enabled=Boolean(shadow);
 const sun=fixtures.sun,range=key==='future'?8:10;sun.shadow.camera.left=-range;sun.shadow.camera.right=range;sun.shadow.camera.top=range;sun.shadow.camera.bottom=-range;sun.shadow.camera.updateProjectionMatrix();
 view.draw(t,{labels:false,ports:false,reach:false});return view.renderer.domElement;
}
function presentCamera(sec){
 const shot=Math.floor(sec/10),f=(sec%10)/10;
 if(shot===0)return {at:[lerp(7.8,6.6,f),lerp(7.3,6.6,f),lerp(4.6,3.8,f)],target:[3.55,2.75,.85],fov:39};
 if(shot===1)return {at:[lerp(3.9,3.3,f),lerp(5.5,5.0,f),2.6],target:[1.8,2.8,1],fov:42};
 return {at:[lerp(7.4,6.6,f),lerp(5.6,5.0,f),2.8],target:[5.3,2.8,1],fov:43};
}
function futureCamera(sec){
 const shot=sec<15?0:2,f=(sec%15)/15,focus=shots.future.focus[shot];
 if(shot===2){const time=shots.future.starts[2]+(sec%15)*shots.future.rates[2],car=carriersAt(data.future.replay,time).find(c=>c.id===shots.future.tracking_car),p=car?.point??focus;return {at:[p[0]+4.2,p[1]+5.0,3.6],target:[p[0],p[1],.7],fov:49};}
 return {at:[focus[0]+lerp(6.6,5.8,f),focus[1]+lerp(8.2,7.4,f),lerp(5.8,5.1,f)],target:[focus[0],focus[1],.8],fov:49};
}
function ranked(replay,t){const e=replay.decisions.filter(e=>e.type==='scheduler_priorities'&&e.time_s<=t).at(-1);return {event:e,order:[...(e?.priorities??[])].sort((a,b)=>b.priority-a.priority||a.job_id.localeCompare(b.job_id))};}
const formula = j => j.name==='Ca10(PO4)6(OH)2'?'Ca₁₀(PO₄)₆(OH)₂':j.name==='Cs3Bi2I9'?'Cs₃Bi₂I₉':j.name;
function priorityRail(key,t,wall,rate){
 const replay=data[key].replay,events=replay.decisions.filter(e=>e.type==='scheduler_priorities'),index=Math.max(0,events.findLastIndex(e=>e.time_s<=t)),current=ranked(replay,t),previous=index?ranked(replay,events[index-1].time_s):{order:[...current.order].sort((a,b)=>a.job_id.localeCompare(b.job_id))};
 const age=(t-events[index].time_s)/rate,f=ease(age/.65),x=1425,y=145,w=455,row=59;
 rect(x,y,w,65+Math.max(1,current.order.length)*row,'#102c2aee',14);type('JOB PRIORITY',x+20,y+32,20,'#b9d0c5',700);type('D'+String(index+1).padStart(2,'0'),x+w-70,y+32,22,key==='luna'?'#c5b9f4':'#e9be79',700);
 const changed=current.order.filter((p,i)=>previous.order.findIndex(q=>q.job_id===p.job_id)!==i);
 current.order.forEach((p,i)=>{
  const j=replay.jobs.find(j=>j.id===p.job_id),old=previous.order.findIndex(q=>q.job_id===p.job_id),pos=lerp(old<0?i:old,i,f),yy=y+66+pos*row;
  const highlight=changed.some(q=>q.job_id===p.job_id)&&age<1;
  if(highlight)rect(x+9,yy-19,w-18,55,key==='luna'?'#75609f70':'#a67e3d80',6);
  type(formula(j),x+20,yy+1,25,'#f0f2e6',650);type(p.job_id,x+20,yy+24,16,'#b9d0c5');
  rect(x+250,yy-5,Math.max(3,p.priority/1000*100),10,key==='luna'?'#bba4e9':'#dfb86d',3);type(String(p.priority),x+365,yy+3,22,'#e4e6d9');
  if(highlight&&old>=0)type(i<old?'↑':'↓',x+213,yy+3,25,key==='luna'?'#d5c8f1':'#f0d398',700);
 });return {index,age,job:replay.jobs.find(j=>j.id===current.order[0]?.job_id)};
}
function modelBrand(key,rate){
 const color=key==='luna'?'#c8b6f2':'#efc16c';rect(35,27,key==='luna'?310:245,88,'#12352eef',13);rect(35,27,8,88,color,3);
 type(key==='luna'?'GPT Luna':'Jev',58,84,48,color,750);textPill(rate+'×',1810,25,81);
 type('Saved decisions',1714,1053,17,'#35554a',600);
}
function materialCard(job,x=43,y=885){
 if(!job)return;const ops=job.nodes.map(n=>n.label);rect(x,y,1325,153,'#14382fe9',14);
 type(formula(job),x+22,y+45,34,'#f2efdf',700);type(job.id,x+1120,y+42,23,'#bad1c2',650);
 type(ops.join('  →  '),x+22,y+93,28,'#e0d5ab',600);
 const devices=[...new Set(job.nodes.map(n=>n.capability))].join(' · ');type(devices,x+22,y+128,19,'#b9d0c5');
}
function policySummary(index){
 const summaries=[['Feed the oven pipeline first.','Run multi-step jobs before the mix-only queue.'],['Keep the current layout.','Advance the hydroxyapatite chains.'],['Start the queued chains next.','Keep downstream equipment supplied.']];
 const lines=summaries[Math.min(2,index)];
 // Editorial summaries of saved public rationale, held for the complete shot.
 rect(43,139,735,176,'#172d2cec',14);type('POLICY',65,173,19,'#c5b9df',750);type(lines[0],65,222,36,'#f2efe8',700);type(lines[1],65,270,27,'#d7ddcf',550);
}
async function frame(id,sec){
 adjustResolution(id);
 if(id==='01-present-sdl'||id==='02-future-sdl'){
  const key=id.startsWith('01')?'present':'future',duration=key==='future'?15:10,shot=key==='future'?(sec<15?0:2):Math.min(2,Math.floor(sec/10)),rate=shots[key].rates[shot],t=shots[key].starts[shot]+sec%duration*rate,cam=key==='present'?presentCamera(sec):futureCamera(sec);
  const image=await lab(key,t,'3d',cam,{close:shot!==1});ctx.drawImage(image,0,0,1920,1080);tinyUI(key==='present'?'SDL':'FUTURE SDL',null,t,{clean:true});
 }else if(id==='03-benchmark-task'){
  const mode=sec<15?'3d':'2d',t=shots.ui.start+(sec%15)*12,room=data.ui.replay.configuration.room;
  const cam={at:[room.width_m*(1.1-.12*(sec%15)/15),room.depth_m*1.5,room.width_m*.8],target:[room.width_m/2,room.depth_m/2,.4],fov:40};
  const image=await lab('ui',t,mode,cam,{labels:false});ctx.drawImage(image,0,0,1920,1080);tinyUI('',null,t,{clean:true});
 }else if(id==='04-ui-tour'){
  throw new Error('Clip 04 is captured from the actual UI; use the UI tour capture workflow.');
 }else{
  const key=id==='05-gpt-policy'?'luna':'jev',phase=sec%10,index=Math.min(2,Math.floor(sec/10));
  const rate=key==='luna'?45:Math.round(data.jev.metrics.makespan_s/30),t=key==='luna'?index*1800+Math.max(0,phase-2)*rate:sec*data.jev.metrics.makespan_s/30;
  const cam={at:[5.4-.15*Math.sin(sec/12),7.1,3.6],target:[2,3.55,.9],fov:47};
  const image=await lab(key,t,'3d',cam);ctx.drawImage(image,0,0,1920,1080);modelBrand(key,rate);const ranking=priorityRail(key,t,sec,rate);materialCard(key==='luna'?data.luna.replay.jobs.find(j=>j.id==='J0007'):ranking.job);if(key==='luna')policySummary(index);
 }
}
async function preview(){await frame($('#clip').value,Number($('#at').value));status.textContent='Ready · revision 3';}
async function capture(ids){
 if(busy)return;busy=true;document.querySelectorAll('button,input,select').forEach(e=>e.disabled=true);
 try{for(const id of ids){keyNow=null;signature=null;for(let n=0;n<900;n++){
  await frame(id,n/30);const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.98));const res=await fetch('/capture/'+id+'/'+String(n).padStart(4,'0')+'.jpg',{method:'POST',body:blob});if(!res.ok)throw new Error(await res.text());
  if(n%15===0){status.textContent=id+' · '+n+' / 900';await new Promise(r=>setTimeout(r,0));}
 }}status.textContent='Export complete · '+ids.join(', ');}catch(e){status.textContent=e.message;console.error(e);}finally{busy=false;document.querySelectorAll('button,input,select').forEach(e=>e.disabled=false);}
}
$('#preview').onclick=()=>preview().catch(e=>status.textContent=e.message);$('#clip').onchange=preview;$('#at').oninput=preview;$('#export').onclick=()=>capture([$('#clip').value]);$('#all').onclick=()=>capture([...$('#clip').options].map(o=>o.value).filter(id=>!['01-present-sdl','04-ui-tour'].includes(id)));await preview();
