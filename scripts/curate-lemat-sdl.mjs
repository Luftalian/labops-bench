import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../',import.meta.url));
const dataset = JSON.parse(fs.readFileSync(path.join(root,'backend/poc/sim/v2/data/procedures.json')));
const rawRoot = process.argv[2] ?? path.resolve(root,'../../sim/v2/data');
const selections = [
  ['ha-mix','LM-1bae9a3992',[2],['stirrer']],
  ['cbi-mix','LM-07896924d3',[2],['stirrer']],
  ['cbi-separate','LM-07896924d3',[3],['centrifuge']],
  ['ag-sonicate','LM-1635cc3c7e',[1],['sonicator']],
  ['ag-separate','LM-1635cc3c7e',[2],['centrifuge']],
  ['sto-etch','LM-0bf4f9a26e',[0],['liquid_handler']],
  ['ha-full','LM-1bae9a3992',[0,1,2,3,4],['stirrer','liquid_handler','stirrer','stirrer','oven']],
  ['cbi-full','LM-07896924d3',[0,1,2,3,4],['stirrer','stirrer','stirrer','centrifuge','oven']]
];
const assumed = {stirrer:300,liquid_handler:120,centrifuge:300,oven:3600};
const records = [], workflows = [];
for (const [id,pid,indices,caps] of selections) {
  const p = dataset.procedures.find(p=>p.id===pid), source = p.source;
  const bytes = fs.readFileSync(path.join(rawRoot,source.raw_file));
  if (createHash('sha256').update(bytes).digest('hex')!==source.sha256) throw new Error('Raw source hash mismatch: '+pid);
  const raw = JSON.parse(bytes)[source.extraction_index].materials[source.material_index].synthesis;
  const base = `/${source.extraction_index}/materials/${source.material_index}/synthesis/steps`;
  const steps = indices.map((i,k)=> {
    const s = raw.steps[i], normalized = p.steps[i], cap = caps[k], c = s.conditions ?? {};
    const unitFactors={s:1,sec:1,second:1,seconds:1,min:60,minute:60,minutes:60,h:3600,hr:3600,hour:3600,hours:3600,day:86400,days:86400,week:604800,weeks:604800};
    const sourceDuration=typeof c.duration==='number'?c.duration*unitFactors[c.time_unit]:null;
    if(c.duration!==null&&c.duration!==undefined&&!Number.isFinite(sourceDuration))throw new Error('Unsupported raw time unit '+c.time_unit);
    if(sourceDuration!==normalized.duration_s)throw new Error('Previously normalized time disagrees with raw record');
    const duration=sourceDuration??(id==='cbi-full'&&i===4?43200:assumed[cap]);
    if (!(duration>0)) throw new Error('Missing declared duration');
    return {source_pointer:base+'/'+i,source_step_number:s.step_number,action:s.action,description:s.description,
      original_conditions:c,capability:cap,duration_s:duration,
      duration_provenance:{kind:normalized.duration_s===null?'assumed':'literature',source_ref:source.url,
        locator:base+'/'+i+'/conditions',original_value:c.duration??null,original_unit:c.time_unit??null,
        note:normalized.duration_s===null?(i===4&&id==='cbi-full'?'Overnight = 12 h engineering assumption.':'Missing time replaced by declared operation default; not measured.'):'Extracted duration converted to seconds without acceleration. Hold time approximates process occupancy; handling remains separately simulated.'},
      mapping_provenance:{kind:'assumed',note:cap===normalized.resource?'Source action assigned to catalog equipment; generic sample vessel/automatic handling and chemical compatibility are assumptions.':'Reviewed override: vacuum-oven drying maps to oven, not the centrifuge tube containing the sample. Vacuum capability is not independently validated.'}};
  });
  workflows.push({id,source_procedure_id:pid,source,material:p.material,
    scope:id.endsWith('-full')?'All extracted steps; serial scheduling proxy. Independent precursor preparations serialized; chemical/robotic feasibility not validated.':'Prepared-sample unit-operation window; not a full synthesis workflow.',
    omitted_steps:raw.steps.map((s,i)=>({source_pointer:base+'/'+i,action:s.action,reason:'Outside explicitly selected prepared-sample operation window; not counted as completed synthesis.'})).filter((_,i)=>!indices.includes(i)),
    steps});
  if (!records.some(r=>r.paper_id===source.paper_id)) records.push({paper_id:source.paper_id,url:source.url,commit:source.commit,sha256:source.sha256,raw_file:source.raw_file});
}
const output = {version:'lemat-sdl-1',source_kind:'public LeMat-Synth annotation subset (not gated Hugging Face database dump)',
  review:'Raw hashes, field locators, scope and equipment mapping reviewed for scheduling representation; original papers and real SDL feasibility not independently validated.',
  assumptions:['Catalog sizes/handling/mobility and external staging are engineering assumptions.','No batching speedup; one job per device process slot.','Unit-operation jobs are not complete material syntheses.','No inferred chemistry yield, success or measured throughput.'],
  excluded_records:[{id:'LM-0bf4f9a26e',scope:'full workflow',reason:'Sample A and Sample B anneals are alternative branches; reject naive serial chain. Only etch window used.'},
    {id:'LM-8553dcec84',scope:'full workflow',reason:'Spreading on table and week-long temperature-controlled curing are not stirring; reject inherited stirrer mapping.'}],records,workflows};
const destination = path.join(root,'benchmark/lemat-sdl/workflows.json');fs.mkdirSync(path.dirname(destination),{recursive:true});
fs.writeFileSync(destination,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({output:destination,workflows:workflows.length,records:records.length,verified_raw_hashes:true}));
