import {scenarios, suite} from './lemat-sdl/suite.mjs';
import {schedulerFixture} from '../backend/scheduler/tasks.mjs';

// The two synthetic tasks are the existing scheduler UI tasks, unchanged.
// Keep their IDs, seeds and workload distinct from literature-derived cases.
const development = [[14, 10], [8, 7]].map(([w, h]) => schedulerFixture(w, h));
export const taskId = spec => spec.task_id ?? 'lemat-sdl-' + spec.id;
export const benchmarkScenarios = [...scenarios, ...development.map(({task}) => ({
  id: task.task_id, task_id: task.task_id, version: task.version,
  name: `Synthetic screening in a ${task.room.width_m} × ${task.room.depth_m} m room`,
  room: [task.room.width_m, task.room.depth_m], equipment: task.resource_limits.equipment,
  arms: task.resource_limits.arms, amrs: task.resource_limits.amrs,
  groups: [{workflow: 'synthetic-ambient-screening', count: task.jobs.length, interval_s: 900}],
  category: 'synthetic-development', source_kind: 'synthetic',
  purpose: task.provenance,
}))];
export const benchmarkSuite = () => [...suite(), ...structuredClone(development)];
