// Explicit initial-condition policy for prepared-sample arm concurrency tasks.
// No process duration or measured result is generated here.
export function initialSampleTokens(layout,task,matches) {
  if(task.initial_sample_policy!=='local-arm-buffer')return {tokens:[],errors:[]};
  const tokens=[],errors=[],sequence={};
  for(const job of task.jobs) {
    if(job.arrival_s!==0||job.nodes.filter(n=>!n.parents.length).length!==1){errors.push({code:'invalid_initial_samples',message:'Initial samples require time-zero jobs with one root operation.'});continue;}
    const node=job.nodes[0],cap=node.capability,devices=layout.devices.filter(d=>matches(cap,d)).sort((a,b)=>a.id.localeCompare(b.id));
    if(!devices.length){errors.push({code:'missing_initial_sample_station',message:cap});continue;}
    const d=devices[(sequence[cap]??0)%devices.length];sequence[cap]=(sequence[cap]??0)+1;
    tokens.push({job_id:job.id,parent_id:null,child_id:node.id,robot_id:d.input_robot_id,available_s:0,initial_sample:true});
  }
  if(layout.robots.some(r=>tokens.filter(t=>t.robot_id===r.id).length>task.buffer_slots))errors.push({code:'initial_buffer_full',message:'Prepared samples exceed finite initial arm buffers.'});
  return {tokens,errors};
}
