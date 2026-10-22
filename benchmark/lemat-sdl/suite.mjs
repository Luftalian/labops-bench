import fs from 'node:fs';
import {publicCatalog,MODEL_IDS,hash} from '../../backend/counts/tasks.mjs';
import {defaultConfig} from '../../backend/scheduler/tasks.mjs';

export const scenarios = JSON.parse(fs.readFileSync(new URL('./scenarios.json',import.meta.url)));
export const curated = JSON.parse(fs.readFileSync(new URL('./workflows.json',import.meta.url)));
export function buildScenario(spec) {
  const jobs=[];
  for (const group of spec.groups) {
    const w=curated.workflows.find(w=>w.id===group.workflow);
    if (!w) throw new Error('Unknown curated workflow '+group.workflow);
    for(let i=0;i<group.count;i++) {
      const nodes=w.steps.map((s,k)=>({id:'op-'+k,parents:k?['op-'+(k-1)]:[],capability:s.capability,label:s.action,
        duration_s:s.duration_s,program:[{action:s.action,duration_s:s.duration_s,
          temperature_c:typeof s.original_conditions.temperature==='number'?s.original_conditions.temperature:null,
          atmosphere:s.original_conditions.atmosphere??'unspecified',duration_source:s.duration_provenance.kind}],
        source_indices:[k],recipe_key:w.id,vessel:'standard-50mm'}));
      nodes.forEach(n=>n.compatibility_key=hash([n.capability,n.program,n.recipe_key,n.vessel]));
      const arrival_s=(group.start_s??0)+i*group.interval_s;
      jobs.push({id:'J'+String(jobs.length+1).padStart(4,'0'),line:w.id,name:w.material,procedure_id:w.source_procedure_id,
        source_kind:'literature-extraction',arrival_s,due_s:arrival_s+7*86400,priority:1,nodes});
    }
  }
  const equipment=Object.fromEntries(MODEL_IDS.map(k=>[k,spec.equipment[k]??0]));
  const workflow={workflow_id:'lemat-sdl-'+spec.id,version:curated.version,track:'literature-derived',description:spec.purpose};
  const task={schema_version:'0.2',task_id:'lemat-sdl-'+spec.id,version:spec.version??'1',catalog_id:publicCatalog.catalog_id,
    catalog_version:publicCatalog.version,workflow_id:workflow.workflow_id,workflow_version:workflow.version,
    room:{width_m:spec.room[0],depth_m:spec.room[1]},resource_limits:{equipment,arms:spec.arms,amrs:spec.amrs},
    objective:'minimize_makespan_s',simulation_seed:20261022,simulation_cutoff_s:365*86400,
    workload_parameters:{family:'screening-mix',jobs:1,seed:20261022,benches:7,furnaces:0,ovens:0,xrd:0,amrs:1,batch_slots:1,buffer_slots:spec.buffer_slots},
    jobs,workload_hash:hash(jobs),policies:{placement:spec.placement_policy??'public-cell-candidates-v1',execution:'job-priority-nonpreemptive-v1',transport:'poc-closed-tours-v1',completion:'final-arm-unload-v1'},
    provenance:'Pinned LeMat annotation operations; scheduling proxy. See benchmark/lemat-sdl/workflows.json for raw hashes, scope, omissions and assumptions.'};
  if(spec.external_staging)task.external_staging=structuredClone(spec.external_staging);
  if(spec.external_staging&&spec.placement_policy==='dense-cell-candidates-v2')task.policies.inventory='fixed-owned-v1';
  if(spec.initial_sample_policy)task.initial_sample_policy=spec.initial_sample_policy;
  const request={schema_version:'0.2',submission_id:'suite-default',task_id:task.task_id,task_version:task.version,
    equipment_counts:equipment,arm_count:spec.arms,amr_count:spec.amrs,simulation_seed:task.simulation_seed};
  return {fixture_note:'Literature-derived scheduling benchmark; synthetic engineering geometry/handling and scoped prepared-sample operations.',
    catalog:structuredClone(publicCatalog),workflow,task,request};
}
export const suite=()=>scenarios.map(buildScenario);
// Equal cadence/call cap for all methods; after the cap the last priorities persist.
export const suiteConfig={...defaultConfig,decision_interval_s:1800,max_decisions:32,response_timeout_ms:300000,max_drain_s:7*86400};
