import {hash} from '../backend/counts/tasks.mjs';
import {digest} from '../backend/scheduler/tasks.mjs';

export function eligibleResult({run, result, task, config, selection}) {
  if (result.context.task_version !== task.version || result.context.task_hash !== hash(task) ||
      result.context.workload_hash !== task.workload_hash || digest(result.config) !== digest(config)) return false;
  if (selection.refreshed_task_ids.includes(task.task_id)) return run.created_at >= selection.requested_at;
  const retained = selection.retained_results.find(r => r.task_id === task.task_id && r.method === run.method);
  return retained?.run_id === run.id;
}
