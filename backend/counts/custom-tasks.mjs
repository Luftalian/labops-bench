import fs from 'node:fs';
import path from 'node:path';
import {hash} from './tasks.mjs';
import {validate} from '../scheduler/validate.mjs';

export function loadCustomTasks(directory) {
  return fs.existsSync(directory)?fs.readdirSync(directory).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync(path.join(directory,f)))):[];
}
export async function customizeTask(definitions,body,directory) {
  if(!body||Object.keys(body).some(k=>!['task_id','task_version','room','resource_limits'].includes(k)))return {status:422,body:{error:'invalid_custom_parameters'}};
  const base=definitions.find(b=>b.task.task_id===body.task_id&&b.task.version===body.task_version);
  if(!base)return {status:404,body:{error:'unknown_base_task'}};
  for(const [definition,value]of [['Room',body.room],['ResourceLimits',body.resource_limits]]) {
    const errors=await validate(value,definition);if(errors.length)return {status:422,body:{error:'invalid_custom_parameters',violations:errors}};
  }
  const bundle=structuredClone(base),id='custom-'+hash({base:base.task.task_id,version:base.task.version,room:body.room,resource_limits:body.resource_limits}).slice(0,16);
  bundle.task={...bundle.task,task_id:id,version:'1',room:body.room,resource_limits:body.resource_limits,
    provenance:base.task.provenance+' User parameter variant of '+base.task.task_id+'; original task is preserved. This is a separate condition.'};
  bundle.request={...bundle.request,task_id:id,task_version:'1',equipment_counts:body.resource_limits.equipment,
    arm_count:body.resource_limits.arms,amr_count:body.resource_limits.amrs};delete bundle.request.layout;
  if(!definitions.some(b=>b.task.task_id===id))definitions.push(bundle);
  fs.mkdirSync(directory,{recursive:true});const file=path.join(directory,id+'.json');
  if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify(bundle,null,2)+'\n',{flag:'wx'});
  const {request,...publicBundle}=bundle;return {status:201,body:publicBundle};
}
