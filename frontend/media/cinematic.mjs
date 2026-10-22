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
 const large=id==='04-ui-tour',width=large?3840:1920,height=large?2160:1080,sceneH=large?1984:1080;
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
 const shot=Math.floor(sec/10),f=(sec%10)/10,focus=shots.future.focus[shot];
 if(shot===1)return {at:[lerp(44,41,f),lerp(43,40,f),lerp(32,28,f)],target:[19,15,.3],fov:47};
 if(shot===2){const time=shots.future.starts[2]+(sec%10)*shots.future.rates[2],car=carriersAt(data.future.replay,time).find(c=>c.id===shots.future.tracking_car),p=car?.point??focus;return {at:[p[0]+4.2,p[1]+5.0,3.6],target:[p[0],p[1],.7],fov:49};}
 return {at:[focus[0]+lerp(6.6,5.8,f),focus[1]+lerp(8.2,7.4,f),lerp(5.8,5.1,f)],target:[focus[0],focus[1],.8],fov:49};
}
function ranked(replay,t){const e=replay.decisions.filter(e=>e.type==='scheduler_priorities'&&e.time_s<=t).at(-1);return {event:e,order:[...(e?.priorities??[])].sort((a,b)=>b.priority-a.priority||a.job_id.localeCompare(b.job_id))};}
function priorityRail(key,t,wall,rate){
 const replay=data[key].replay,events=replay.decisions.filter(e=>e.type==='scheduler_priorities'),index=Math.max(0,events.findLastIndex(e=>e.time_s<=t)),current=ranked(replay,t),previous=index?ranked(replay,events[index-1].time_s):{order:[...current.order].sort((a,b)=>a.job_id.localeCompare(b.job_id))};
 const age=(t-events[index].time_s)/rate,f=ease(age/.65),x=1570,y=123,w=310,row=31;
 rect(x,y,w,70+Math.max(1,current.order.length)*row,'#102c2ae3',12);type('PRIORITY',x+17,y+29,14,'#b9d0c5',700);type('D'+String(index+1).padStart(2,'0'),x+w-55,y+29,15,key==='luna'?'#c5b9f4':'#e9be79',700);
 const changed=current.order.filter((p,i)=>previous.order.findIndex(q=>q.job_id===p.job_id)!==i);
 current.order.forEach((p,i)=>{
  const old=previous.order.findIndex(q=>q.job_id===p.job_id),pos=lerp(old<0?i:old,i,f),yy=y+55+pos*row;
  const highlight=changed.some(q=>q.job_id===p.job_id)&&age<1;
  if(highlight)rect(x+8,yy-18,w-16,29,key==='luna'?'#75609f60':'#a67e3d60',5);
  type(p.job_id,x+18,yy+3,17,'#f0f2e6',600);rect(x+105,yy-11,Math.max(3,p.priority/1000*125),9,key==='luna'?'#bba4e9':'#dfb86d',3);type(String(p.priority),x+245,yy+3,16,'#e4e6d9');
  if(highlight&&old>=0)type(i<old?'↑':'↓',x+83,yy+3,16,key==='luna'?'#d5c8f1':'#f0d398',700);
 });
 return {index,age};
}
function policySummary(index,phase){
 const summaries=['Feed the oven pipeline first','Keep layout. Advance chained jobs','Start the queued chains next'];
 const text=summaries[Math.min(2,index)];
 // Concise editorial summaries of the saved public decision rationale. No
 // invented chain of thought, live token stream or fake model latency.
 if(phase<4.4){
  if(phase>=1.2){rect(44,117,554,94,'#172d2cdb',13);type('POLICY',61,144,13,'#b7aecb',700);type(text,61,181,25,'#f0ece8',600);}
  const labels=['mix','dose','mix','mix','oven'];labels.forEach((name,i)=>{if(phase<i*.22)return;const x=62+i*90;rect(x,225,74,40,i===4?'#b88a48ee':'#416b67d9',8);type(name,x+12,251,17,'#f2f3e7',650);if(i<4)type('→',x+76,250,18,'#506c64',700);});
 }
}
async function frame(id,sec){
 adjustResolution(id);
 if(id==='01-present-sdl'||id==='02-future-sdl'){
  const key=id.startsWith('01')?'present':'future',shot=Math.min(2,Math.floor(sec/10)),rate=shots[key].rates[shot],t=shots[key].starts[shot]+sec%10*rate,cam=key==='present'?presentCamera(sec):futureCamera(sec);
  const image=await lab(key,t,'3d',cam,{close:shot!==1});ctx.drawImage(image,0,0,1920,1080);tinyUI(key==='present'?'SDL':'FUTURE SDL',null,t,{clean:true});
 }else if(id==='03-benchmark-task'){
  const t=sec<14?sec*3:sec<22?11018.1+(sec-14)*4:11771.9+(sec-22)*4,mode=sec<14?'3d':'2d';
  const image=await lab('benchmark',t,mode,{at:[5.1,6.2,4.8],target:[2,1.7,.45],fov:40});ctx.drawImage(image,0,0,1920,1080);tinyUI('36 instruments · 2 bays',sec<14?3:4,t);if(sec>=14)textPill(sec<22?'OUT':'IN',28,76,70);
 }else if(id==='04-ui-tour'){
  const mode=sec<15?'3d':'2d',t=shots.ui.start+(sec%15)*12,room=data.ui.replay.configuration.room;
  const cam={at:[room.width_m*(1.1-.12*(sec%15)/15),room.depth_m*1.5,room.width_m*.8],target:[room.width_m/2,room.depth_m/2,.4],fov:40};
  const image=await lab('ui',t,mode,cam,{labels:false});ctx.drawImage(image,0,54,1920,992);
  rect(0,0,1920,54,'#153429',0);type('▦ LabOpsBench',23,35,23,'#e7eee0',700);textPill('2D',1670,8,70);textPill('3D',1751,8,70);rect(mode==='2d'?1670:1751,8,70,38,'#b8c993',7);type(mode.toUpperCase(),mode==='2d'?1686:1767,35,18,'#1c3d2a',650);
  rect(0,1046,1920,34,'#153429',0);type('❚❚',23,1070,17);rect(75,1060,1570,3,'#69806a',0);rect(75,1060,1570*sec/30,3,'#d5bb78',0);type('12×',1710,1070,16);type('Simulation',1800,1070,15);
 }else{
  const key=id==='05-gpt-policy'?'luna':'jev',phase=sec%10,index=Math.min(2,Math.floor(sec/10));
  const rate=key==='luna'?45:Math.round(data.jev.metrics.makespan_s/30),t=key==='luna'?index*1800+Math.max(0,phase-2)*rate:sec*data.jev.metrics.makespan_s/30;
  const cam={at:[5.4-.15*Math.sin(sec/12),7.1,3.6],target:[2,3.55,.9],fov:47};
  const image=await lab(key,t,'3d',cam);ctx.drawImage(image,0,0,1920,1080);tinyUI(key==='luna'?'GPT Luna':'Jev',rate,t,{policy:true});priorityRail(key,t,sec,rate);if(key==='luna')policySummary(index,phase);
 }
}
async function preview(){await frame($('#clip').value,Number($('#at').value));status.textContent='Ready · minimal text · native scene render';}
async function capture(ids){
 if(busy)return;busy=true;document.querySelectorAll('button,input,select').forEach(e=>e.disabled=true);
 try{for(const id of ids){keyNow=null;signature=null;for(let n=0;n<900;n++){
  await frame(id,n/30);const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.98));const res=await fetch('/capture/'+id+'/'+String(n).padStart(4,'0')+'.jpg',{method:'POST',body:blob});if(!res.ok)throw new Error(await res.text());
  if(n%15===0){status.textContent=id+' · '+n+' / 900';await new Promise(r=>setTimeout(r,0));}
 }}status.textContent='Export complete · '+ids.join(', ');}catch(e){status.textContent=e.message;console.error(e);}finally{busy=false;document.querySelectorAll('button,input,select').forEach(e=>e.disabled=false);}
}
$('#preview').onclick=()=>preview().catch(e=>status.textContent=e.message);$('#clip').onchange=preview;$('#at').oninput=preview;$('#export').onclick=()=>capture([$('#clip').value]);$('#all').onclick=()=>capture([...$('#clip').options].map(o=>o.value));await preview();
