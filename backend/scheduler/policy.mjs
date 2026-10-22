import {chooseHallAction} from '../poc/sim/v4/agents.mjs';
const compare = (a, b) => b.job.priority - a.job.priority || a.job.arrival_s - b.job.arrival_s ||
  a.job.id.localeCompare(b.job.id) || (a.node_id ?? '').localeCompare(b.node_id ?? '') ||
  (a.device_id ?? '').localeCompare(b.device_id ?? '');

// The reference route/credit allocator remains shared. Only the ordering of
// feasible admissions and single-operation dispatches changes in this policy.
export function priorityActions(env, {draining = false} = {}) {
  const o = env.observe({clone: false}), candidates = [];
  for (const ready of o.ready) {
    if (o.resources.devices[ready.device_id].available_s > o.time_s + 1e-7) continue;
    const job = env.jobs.find(j => j.id === ready.job_id);
    candidates.push({job, node_id: ready.node_id, device_id: ready.device_id,
      action: {state_version: env.version, type: 'dispatch', device_id: ready.device_id,
        operations: [{job_id: job.id, node_id: ready.node_id}], reason: `Job priority ${job.priority}; nonpreemptive ready operation.`}});
  }
  if (!draining) for (const job of env.jobs.filter(j => j.arrival_s <= env.time && j.admitted_s === undefined && j.status !== 'done')) {
    const probe = {...o, ready: [], jobs: o.jobs.filter(j => j.admitted_s !== undefined || j.id === job.id)};
    const action = chooseHallAction(probe, 'fixed');
    if(action?.type==='admit'&&env.task.initial_sample_policy==='local-arm-buffer'){
      const token=env.tokens.find(t=>t.initial_sample&&t.job_id===job.id),node=job.nodes[0];
      const local=env.layout.devices.find(d=>d.input_robot_id===token?.robot_id&&(d.model===node.capability||d.model==='flex_'+node.capability));
      if(local)action.routes[node.id]=local.id;
    }
    if (action?.type === 'admit') candidates.push({job, action: {...action, reason: `Job priority ${job.priority}; reserve feasible complete route.`}});
  }
  return candidates.sort(compare).map(c => c.action);
}
