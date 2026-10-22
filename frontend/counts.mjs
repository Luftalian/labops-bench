import {installTaskParameters} from '/task-parameters.mjs';
import {PlanView} from '/workshop/plan-view.mjs';
const $ = q => document.querySelector(q), $$ = q => [...document.querySelectorAll(q)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = n => n === null || n === undefined ? '—' : Number(n.toFixed(2)).toLocaleString();
let bundles, bundle, run = null, history = [], selected, replay, three, view = 'plan', time = 0, playing = false, last = performance.now();
const select = id => {
  const device = replay?.layout.devices.find(d => d.id === id);
  if (device) $('#message').textContent = `${id} · ${bundle.catalog.equipment[device.model].name} · input ${device.input_robot_id} / output ${device.output_robot_id}`;
};
const plan = new PlanView($('#plan-canvas'), select);
$('#show-labels').checked = localStorage.getItem('hall-equipment-labels') !== 'off';
$('#show-labels').onchange = e => localStorage.setItem('hall-equipment-labels', e.target.checked ? 'on' : 'off');
async function api(p, body, headers = {}) {
  const response = await fetch(p, body === undefined ? undefined : {method: 'POST', headers: {'Content-Type': 'application/json', ...headers}, body: JSON.stringify(body)});
  const value = await response.json(); if (!response.ok) throw new Error(value.message ?? value.error ?? 'Request failed'); return value;
}
function reset() {
  bundle = bundles[Number($('#task').value)]; run = null; history = []; replay = null; selected = null; playing = false; time = 0;
  const {task, catalog} = bundle;
  const required = new Set(task.jobs.flatMap(j => j.nodes.map(n => Object.keys(catalog.equipment).find(id => id === n.capability || id === 'flex_' + n.capability))));
  $('#counts').innerHTML = Object.entries(task.resource_limits.equipment).filter(([, cap]) => cap > 0).map(([id, cap]) =>
    `<label class="count-row">${esc(id.replace('flex_', '').replaceAll('_', ' '))} <small>≤ ${cap}</small><input name="${id}" type="number" min="0" max="${cap}" step="1" value="${Number(required.has(id))}" aria-label="${esc(id)} count"></label>`).join('') +
    `<label class="count-row">Robot arms <small>≤ ${task.resource_limits.arms}</small><input name="arm_count" type="number" min="0" max="${task.resource_limits.arms}" step="1" value="${Math.min(task.resource_limits.arms, Math.ceil(required.size / 2))}" aria-label="Robot arm count"></label>` +
    `<label class="count-row">Sample AMRs <small>≤ ${task.resource_limits.amrs}</small><input name="amr_count" type="number" min="0" max="${task.resource_limits.amrs}" step="1" value="1" aria-label="AMR count"></label>`;
  $('#room').textContent = `${task.room.width_m} × ${task.room.depth_m} m / ${task.room.width_m * task.room.depth_m} m²`;
  $('#calls').textContent = '0 / 20'; $('#source').textContent = task.provenance;
  $('#title').textContent = `SHARED LAB / ${task.room.width_m} × ${task.room.depth_m} m`;
  $('#history').innerHTML = ''; $('#ledger').innerHTML = ''; $('#events').textContent = '0 EVENTS';
  $('#empty').hidden = false; $('#empty').textContent = 'Simulate a design to replay its devices, arms and AMRs.';
  $('#plan-canvas').hidden = true; $('#three-container').hidden = true; $('#export').disabled = true;
  $('#time').textContent = '0 s'; $('#timeline').value = 0; $('#message').textContent = '';
  for (const id of ['completed', 'arms', 'amrs', 'makespan']) $('#' + id).textContent = '—';
  $('#origin').textContent = 'Synthetic development task. No live model evaluation.';
}
async function buildThree() {
  if (!three) {const {ThreeView} = await import('/workshop/three-view.mjs'); three = new ThreeView($('#three-container'), select);}
  await three.set(replay, bundle.catalog);
}
async function show(index) {
  selected = history[index]; const r = selected.result;
  playing = false; time = 0; $('#timeline').value = 0; $('#time').textContent = '0 s'; $('#play').textContent = '▶';
  $('#origin').textContent = `${r.task_id} / ${r.task_version} · ${r.status.toUpperCase()} · PoC shared event engine`;
  $('#completed').textContent = r.metrics ? `${r.metrics.completed_jobs} / ${r.metrics.total_jobs}` : '—';
  $('#arms').textContent = r.installed_resources?.arms ?? '—'; $('#amrs').textContent = r.installed_resources?.amrs ?? '—';
  $('#makespan').textContent = r.status === 'truncated' ? 'Unfinished' : r.metrics ? num(r.metrics.makespan_s) + ' s' : '—';
  $('#message').textContent = r.violations.map(v => v.code + ': ' + v.message).join(' · ');
  if (r.failure) $('#message').textContent += ' · ' + r.failure.message + ' · No infeasibility proof.';
  $('#export').disabled = false; $('#empty').hidden = r.valid;
  $('#empty').textContent = r.status === 'layout_search_failed' ? 'Exact inventory placement failed · no smaller inventory substituted' : 'Invalid design · no simulation score';
  $('#plan-canvas').hidden = !r.valid || view !== 'plan'; $('#three-container').hidden = !r.valid || view !== 'three';
  replay = r.replay ? structuredClone(r.replay) : null;
  if (replay) replay.layout.devices.forEach((d, i) => d.display_name = 'Station ' + String(i + 1).padStart(2, '0'));
  $('#ledger').innerHTML = r.events.map(e => `<div class="ledger-row" data-start="${e.start_s}" data-end="${e.end_s}"><b>${esc(e.kind.replaceAll('_', ' '))} · ${esc(e.resource)}</b>${esc((e.job_ids ?? []).join(', '))}<br>${num(e.start_s)} → ${num(e.end_s)} s${r.metrics && e.end_s > r.metrics.elapsed_s ? ' · reserved beyond stop' : ''}</div>`).join('');
  $('#events').textContent = r.events.length + ' EVENTS';
  if (view === 'three' && replay) await buildThree();
  $$('[data-history]').forEach(row => row.classList.toggle('selected', Number(row.dataset.history) === index));
}
function add(request, result) {
  history.push({request, result});
  $('#history').innerHTML = history.map(({request: q, result: r}, i) => `<tr data-history="${i}" tabindex="0" aria-label="Replay simulation ${i + 1}"><td>${esc(r.status)}</td><td>${esc(Object.entries(q.equipment_counts).filter(([, n]) => n).map(([k, n]) => k.replace('flex_', '') + ' ' + n).join(', '))}</td><td>${q.arm_count}</td><td>${q.amr_count}</td><td>${r.status === 'truncated' ? 'Unfinished' : num(r.metrics?.makespan_s)}</td></tr>`).join('');
  $$('[data-history]').forEach(row => {row.onclick = () => show(Number(row.dataset.history)).catch(fail); row.onkeydown = e => {if (e.key === 'Enter') row.click();};});
}
function fail(error) {$('#message').textContent = error.message; $('#run-status').textContent = 'Failed · saved run journal retains the attempt';}
$('#run').onclick = async () => {
  $('#run').disabled = true; $('#task').disabled = true; $('#message').textContent = 'Validating exact counts, arms and room geometry…';
  try {
    if (!run) run = await api('/v2/runs', {task_id: bundle.task.task_id, task_version: bundle.task.version, method: 'manual', search_seed: 17});
    const values = Object.fromEntries([...new FormData($('#counts'))].map(([k, v]) => [k, Number(v)]));
    const request = {schema_version: '0.2', submission_id: crypto.randomUUID(), task_id: bundle.task.task_id,
      task_version: bundle.task.version, simulation_seed: bundle.task.simulation_seed,
      equipment_counts: Object.fromEntries(Object.keys(bundle.task.resource_limits.equipment).map(id => [id, values[id] ?? 0])),
      arm_count: values.arm_count, amr_count: values.amr_count};
    const result = await api('/v2/evaluations', request, {'X-LabOps-Run-Id': run.run_id});
    add(request, result); run = await api('/v2/runs/' + run.run_id); $('#calls').textContent = `${run.used_calls} / ${run.call_limit}`;
    await show(history.length - 1); $('#run-status').textContent = `Simulation · ${run.run_id.slice(0, 8)} · ${result.status}`;
  } catch (error) {fail(error);} finally {$('#run').disabled = false; $('#task').disabled = false;}
};
$('#counts').onsubmit = e => e.preventDefault(); $('#task').onchange = reset;
$('#play').onclick = () => {if (!replay) return; if (time >= replay.metrics.elapsed_s) time = 0; playing = !playing; $('#play').textContent = playing ? 'Ⅱ' : '▶';};
$('#restart').onclick = () => {time = 0; playing = false; $('#play').textContent = '▶';};
$('#timeline').oninput = e => {time = Number(e.target.value) / 1000 * (replay?.metrics.elapsed_s ?? 0); playing = false; $('#play').textContent = '▶';};
$$('[data-view]').forEach(button => button.onclick = async () => {
  view = button.dataset.view; $$('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  $('#plan-canvas').hidden = !replay || view !== 'plan'; $('#three-container').hidden = !replay || view !== 'three';
  if (view === 'three' && replay) try {await buildThree();} catch (error) {fail(error);}
});
$('#export').onclick = () => {if (!selected) return; const url = URL.createObjectURL(new Blob([JSON.stringify({bundle, run, ...selected}, null, 2)], {type: 'application/json'})), a = document.createElement('a'); a.href = url; a.download = 'labops-counts-' + selected.result.submission_id + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);};
function frame(now) {
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  if (replay) {
    if (playing) {time = Math.min(replay.metrics.elapsed_s, time + dt * Number($('#speed').value)); if (time >= replay.metrics.elapsed_s) {playing = false; $('#play').textContent = '▶';}}
    if (view === 'plan') {plan.set(replay, bundle.catalog); plan.draw(time, {labels: $('#show-labels').checked, ports: true, routes: true, reach: true});}
    else three?.draw(time, {labels: $('#show-labels').checked, ports: true, reach: true});
    $('#timeline').value = replay.metrics.elapsed_s ? time / replay.metrics.elapsed_s * 1000 : 0; $('#time').textContent = num(time) + ' s';
    $$('.ledger-row').forEach(row => row.classList.toggle('active', Number(row.dataset.start) <= time && Number(row.dataset.end) > time));
  }
  requestAnimationFrame(frame);
}
try {bundles = await api('/v2/tasks'); $('#task').innerHTML = bundles.map((b, i) => `<option value="${i}">${b.task.room.width_m} × ${b.task.room.depth_m} m · same workload / limits</option>`).join(''); $('#task').value = String(Math.max(0, bundles.findIndex(b => b.task.room.width_m === 14))); reset(); requestAnimationFrame(frame);} catch (error) {fail(error);}

installTaskParameters({button:$('#parameters'),getBundle:()=>bundle,endpoint:'/v2/custom-tasks',onCreated:b=>{bundles.push(b);$('#task').insertAdjacentHTML('beforeend',`<option value="${bundles.length-1}">Custom ${b.task.room.width_m} × ${b.task.room.depth_m} m</option>`);$('#task').value=bundles.length-1;reset();}});
