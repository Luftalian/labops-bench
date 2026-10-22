import {PlanView} from '/workshop/plan-view.mjs';
import {displayResult} from './stage1-adapter.mjs';
const $ = q => document.querySelector(q), $$ = q => [...document.querySelectorAll(q)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = n => n === null || n === undefined ? '—' : Number(n.toFixed(2)).toLocaleString();
let tasks, originalCatalog, bundle, run = null, history = [], selected = null, replay, visualCatalog, three;
let time = 0, playing = false, view = 'plan', lastFrame = performance.now();
const plan = new PlanView($('#plan-canvas'), () => {});
const originalText = plan.text.bind(plan);
plan.text = (text, ...args) => {
  if(text.startsWith('0.1 m placement grid'))text='Fixed slots / recorded graph transport / illustrative equipment';
  if(/^\d+m$/.test(text)&&args[0]<0)text=(bundle.task.room.depth_m-Number(text.slice(0,-1)))+'m';
  originalText(text,...args);
};
async function api(path, body, headers = {}) {
  const response = await fetch(path, body === undefined ? undefined : {method:'POST', headers:{'Content-Type':'application/json',...headers}, body:JSON.stringify(body)});
  const data = await response.json(); if (!response.ok) throw new Error(data.message ?? data.error ?? 'Request failed'); return data;
}
function reset() {
  bundle = tasks[Number($('#task').value)]; run = null; history = []; selected = null; replay = null; playing = false;
  $('#counts').innerHTML = bundle.catalog.devices.map(d => `<label class="count-row">${esc(d.device_type)} · ${d.unit_cost_credits} cr<input name="${d.device_type}" type="number" min="0" max="${d.max_instances}" step="1" value="${Number(bundle.workflow.steps.some(s=>s.device_type===d.device_type))}" aria-label="${d.device_type} count"></label>`).join('');
  $('#budget').textContent = bundle.task.equipment_budget_credits + ' credits'; $('#horizon').textContent = bundle.task.horizon_s + ' s';
  $('#source').textContent = bundle.fixture_note; $('#title').textContent = `STAGE 1 / ${bundle.task.room.width_m} × ${bundle.task.room.depth_m} m`;
  $('#calls').textContent = '0 / 20'; $('#history').innerHTML = ''; $('#ledger').innerHTML = ''; $('#events').textContent = '0 EVENTS';
  $('#empty').hidden = false; $('#export').disabled = true; $('#message').textContent = '';
  $('#time').textContent='0 s'; $('#plan-canvas').hidden=true; $('#three-container').hidden=true;
  for (const id of ['completed','throughput','cost','makespan']) $('#' + id).textContent = '—';
  $('#origin').textContent = 'Run the evaluator to generate a simulation result.';
}
async function show(index) {
  selected = history[index]; time = 0; playing = false; $('#timeline').value = 0; $('#play').textContent = '▶';
  const r = selected.result;
  $('#time').textContent='0 s'; $('#plan-canvas').hidden=!r.valid||view!=='plan'; $('#three-container').hidden=!r.valid||view!=='three';
  $('#origin').textContent = `Origin: ${r.result_origin}. Task ${r.task_id} / ${r.task_version}. ${r.status.toUpperCase()}.`;
  $('#completed').textContent = r.metrics ? r.metrics.completed_jobs + ' / ' + bundle.task.jobs.length : '—';
  $('#throughput').textContent = number(r.metrics?.throughput_jobs_per_hour); $('#cost').textContent = number(r.metrics?.equipment_cost_credits);
  $('#makespan').textContent = r.status === 'truncated' ? 'Unfinished' : r.metrics ? number(r.metrics.makespan_s) + ' s' : '—';
  $('#message').textContent = r.violations.map(v => v.code + ': ' + v.message).join(' · ');
  $('#export').disabled = false;
  $('#empty').hidden = r.valid; $('#empty').textContent = r.valid ? '' : 'Invalid design · no simulation events';
  const display = displayResult(bundle, r, originalCatalog); replay = display.replay; visualCatalog = display.catalog;
  $('#ledger').innerHTML = r.events.map(e => `<div class="ledger-row" data-start="${e.start_s}" data-end="${e.end_s}"><b>${esc(e.kind.replaceAll('_',' '))} · ${esc(e.resource_id)}</b>${esc(e.job_id)}${e.step_id?' / '+esc(e.step_id):''}<br>${number(e.start_s)} → ${number(e.end_s)} s${e.distance_m?' · '+number(e.distance_m)+' m':''}</div>`).join('');
  $('#events').textContent = r.events.length + ' EVENTS';
  if (view === 'three' && r.valid) await buildThree();
  $$('[data-history]').forEach(row => row.classList.toggle('selected', Number(row.dataset.history) === index));
}
async function buildThree() {
  if (!three) {const {ThreeView} = await import('/workshop/three-view.mjs'); three = new ThreeView($('#three-container'), () => {});}
  await three.set(replay, visualCatalog);
}
function addResults(results, requests = []) {
  for (const result of results) history.push({result, request: requests.find(r=>r.submission_id===result.submission_id) ?? null});
  $('#history').innerHTML = history.map(({result:r,request},i) => `<tr data-history="${i}" tabindex="0" aria-label="Replay evaluated design ${i+1}"><td>${esc(r.status)}</td><td>${esc(request?Object.entries(request.equipment_counts).filter(([,n])=>n).map(([k,n])=>k+' '+n).join(', '):r.resolved_placement.length+' devices')}</td><td>${number(r.metrics?.completed_jobs)}</td><td>${number(r.metrics?.throughput_jobs_per_hour)}</td><td>${number(r.metrics?.equipment_cost_credits)}</td><td>${r.status==='truncated'?'Unfinished':number(r.metrics?.makespan_s)}</td></tr>`).join('');
  $$('[data-history]').forEach(row => {row.onclick=()=>show(Number(row.dataset.history)).catch(fail);row.onkeydown=e=>{if(e.key==='Enter')row.click();};});
}
function fail(error) {$('#message').textContent=error.message; $('#run-status').textContent='Failed · details retained in local run journal';}
$('#run').onclick = async () => {
  $('#run').disabled=true; $('#task').disabled=true; $('#method').disabled=true; $('#message').textContent='Evaluating…';
  try {
    const method=$('#method').value;
    if (!run || method!=='manual') run=await api('/v1/runs',{task_id:bundle.task.task_id,task_version:bundle.task.version,method,search_seed:17});
    if(method==='manual') {
      const request={schema_version:'0.1',submission_id:crypto.randomUUID(),task_id:bundle.task.task_id,task_version:bundle.task.version,stage:1,
        equipment_counts:Object.fromEntries([...new FormData($('#counts'))].map(([k,v])=>[k,Number(v)])),simulation_seed:0};
      const result=await api('/v1/evaluations',request,{'X-LabOps-Run-Id':run.run_id}); addResults([result],[request]);
      run=await api('/v1/runs/'+run.run_id);
    } else {
      const data=await api('/v1/runs/'+run.run_id+'/search',{}); run=data.run; addResults(data.results,data.requests);
    }
    $('#calls').textContent=run.used_calls+' / '+run.call_limit;
    const chosen=run.recommendation?history.findIndex(x=>x.result.submission_id===run.recommendation):history.length-1;
    if(chosen>=0)await show(chosen);
    $('#run-status').textContent=`${run.method} · ${run.run_id.slice(0,8)} · ${run.stop_reason??'evaluated'}`;
    if(run.search_error)$('#message').textContent=run.search_error;
  } catch(error){fail(error);} finally {$('#run').disabled=false;$('#task').disabled=false;$('#method').disabled=false;}
};
$('#counts').onsubmit=e=>e.preventDefault(); $('#task').onchange=reset; $('#method').onchange=()=>{run=null;$('#calls').textContent='0 / 20';$('#run').textContent=$('#method').value==='manual'?'Evaluate design ↗':'Run reference search ↗';};
$('#play').onclick=()=>{if(!replay)return;if(time>=replay.metrics.elapsed_s)time=0;playing=!playing;$('#play').textContent=playing?'Ⅱ':'▶';};
$('#restart').onclick=()=>{time=0;playing=false;$('#play').textContent='▶';};
$('#timeline').oninput=e=>{time=Number(e.target.value)/1000*(replay?.metrics.elapsed_s??0);playing=false;$('#play').textContent='▶';};
$$('[data-view]').forEach(button=>button.onclick=async()=>{view=button.dataset.view;$$('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));const valid=selected?.result.valid??false;$('#plan-canvas').hidden=!valid||view!=='plan';$('#three-container').hidden=!valid||view!=='three';if(view==='three'&&replay&&valid)try{await buildThree();}catch(error){fail(error);}});
$('#export').onclick=()=>{if(!selected)return;const blob=new Blob([JSON.stringify({bundle,run,request:selected.request,result:selected.result},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='labops-stage1-'+selected.result.submission_id+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
function frame(now){const dt=Math.min(.1,(now-lastFrame)/1000);lastFrame=now;if(replay&&selected?.result.valid){if(playing){time=Math.min(replay.metrics.elapsed_s,time+dt*Number($('#speed').value));if(time>=replay.metrics.elapsed_s){playing=false;$('#play').textContent='▶';}}
 if(view==='plan'){plan.set(replay,visualCatalog);plan.draw(time,{labels:true,ports:false,routes:true});}else three?.draw(time,{labels:true});
 $('#timeline').value=replay.metrics.elapsed_s?time/replay.metrics.elapsed_s*1000:0;$('#time').textContent=number(time)+' s';
 $$('.ledger-row').forEach(row=>row.classList.toggle('active',Number(row.dataset.start)<=time&&Number(row.dataset.end)>time));}requestAnimationFrame(frame);}
try{[tasks,originalCatalog]=await Promise.all([api('/v1/tasks'),api('/assets/poc-catalog.json')]);$('#task').innerHTML=tasks.map((b,i)=>`<option value="${i}">${esc(b.task.task_id)} · v${esc(b.task.version)}</option>`).join('');$('#task').value=tasks.length>1?'1':'0';reset();requestAnimationFrame(frame);}catch(error){fail(error);}
