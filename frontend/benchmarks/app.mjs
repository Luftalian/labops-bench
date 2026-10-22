import {projectedReplay} from '/replay-layout.mjs';
import {PlanView} from '/workshop/plan-view.mjs';
const $=q=>document.querySelector(q),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>v==null||!Number.isFinite(v)?'—':Number(v.toFixed(3)).toLocaleString();
const clock=s=>{s=Math.max(0,Math.floor(s));return [Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(v=>String(v).padStart(2,'0')).join(':');};
const colors=['#c6a77d','#a9cd8e','#71c4c6','#c0a5e8','#e9af83'];
const shortMethods={'fifo':'FIFO','heuristic':'Reference','algorithm-advanced':'Algorithm','gpt-6-luna-medium':'GPT Luna','jev':'Jev'};
const shortScenarios={'11-priority-tail':'Pipeline scheduling','12-overfull-inventory':'More equipment than space','13-lookahead-exchange':'Incoming job waves','14-layout-distance':'Compact lab layouts'};
async function recording(url){const response=await fetch(url);if(!response.ok)throw new Error('Recording unavailable: '+response.status);return url.endsWith('.gz')?JSON.parse(await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).text()):response.json();}
const report=await(await fetch('/benchmarks/report.json')).json(),catalog=await(await fetch('/benchmarks/catalog.json')).json();
let result,row,replay,three,mode='plan',time=0,playing=false,last=performance.now(),selection=0,selectedIndex=-1,decisionIndex=-2,epochs=[],rebuilding=false;
const plan=new PlanView($('#plan-canvas'),id=>$('#message').textContent=id);
const scenarioFor=r=>report.scenarios.find(s=>'lemat-sdl-'+s.id===r.task_id);
const scenarioName=s=>shortScenarios[s.id]??s.name;
const methodName=id=>report.methods.find(m=>m.id===id)?.label??id;
const completedHours=r=>r.status==='completed'&&Number.isFinite(r.makespan_s)?r.makespan_s/3600:null;
$('#summary').textContent=`${report.scenarios.length} scenarios · ${report.results.length} saved runs · ${report.methods.length} policies`;
$('#suite-badge').textContent=`LeMat SDL · ${report.scenarios.length} scenarios`;
function table(){
 const scope=$('#scope').value,scenarios=report.scenarios.filter(s=>scope==='all'||Boolean(s.category)===(scope==='challenge'));
 $('#results-header').innerHTML='<tr><th scope="col">Scenario</th>'+report.methods.map(m=>`<th scope="col" title="${esc(m.label)}">${esc(shortMethods[m.id]??m.label)}</th>`).join('')+'</tr>';
 $('#results').innerHTML=scenarios.map(s=>`<tr data-selected="${row?.task_id==='lemat-sdl-'+s.id}"><td><b>${esc(scenarioName(s))}</b><small>${s.room.join(' × ')} m · ${s.groups.reduce((a,g)=>a+g.count,0)} jobs</small></td>${report.methods.map(({id:m})=>{const i=report.results.findIndex(r=>r.task_id==='lemat-sdl-'+s.id&&r.method===m),r=report.results[i];return `<td>${r?`<button class="result-button" data-result="${i}" aria-pressed="${i===selectedIndex}" aria-label="${esc(scenarioName(s))}, ${esc(methodName(m))}, ${completedHours(r)==null?esc(r.status):n(completedHours(r))+' hours'}">${completedHours(r)==null?esc(r.status):n(completedHours(r))}</button>`:'<span class="muted" aria-label="Not run">—</span>'}</td>`;}).join('')}</tr>`).join('');
 $('#track-note').textContent=scope==='original'?'Original cases use the historical restricted placement menu. Initial layouts matched across the three methods.':'One saved trial per condition. Each policy receives the same public observation and uses the same engine.';
}
table();$('#scope').onchange=()=>{table();if(row&&!document.querySelector(`[data-result=\"${selectedIndex}\"]`)){const first=$('#results [data-result]');if(first)select(Number(first.dataset.result));}};
function comparison(selected){
 const rs=report.results.filter(r=>r.task_id===selected.task_id&&completedHours(r)!==null),end=Math.max(1,...rs.map(r=>r.elapsed_s)),jobs=Math.max(1,selected.total_jobs);
 const x=t=>55+t/end*820,y=c=>185-c/jobs*155;
 const paths=rs.map(r=>{let points='55,185';r.completion_points.forEach((p,i)=>{points+=` ${x(p.completed_s)},${y(i)} ${x(p.completed_s)},${y(i+1)}`;});return `<polyline fill="none" stroke="${colors[report.methods.findIndex(m=>m.id===r.method)]}" stroke-width="2.7" points="${points}"/>`;}).join('');
 $('#comparison-chart').innerHTML=`<svg viewBox="0 0 920 225" role="img" aria-label="Recorded completion count versus simulation hours"><path d="M55 25V185H880" fill="none" stroke="#58725e"/><text x="8" y="28">${selected.total_jobs} jobs</text><text x="30" y="189">0</text>${[0,.25,.5,.75,1].map(f=>`<text x="${x(end*f)}" y="207" text-anchor="middle">${n(end*f/3600)}h</text>`).join('')}${paths}</svg><div class="chart-legend">${rs.map(r=>`<span><i style="background:${colors[report.methods.findIndex(m=>m.id===r.method)]}"></i>${esc(shortMethods[r.method]??methodName(r.method))}</span>`).join('')}</div>`;
 const ref=rs.find(r=>r.method==='heuristic');$('#choice-audit').innerHTML=rs.map(r=>`<div class="choice-chip"><b>${esc(methodName(r.method))}</b><span>${esc(r.initial_candidate)} · ${r.initial_active_models.length} active / ${r.initial_parked_count} outside</span><span>${r.initial_design_hash===ref?.initial_design_hash?'Same placement as reference':'Different placement from reference'}</span></div>`).join('');
}
$('#ablations').innerHTML=['spread-full','packed-full'].map(layout=>{const a=report.ablations.find(r=>r.method==='ablation-'+layout+'-fifo'),b=report.ablations.find(r=>r.method==='ablation-'+layout+'-tail');return a&&b?`<p><b>${esc(layout)}</b> · identical initial layout. FIFO ${n(a.makespan_s/3600)}h → downstream-first ${n(b.makespan_s/3600)}h (${n((1-b.makespan_s/a.makespan_s)*100)}% shorter in this saved run).</p>`:'';}).join('');
$('#caveats').innerHTML=report.caveats.map(c=>'<li>'+esc(c)+'</li>').join('');$('#spend').textContent=`Jev estimated input cost: $${report.jev.known_input_cost_usd.toFixed(6)}; conservative charged/reserved: $${report.jev.charged_or_reserved_usd.toFixed(6)} / $3.`;
function setPlaying(value){playing=Boolean(value&&replay);$('#play').textContent=playing?'❚❚':'▶';$('#play').setAttribute('aria-label',playing?'Pause replay':'Play replay');}
function constraints(s){
 const installed=row.installed_resources,limits=result.context.resource_limits??replay?.resource_limits;
 const inventory=Object.entries(s.equipment).map(([k,v])=>`${k.replace('flex_','')}: ${v}`).join(' · ');
 const exact=Object.entries(installed?.equipment_counts??{}).filter(([,v])=>v).map(([k,v])=>`${k.replace('flex_','')}: ${v}`).join(' · ');
 $('#scenario-details').innerHTML=`<p><b>${esc(s.name)}</b></p><p>${esc(s.purpose)}</p><div class="resource-grid"><div><span>Room</span><b>${s.room.join(' × ')} m</b></div><div><span>Installed arms / AMRs</span><b>${installed?.arms??'—'} / ${installed?.amrs??'—'}</b></div><div><span>Task arm / AMR limits</span><b>${limits?.arms??s.arms} / ${limits?.amrs??s.amrs}</b></div></div><p><b>Equipment limits / owned inventory</b><br><span class="resource-list">${esc(inventory)}</span></p><p><b>Installed equipment</b><br><span class="resource-list">${esc(exact)}</span></p><p>Initial placement: ${esc(row.initial_candidate)} · ${row.initial_active_models.length} active instruments / ${row.initial_parked_count} outside${s.external_staging?' · '+s.external_staging.max_active_devices+' room bays':''}</p><p class="resource-list">${esc(row.task_id)} · task v${esc(row.task_version??s.version??'1')} · ${esc(row.status)}<br>Fixed workload and count ceilings. Literature-derived operation windows with declared engineering assumptions; no chemistry prediction.</p>`;
}
function history(){
 const entries=[...(replay?.layout_history??[]).map(h=>({time_s:h.time_s,type:'active equipment',reason:h.layout.devices.map(d=>d.id).join(', ')+` · ${h.layout.parked_devices?.length??0} outside`})),...(replay?.decisions??[])].sort((a,b)=>a.time_s-b.time_s);
 $('#events').innerHTML=entries.map(e=>`<details class="event"><summary><time>${clock(e.time_s)}</time><span>${esc(e.type.replaceAll('_',' '))}</span></summary><p>${e.type==='scheduler_priorities'?'Recorded rationale (unverified): ':''}${esc(e.reason??e.job_id??e.decision_id??'')}</p>${e.priorities?'<pre>'+esc(e.priorities.map(p=>p.job_id+': '+p.priority).join('\n'))+'</pre>':''}</details>`).join('');
 $('#settings').textContent=`${row.decisions} scheduler decisions · ${row.external_exchanges} physical exchanges · times are simulation HH:MM:SS`;
}
function priorityItems(priorities,offset){return priorities.map((p,i)=>{const j=replay.jobs.find(j=>j.id===p.job_id),steps=j?.nodes.length??0;return `<li><span class="rank">${i+offset+1}</span><div><b>${esc(j?.name??p.job_id)}</b><small>${esc(p.job_id)} · ${steps} ${steps===1?'step':'steps'}</small><div class="priority-bar"><i style="width:${Math.max(0,Math.min(100,p.priority/10))}%"></i></div></div><span class="priority-value">${n(p.priority)}</span></li>`;}).join('');}
function showDecision(){
 const index=epochs.findLastIndex(e=>e.time_s<=time);if(index===decisionIndex)return;decisionIndex=index;const e=epochs[index];
 $('#decision-step').disabled=!epochs.length;$('#decision-step').value=String(Math.max(0,index));$('#decision-time').textContent=e?`${clock(e.time_s)} · decision ${index+1} / ${epochs.length}`:'No scheduler decision at this time';const reason=e?.reason??'No recorded policy rationale.';$('#decision-reason').textContent=reason.length>165?reason.slice(0,165).replace(/\s+\S*$/,'')+'…':reason;$('#decision-full-reason').textContent=reason;$('#full-rationale').hidden=reason.length<=165;$('#full-rationale').open=false;
 const ps=[...(e?.priorities??[])].sort((a,b)=>b.priority-a.priority||a.job_id.localeCompare(b.job_id));$('#priority-list').innerHTML=priorityItems(ps.slice(0,3),0);$('#remaining-priorities').innerHTML=priorityItems(ps.slice(3),3);$('#more-priorities').hidden=ps.length<=3;$('#more-priority-label').textContent=`${Math.max(0,ps.length-3)} more jobs`;$('#more-priorities').open=false;
}
async function select(index){
 const request=++selection,candidate=report.results[index];if(!candidate)return;setPlaying(false);$('.factory').setAttribute('aria-busy','true');
 try{const loaded=await recording(candidate.replay_url);if(request!==selection)return;selectedIndex=index;row=candidate;result=loaded;replay=result.replay??null;time=0;decisionIndex=-2;epochs=(replay?.decisions??[]).filter(e=>e.type==='scheduler_priorities').sort((a,b)=>a.time_s-b.time_s);const s=scenarioFor(row);
  $('#run-name').textContent=scenarioName(s);$('#run-meta').textContent=`${s.room.join(' × ')} m · ${row.total_jobs} jobs · ${row.installed_resources?.arms??s.arms} arms · ${row.installed_resources?.amrs??s.amrs} AMRs`;
  $('#method-name').textContent=methodName(row.method);$('#result-status').textContent=row.status==='completed'?'Completed':row.status;$('#result-status').dataset.status=row.status;$('#completed').textContent=row.completed_jobs+' / '+row.total_jobs;$('#process').textContent=n(row.peak_processes);$('#arms').textContent=n(row.peak_arm_actions);$('#makespan').textContent=n(completedHours(row));$('#empty').hidden=Boolean(replay);$('#export').disabled=false;$('#play').disabled=!replay;$('#restart').disabled=!replay;$('#timeline').disabled=!replay;
  $('#decision-step').innerHTML=epochs.map((e,i)=>`<option value="${i}">${String(i+1).padStart(2,'0')} / ${epochs.length}</option>`).join('');table();comparison(row);constraints(s);history();showDecision();if(three&&replay){const projected=projectedReplay(replay,time);await three.set(projected,catalog);focusLab(projected);}$('#message').textContent='Recorded engine events · playback does not change the score.';
 }catch(e){if(request===selection){replay=null;$('#empty').hidden=false;$('#empty').textContent='This recording could not be loaded.';$('#makespan').textContent='—';$('#result-status').textContent='Unavailable';$('#result-status').dataset.status='error';$('#play').disabled=true;$('#timeline').disabled=true;$('#message').textContent=e.message;}}finally{if(request===selection)$('.factory').removeAttribute('aria-busy');}
}
$('#results').onclick=async e=>{const b=e.target.closest('[data-result]');if(b){await select(Number(b.dataset.result));$('#lab').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}};
$('#play').onclick=()=>{if(replay&&time>=row.elapsed_s)time=0;setPlaying(!playing);};$('#restart').onclick=()=>{time=0;setPlaying(false);};$('#timeline').oninput=()=>{if(replay)time=Number($('#timeline').value)/1000*row.elapsed_s;setPlaying(false);};
$('#decision-step').onchange=()=>{const e=epochs[Number($('#decision-step').value)];if(e){time=e.time_s;setPlaying(false);showDecision();}};
function focusLab(projected){
 const points=[...projected.layout.devices,...projected.layout.robots];if(!points.length)return;
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
 const span=Math.max(3,Math.max(...xs)-Math.min(...xs)+1.8,Math.max(...ys)-Math.min(...ys)+1.8),distance=span*1.25;
 three.camera.position.set(cx+distance*.72,cy+distance,distance*.78);three.controls.target.set(cx,cy,.65);three.controls.update();
}
async function setView(next){mode=next;if(mode==='three'&&!three&&replay){const {ThreeView}=await import('/workshop/three-view.mjs');three=new ThreeView($('#three-container'),id=>$('#message').textContent=id);const projected=projectedReplay(replay,time);await three.set(projected,catalog);focusLab(projected);}$('#plan-canvas').hidden=mode==='three';$('#three-container').hidden=mode!=='three';document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));}
$('#view-plan').onclick=()=>setView('plan').catch(e=>$('#message').textContent=e.message);$('#view-three').onclick=()=>setView('three').catch(e=>$('#message').textContent=e.message);
$('#export').onclick=()=>{if(!result)return;const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));a.href=url;a.download=row.task_id+'-'+row.method+'.json';a.click();URL.revokeObjectURL(url);};
function frame(now){
 if(replay){if(playing){time=Math.min(row.elapsed_s,time+Math.min(.1,(now-last)/1000)*Number($('#speed').value));if(time>=row.elapsed_s)setPlaying(false);}const options={labels:$('#labels').checked,ports:mode==='plan',routes:true,reach:false},projected=projectedReplay(replay,time);plan.set(projected,catalog);
  if(three&&!rebuilding){const old=three.result.layout.devices.map(d=>d.id).join(','),next=projected.layout.devices.map(d=>d.id).join(',');if(old!==next){rebuilding=true;three.set(projected,catalog).then(()=>focusLab(projected)).catch(e=>$('#message').textContent=e.message).finally(()=>rebuilding=false);}else{three.result=projected;for(const m of three.devices){const d=projected.layout.devices.find(d=>d.id===m.d.id);if(d){m.d=d;m.group.position.x=d.x;m.group.position.y=d.y;m.group.rotation.z=(d.rotation??0)*Math.PI/180;}}}}
  if(mode==='plan')plan.draw(time,options);else if(!rebuilding)three?.draw(time,options);$('#timeline').value=row.elapsed_s?time/row.elapsed_s*1000:0;$('#time').textContent=clock(time);showDecision();
 }last=now;requestAnimationFrame(frame);
}
requestAnimationFrame(frame);if(report.results.length)await select(Math.max(0,report.results.findIndex(r=>r.task_id.includes('11-priority-tail')&&r.method==='heuristic')));
