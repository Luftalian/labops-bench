import {runSuite} from './run-lemat-sdl.mjs';
import {policyController,fifoPolicy,advancedRulePolicy} from '../agent/policy-runtime.mjs';

// A 2 x 2 ablation, not an LLM contestant. Geometry is fixed within each pair;
// only job order changes. All source durations, arrivals and engine rules match.
for(const layout of ['spread-full','packed-full'])for(const order of ['fifo','tail']){
  const policy=order==='fifo'?fifoPolicy:advancedRulePolicy;
  const controller=policyController(problem=>({...policy(problem),layout_choice:problem.observation.phase==='initial_design'?layout:'keep'}));
  const r=await runSuite({method:'ablation-'+layout+'-'+order,controller,ids:['11-priority-tail']});
  console.log(JSON.stringify({method:'ablation-'+layout+'-'+order,directory:r.directory}));
}
