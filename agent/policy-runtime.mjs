import {actionMenu,decisionFromAnswer,decisionInstructions,heuristicAnswer} from './benchmark-actions.mjs';
import fs from 'node:fs';
import path from 'node:path';

export const priorityLevels=['Can wait: not arrived, blocked, or little benefit from starting now.','Low: ready but modest impact on final completion.','Normal: useful ready work with alternatives.','High: unlocks downstream work or keeps a bottleneck busy.','Critical: delays the last completing chain unless started as soon as feasible.'];
export function decisionProblem(observation){
  return {format:'labops.public-decision-problem.v1',instructions:decisionInstructions,priority_levels:priorityLevels,
    observation:structuredClone(observation),candidates:actionMenu(observation)};
}
export function compilePolicyAnswer(problem,answer){
  // Custom algorithms may return the full canonical engine decision, including
  // new coordinates. The engine, not this adapter, validates them. Candidate
  // answers are a convenient common restricted track for hosted comparisons.
  if(answer?.protocol)return structuredClone(answer);
  return decisionFromAnswer(problem.observation,answer,problem.candidates);
}
export function policyController(policy){
  return async(observation,options)=>{
    const problem=decisionProblem(observation),answer=await policy(structuredClone(problem),options);
    if(options?.folder){fs.writeFileSync(path.join(options.folder,'policy-input-'+observation.epoch_id+'.json'),JSON.stringify(problem));fs.writeFileSync(path.join(options.folder,'policy-answer-'+observation.epoch_id+'.json'),JSON.stringify(answer));}
    return compilePolicyAnswer(problem,answer);
  };
}

const modelOf=cap=>['oven','furnace','xrd'].includes(cap)?cap:'flex_'+cap;
const pending=j=>j.nodes.filter(n=>n.status!=='completed');
const work=j=>pending(j).reduce((s,n)=>s+n.remaining_process_s,0);
function rankPriorities(o,order){return order.map((j,i)=>({job_id:j.job_id,priority:Math.round(1000*(1-i/Math.max(1,o.jobs.length)))}));}
function demandByModel(o){
  const out={};for(const j of o.jobs)for(const n of pending(j)){
    const weight=j.arrival_s<=o.time_s?1:Math.max(0,1-(j.arrival_s-o.time_s)/(2*o.config.decision_interval_s));
    const m=modelOf(n.required_capability);out[m]=(out[m]??0)+(n.remaining_process_s+30)*weight;
  }return out;
}
function active(c,o){return c.design?.layout??c.layout??o.layout;}
function fifoChoice(problem){
  const o=problem.observation,first=[...o.jobs].sort((a,b)=>a.arrival_s-b.arrival_s||a.job_id.localeCompare(b.job_id));
  if(!o.context.external_staging)return problem.candidates[0].id;
  const models=[...new Set(first.filter(j=>j.arrival_s<=o.time_s||o.phase==='initial_design').flatMap(j=>pending(j).map(n=>modelOf(n.required_capability))))];
  const slots=o.context.external_staging.max_active_devices,desired=models.slice(0,slots);
  if(!desired.length)return problem.candidates[0].id;
  const score=c=>{const ds=active(c,o).devices;return desired.reduce((n,m,i)=>n+(ds.some(d=>d.model===m)?100-i:0),0)-ds.filter(d=>!desired.includes(d.model)).length;};
  return [...problem.candidates].sort((a,b)=>score(b)-score(a))[0].id;
}
export function fifoPolicy(problem){
  const o=problem.observation;return {layout_choice:fifoChoice(problem),priorities:rankPriorities(o,[...o.jobs].sort((a,b)=>a.arrival_s-b.arrival_s||a.job_id.localeCompare(b.job_id))),reason:'FIFO: arrival then job ID; spread layout or first waiting model cohorts, no lookahead.'};
}
export function legacyRulePolicy(problem){
  const o=problem.observation;
  if(!o.context.external_staging||o.context.placement_policy!=='dense-cell-candidates-v2')return heuristicAnswer(o,problem.candidates);
  // Preserve the old reference's no-lookahead layout behavior, generalized to
  // multiple bays: service first waiting cohorts, then longest remaining work.
  const a=heuristicAnswer({...o,context:{...o.context,external_staging:null}},problem.candidates);
  a.layout_choice=fifoChoice(problem);a.reason='Reference: first waiting model cohorts; arrived jobs then longest remaining process chain.';return a;
}
export function advancedRulePolicy(problem){
  const o=problem.observation,demands=demandByModel(o),initial=o.phase==='initial_design';
  function score(c){
    const layout=active(c,o),counts={};for(const d of layout.devices)counts[d.model]=(counts[d.model]??0)+1;
    if(o.context.external_staging){
      // Max-pressure / critical-tail cohort service. Positive leftover demand
      // always outweighs switching cost, avoiding starvation after large queues.
      const covered=Object.entries(demands).reduce((s,[m,w])=>s+(counts[m]?w*(1+Math.log2(counts[m])):0),0);
      const moves=initial?0:layout.devices.filter(d=>!o.layout.devices.some(a=>a.id===d.id)).length;
      return -covered+(covered>0?moves*120:0);
    }
    const bottleneck=Math.max(0,...Object.entries(demands).map(([m,w])=>w/Math.max(1,counts[m]??0)));
    const intake=[.5,o.context.room.depth_m-.5];
    const travel=layout.devices.reduce((s,d)=>s+(demands[d.model]??0)/Math.max(1,counts[d.model])*
      (Math.abs(d.x-intake[0])+Math.abs(d.y-intake[1])),0);
    return bottleneck+travel*.03;
  }
  let choice=problem.candidates[0];
  if(!initial&&o.reconfiguration_state.phase!=='idle')choice=problem.candidates[0];
  else choice=[...problem.candidates].sort((a,b)=>score(a)-score(b)||a.id.localeCompare(b.id))[0];
  const order=[...o.jobs].sort((a,b)=>{
    const tail=j=>{const ns=pending(j);return work(j)-(ns.find(n=>n.depends_on.every(id=>j.nodes.find(p=>p.node_id===id)?.status==='completed'))?.remaining_process_s??0);};
    return Number(b.arrival_s<=o.time_s)-Number(a.arrival_s<=o.time_s)||tail(b)-tail(a)||work(b)-work(a)||a.arrival_s-b.arrival_s||a.job_id.localeCompare(b.job_id);
  });
  return {layout_choice:choice.id,priorities:rankPriorities(o,order),reason:'Workload-aware rule: bottleneck/travel proxy for geometry, max-pressure active cohorts, downstream remaining work first; no simulator rollout.'};
}
export const policies={fifo:fifoPolicy,heuristic:legacyRulePolicy,'algorithm-advanced':advancedRulePolicy};
export function createRuleController(name){if(!policies[name])throw new Error('Unknown rule policy: '+name);return policyController(policies[name]);}
