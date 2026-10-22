import test from 'node:test';
import assert from 'node:assert/strict';
import {benchmarkScenarios,benchmarkSuite,taskId} from '../../benchmark/scheduler-suite.mjs';
import {schedulerFixture,digest} from '../../backend/scheduler/tasks.mjs';
import {hash} from '../../backend/counts/tasks.mjs';
import {SchedulerSession} from '../../backend/scheduler/session.mjs';
import {actionMenu} from '../../agent/benchmark-actions.mjs';
import {placeExact,requestViolations} from '../../backend/counts/evaluator.mjs';
import {suiteConfig} from '../../benchmark/lemat-sdl/suite.mjs';
import {eligibleResult} from '../../scripts/benchmark-result-selection.mjs';

test('the complete suite includes the two unchanged scheduler tasks with feasible public candidates',()=>{
  const bundles=benchmarkSuite();assert.equal(bundles.length,16);
  assert.deepEqual(benchmarkScenarios.map(taskId),bundles.map(b=>b.task.task_id));
  for(const [i,dimensions] of [[14,[14,10]],[15,[8,7]]]){
    const b=bundles[i];assert.equal(digest(b),digest(schedulerFixture(...dimensions)));
    const menu=actionMenu(new SchedulerSession(b,{config:suiteConfig}).snapshot());assert(menu.length>0);
    for(const c of menu){assert.deepEqual(requestViolations(b.task,c.design),[]);assert(placeExact(b.task,c.design).validation.valid);}
  }
});
test('selection rejects stale data, changed tasks and mismatched configs, and pins retained challenge runs',()=>{
  const task=benchmarkSuite()[0].task,config=suiteConfig;
  const selection={requested_at:'2026-10-22T08:00:00.000Z',refreshed_task_ids:[task.task_id],retained_results:[]};
  const run={id:'fresh',method:'heuristic',created_at:'2026-10-22T09:00:00.000Z'};
  const result={context:{task_version:task.version,task_hash:hash(task),workload_hash:task.workload_hash},config};
  const valid={run,result,task,config,selection};assert(eligibleResult(valid));
  assert(!eligibleResult({...valid,run:{...run,created_at:'2026-10-21T09:00:00.000Z'}}));
  assert(!eligibleResult({...valid,task:{...task,room:{width_m:99,depth_m:10}}}));
  assert(!eligibleResult({...valid,config:{...config,max_decisions:1}}));
  const retained={...selection,refreshed_task_ids:[],retained_results:[{task_id:task.task_id,method:run.method,run_id:run.id}]};
  assert(eligibleResult({...valid,selection:retained}));
  assert(!eligibleResult({...valid,selection:retained,run:{...run,id:'unrequested-replacement'}}));
});
