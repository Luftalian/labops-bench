import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {developmentFixture, hash} from '../counts/tasks.mjs';

export const PROTOCOL = 'labops.scheduler.v0.2-draft';
export const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
export const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const relocationModel = JSON.parse(fs.readFileSync(new URL('./data/relocation.json', import.meta.url)));
export const defaultConfig = {protocol: PROTOCOL, decision_interval_s: 600, max_decisions: 64,
  response_timeout_ms: 30000, max_drain_s: 3600, visibility: 'full_remaining_workload',
  dispatch_policy: 'job-priority-nonpreemptive-v1', clock_policy: 'paused-during-decision',
  allow_device_relocation: true, allow_arm_relocation: true};

export function schedulerFixture(width = 14, depth = 10) {
  const b = developmentFixture(width, depth);
  b.task.task_id = `scheduler-room-${width}x${depth}-dev`; b.task.version = 'scheduler-1';
  b.task.workload_parameters.arrival_interval_s = 900;
  b.task.jobs.forEach((j, i) => {const delta = i * 900 - j.arrival_s; j.arrival_s += delta; j.due_s += delta;});
  b.task.workload_hash = hash(b.task.jobs);
  b.task.provenance += ' Scheduler development variant: synthetic 900-second job arrivals; separate from fixed 0.2 comparisons.';
  b.request.task_id = b.task.task_id; b.request.task_version = b.task.version;
  b.fixture_note = 'Scheduler software development task; synthetic arrivals and relocation parameters, no model evaluation.';
  return b;
}
export const transitionModels = model => ['device_relocation', 'arm_relocation'].map(operation => ({operation, ...structuredClone(model)}));
