import {projectedReplay as projected} from '/replay-layout.mjs';
import {installTaskParameters} from '/task-parameters.mjs';
import {PlanView} from '/workshop/plan-view.mjs';
const $ = q => document.querySelector(q), $$ = q => [...document.querySelectorAll(q)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = n => Number(n.toFixed(2)).toLocaleString();
let bundles, bundle, observation, result, layoutOverride=null, time = 0, playing = false, last = performance.now(), busy = false;
const plan = new PlanView($('#plan-canvas'), id => {$('#message').textContent = 'Selected ' + id;});
async function api(path, body) {
  const response = await fetch('/scheduler/api/' + path, body === undefined ? undefined : {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)});
  const value = await response.json();
  if (!response.ok) throw new Error(value.violations?.map(v => v.code + ': ' + v.message).join(' · ') || value.error || 'Request failed');
  return value;
}
function counts() {
  layoutOverride=bundle.suggested_design??null;
  $('#initial-layout').innerHTML='<option value="">Generated or edited layout</option>'+(bundle.layout_candidates??[]).map((c,i)=>`<option value="${i}">${esc(c.id)} · ${esc(c.description)}</option>`).join('');
  const t = bundle.task, required = new Set(t.jobs.flatMap(j => j.nodes.map(n => 'flex_' + n.capability)));
  $('#counts').innerHTML = Object.entries(t.resource_limits.equipment).filter(([, cap]) => cap > 0).map(([id, cap]) =>
    `<label class="count-row">${esc(id.replace('flex_', '').replaceAll('_',' '))} ≤ ${cap}<input type="number" name="${id}" min="0" max="${cap}" value="${bundle.suggested_design?.equipment_counts[id]??Number(required.has(id))}" aria-label="${id} count"></label>`).join('') +
    `<label class="count-row">Robot arms ≤ ${t.resource_limits.arms}<input type="number" name="arm_count" min="1" max="${t.resource_limits.arms}" value="${bundle.suggested_design?.arm_count??Math.min(3,t.resource_limits.arms)}" aria-label="Robot arm count"></label>` +
    `<label class="count-row">Sample AMRs ≤ ${t.resource_limits.amrs}<input type="number" name="amr_count" min="1" max="${t.resource_limits.amrs}" value="${bundle.suggested_design?.amr_count??1}" aria-label="AMR count"></label>`;
}
function fill(rule = false) {
  if (!observation || observation.phase === 'done') return;
  const o = observation, priorities = o.jobs.map(j => ({job_id: j.job_id,
    priority: Number($(`[data-job="${j.job_id}"]`)?.value ?? j.current_priority)}));
  if (rule) {
    const ranked = [...o.jobs].sort((a,b) => a.nodes.reduce((s,n) => s + (n.remaining_process_s ?? n.process_s),0) -
      b.nodes.reduce((s,n) => s + (n.remaining_process_s ?? n.process_s),0) || a.job_id.localeCompare(b.job_id));
    for (const p of priorities) {p.priority = Math.max(0, 1000 - ranked.findIndex(j => j.job_id === p.job_id)); $(`[data-job="${p.job_id}"]`).value = p.priority;}
  }
  const decision = {protocol: o.protocol, session_id: o.session_id, snapshot_id: o.snapshot_id,
    epoch_id: o.epoch_id, state_version: o.state_version, decision_id: crypto.randomUUID(),
    reason: rule ? 'Reference rule: prioritize shorter remaining modeled process work; no model inference or optimality claim.' : 'Manual job priorities and physical layout action.',
    priorities, type: o.phase};
  if (o.phase === 'initial_design') {
    const values = Object.fromEntries([...new FormData($('#counts'))].map(([k,v]) => [k, Number(v)]));
    decision.initial_design = {schema_version:'0.2', submission_id:decision.decision_id, task_id:o.context.task_id,
      task_version:o.context.task_version, simulation_seed:o.context.simulation_seed,
      equipment_counts:Object.fromEntries(Object.keys(o.context.resource_limits.equipment).map(k => [k, values[k] ?? 0])),
      arm_count:values.arm_count, amr_count:values.amr_count};
    const suggested=layoutOverride;if(suggested&&values.arm_count===suggested.arm_count&&values.amr_count===suggested.amr_count&&Object.entries(suggested.equipment_counts).every(([k,v])=>v===(values[k]??0)))decision.initial_design.layout=structuredClone(suggested.layout);
  } else {
    const delta = Number($('#move').value), layout = structuredClone(o.layout);
    if (delta) for (const asset of [...layout.devices, ...layout.robots]) asset.x = Number((asset.x + delta).toFixed(6));
    decision.reconfiguration = delta ? {mode:'replace_layout', layout} : {mode:'keep'};
  }
  $('#decision').value = JSON.stringify(decision, null, 2);
}
async function refresh() {
  const id = observation.session_id;
  [observation, result] = await Promise.all([api(`sessions/${id}/observation`), api(`sessions/${id}/result`)]);
  time = observation.time_s; playing = false; $('#play').textContent = '▶';
  $('#epoch').textContent = `EPOCH ${observation.epoch_id} · ${observation.phase.toUpperCase()}`;
  $('#completed').textContent = `${observation.completed_jobs} / ${observation.total_jobs}`;
  $('#clock').textContent = num(observation.time_s) + ' s'; $('#relocation').textContent = observation.reconfiguration_state.phase;
  $('#score').textContent = result.metrics.makespan_s === null ? (observation.phase === 'done' ? 'Unfinished' : 'In progress') : num(result.metrics.makespan_s) + ' s';
  $('#calls').textContent = `${result.used_decisions} / ${observation.config.max_decisions} decisions`;
  $('#status').textContent = `${id.slice(0,8)} · ${result.status} · ${observation.config.decision_interval_s} s epochs`;
  $('#observation').textContent = JSON.stringify(observation, null, 2);
  $('#jobs').innerHTML = observation.jobs.map(j => `<div class="job"><input type="number" min="0" max="1000" step="1" value="${j.current_priority}" data-job="${esc(j.job_id)}" aria-label="Priority ${esc(j.job_id)}"><b>${esc(j.job_id)}</b><small>${esc(j.status)} · arrival ${num(j.arrival_s)} s</small><small>${j.nodes.map(n => esc(n.required_capability) + (n.status === 'completed' ? ' ✓' : '')).join(' → ')}</small></div>`).join('') || '<p class="note">All jobs completed.</p>';
  const locked = observation.phase !== 'initial_design';
  $$('#counts input').forEach(input => input.disabled = locked);
  $('#move').disabled = !locked || observation.phase === 'done' || observation.reconfiguration_state.phase !== 'idle';
  $('#move').value = 'keep';
  $('#empty').hidden = !!result.replay; $('#export').disabled = false;
  $('#receipts').innerHTML = [...result.receipts].reverse().map(r => `<div class="receipt"><b>${esc(r.code)} · ${num(r.time_s)} s</b>${esc(r.status)} · priority ${esc(r.priority_status)}<br>layout ${esc(r.layout_status)}<br><small>${esc(r.decision_id.slice(0,8))}</small>${r.violations.map(v => '<br>' + esc(v.message)).join('')}</div>`).join('');
  $('#activity').innerHTML = [...(result.replay?.decisions ?? [])].reverse().slice(0,50).map(e => `<div class="activity"><b>${esc(e.type.replaceAll('_',' '))} · ${num(e.time_s)} s</b>${esc(e.reason ?? e.job_ids?.join(', ') ?? e.job_id ?? e.decision_id ?? '')}${e.priorities ? '<br>' + esc(e.priorities.map(p => p.job_id + ': ' + p.priority).join(', ')) : ''}</div>`).join('');
  $('#step').disabled = observation.phase === 'done';
  $('#step').textContent = observation.decision_required ? 'Apply decision & advance one epoch ↗' : 'Advance one epoch ↗';
  fill();
}
async function work(fn) {
  if (busy) return; busy = true; $('#new').disabled = true; $('#step').disabled = true; $('#task').disabled = true;
  try {await fn();} catch(e) {$('#message').textContent = e.message;}
  finally {busy = false; $('#new').disabled = false; $('#task').disabled = false; $('#step').disabled = !observation || observation.phase === 'done';}
}
$('#new').onclick = () => work(async () => {
  $('#message').textContent = '';
  observation = await api('sessions', {task_id:bundle.task.task_id, task_version:bundle.task.version});
  localStorage.setItem('labops-scheduler-session', observation.session_id); await refresh();
});
$('#step').onclick = () => work(async () => {
  const decision = JSON.parse($('#decision').value), id = observation.session_id;
  $('#message').textContent = 'Validating decision and advancing the shared engine…';
  let receipt;
  try {if (observation.decision_required) receipt = await api(`sessions/${id}/decisions`, decision);}
  catch(e) {await refresh(); throw e;}
  await api(`sessions/${id}/advance`, {}); await refresh();
  $('#message').textContent = `${receipt?.code ?? 'Retained last accepted decision'}. Engine stopped at ${num(observation.time_s)} s. ${observation.reconfiguration_state.phase === 'draining' ? 'Committed jobs and AMR reservations are draining before relocation.' : ''}`;
});
$('#fill').onclick = () => fill(); $('#rule').onclick = () => fill(true); $('#move').onchange = () => fill();
$('#counts').onsubmit = e => e.preventDefault(); $('#counts').oninput = () => fill();
function installDesign(design){layoutOverride=design;for(const [k,v]of Object.entries({...design.equipment_counts,arm_count:design.arm_count,amr_count:design.amr_count})){const input=$(`#counts [name="${k}"]`);if(input)input.value=v;}fill();}
$('#initial-layout').onchange=()=>{const i=$('#initial-layout').value;if(i!=='')installDesign(bundle.layout_candidates[Number(i)].design);else{layoutOverride=null;fill();}};
$('#pack').onclick=()=>work(async()=>{
  const values=Object.fromEntries([...new FormData($('#counts'))].map(([k,v])=>[k,Number(v)]));
  const response=await api('packing',{task_id:bundle.task.task_id,task_version:bundle.task.version,equipment_counts:Object.fromEntries(Object.keys(bundle.task.resource_limits.equipment).map(k=>[k,values[k]??0])),amr_count:values.amr_count,pitch_x_m:Number($('#pitch-x').value),pitch_y_m:Number($('#pitch-y').value)});
  installDesign(response.design);$('#message').textContent=response.note;
});
$('#jobs').oninput = () => fill();
$('#task').onchange = () => {bundle = bundles[Number($('#task').value)]; observation = null; result = null; time=0;playing=false;counts(); $('#step').disabled = true; $('#decision').value = '';$('#epoch').textContent='NO SESSION';$('#completed').textContent='—';$('#clock').textContent='0 s';$('#score').textContent='—';$('#relocation').textContent='idle';$('#replay-time').textContent='0 s';$('#calls').textContent='0 calls';$('#jobs').innerHTML='';$('#receipts').innerHTML='';$('#activity').innerHTML='';$('#export').disabled=true; $('#message').textContent = 'Create a new session for this task.'; $('#empty').hidden = false;};
$('#show-labels').checked = localStorage.getItem('hall-equipment-labels') !== 'off';
$('#show-labels').onchange = e => localStorage.setItem('hall-equipment-labels', e.target.checked ? 'on':'off');
$('#play').onclick = () => {if (!result?.replay) return; if (time >= observation.time_s) time = 0; playing = !playing; $('#play').textContent = playing ? 'Ⅱ':'▶';};
$('#timeline').oninput = e => {time = Number(e.target.value) / 1000 * (observation?.time_s ?? 0); playing = false; $('#play').textContent = '▶';};
$('#export').onclick = async () => {
  const journal = await api(`sessions/${observation.session_id}/journal`);
  const url = URL.createObjectURL(new Blob([JSON.stringify({result,journal},null,2)],{type:'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = 'scheduler-' + observation.session_id + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
};

function frame(now) {
  if (result?.replay) {
    if (playing) {time = Math.min(observation.time_s,time + Math.min(.1,(now-last)/1000)*120); if(time >= observation.time_s) {playing=false;$('#play').textContent='▶';}}
    plan.set(projected(result.replay,time),observation.catalog); plan.draw(time,{labels:$('#show-labels').checked,ports:true,routes:true,reach:true});
    $('#timeline').value = observation.time_s ? time/observation.time_s*1000:0; $('#replay-time').textContent = num(time)+' s';
  }
  last=now; requestAnimationFrame(frame);
}
try {
  bundles=await api('tasks'); $('#task').innerHTML=bundles.map((b,i)=>`<option value="${i}">${esc(b.task.task_id)} · ${b.task.room.width_m} × ${b.task.room.depth_m} m</option>`).join('');
  bundle=bundles[0]; counts(); requestAnimationFrame(frame);
  const id=localStorage.getItem('labops-scheduler-session');
  if(id) try {observation=await api(`sessions/${id}/observation`); const index=bundles.findIndex(b=>b.task.task_id===observation.context.task_id); if(index>=0){$('#task').value=index;bundle=bundles[index];counts();} await refresh();} catch {observation=null;}
} catch(e) {$('#message').textContent=e.message;}

installTaskParameters({button:$('#parameters'),getBundle:()=>bundle,endpoint:'/scheduler/api/custom-tasks',onCreated:async b=>{bundles=await api('tasks');const i=bundles.findIndex(x=>x.task.task_id===b.task.task_id);$('#task').innerHTML=bundles.map((b,i)=>`<option value="${i}">${esc(b.task.task_id)}</option>`).join('');$('#task').value=i;bundle=bundles[i];observation=null;counts();$('#message').textContent='Custom task created; start a new session.';}});
