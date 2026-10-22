// HTTP integration check only: deterministic manual decisions, no model calls.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const base = process.env.LABOPS_URL ?? 'http://127.0.0.1:4173';
async function api(p, body) {
  const r = await fetch(base + '/scheduler/api/' + p, body === undefined ? undefined : {
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const value=await r.json(); assert.ok(r.ok,JSON.stringify(value)); return value;
}
const [bundle] = await api('tasks');
let o = await api('sessions',{task_id:bundle.task.task_id,task_version:bundle.task.version});
const id=o.session_id;
for(let round=0;o.phase!=='done'&&round<30;round++) {
  const decisionId=randomUUID(), q={protocol:o.protocol,session_id:id,snapshot_id:o.snapshot_id,
    epoch_id:o.epoch_id,state_version:o.state_version,decision_id:decisionId,
    reason:'HTTP software integration check, no model inference.',priorities:o.jobs.map(j=>({job_id:j.job_id,priority:500})),type:o.phase};
  if(o.phase==='initial_design') {
    const equipment_counts=Object.fromEntries(Object.entries(o.context.resource_limits.equipment).map(([k,n])=>[k,Number(n>0)]));
    q.initial_design={schema_version:'0.2',submission_id:decisionId,task_id:o.context.task_id,task_version:o.context.task_version,
      simulation_seed:o.context.simulation_seed,equipment_counts,arm_count:3,amr_count:1};
  } else if(round===1) {
    const layout=structuredClone(o.layout);for(const a of [...layout.devices,...layout.robots])a.x=Number((a.x+.2).toFixed(6));
    q.reconfiguration={mode:'replace_layout',layout};
  } else q.reconfiguration={mode:'keep'};
  if(o.decision_required) {
    const receipt=await api(`sessions/${id}/decisions`,q);
    assert.deepEqual(await api(`sessions/${id}/decisions`,q),receipt);
  }
  o=await api(`sessions/${id}/advance`,{});
  if(o.phase!=='done')assert.equal(o.time_s,o.epoch_id*o.config.decision_interval_s);
}
const result=await api(`sessions/${id}/result`),journal=await api(`sessions/${id}/journal`);
assert.equal(result.status,'completed');assert.ok(result.receipts.some(r=>r.code==='relocation_applied'));
assert.ok(result.replay.trace.some(e=>e.kind==='relocate'&&e.asset_kind==='arm'));
assert.equal(result.metrics.makespan_s,Math.max(...result.replay.jobs.map(j=>j.completed_s)));
assert.ok(journal.some(e=>e.kind==='submitted'&&e.observation));
console.log('PASS scheduler HTTP create/priority/relocation/epoch/complete/export/idempotency:',id);
