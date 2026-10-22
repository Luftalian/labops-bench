import {planHall,hash} from './tasks.mjs';
import {resourceUsage} from './placement.mjs';

export function designCandidates(task){
 const seen=new Set();return [2,3,1].map(groupSize=>{
  const p=planHall(task,{groupSize}),layout_hash=hash(p.layout),duplicate=seen.has(layout_hash);seen.add(layout_hash);
  return {id:'arm-group-'+groupSize,group_size:groupSize,layout:p.layout,layout_hash,valid:p.validation.valid,validation:p.validation,selection:p.selection??null,...resourceUsage(task,p.layout,p.fleet_count??0),arms:p.layout.robots.length,devices_per_arm:Object.fromEntries(p.layout.robots.map(a=>[a.id,p.layout.devices.filter(d=>d.input_robot_id===a.id||d.output_robot_id===a.id).length])),duplicate_of:duplicate?'equivalent geometry':null};
 });
}
export function rankDesigns(candidates){
 return candidates.filter(c=>c.valid&&c.preview?.status==='completed').sort((a,b)=>a.preview.makespan_s-b.preview.makespan_s||a.arms-b.arms||a.layout.devices.length-b.layout.devices.length||a.id.localeCompare(b.id));
}
export function publicDesign(c){return {...c,validation:{valid:c.validation.valid,error_count:c.validation.errors.length,examples:c.validation.errors.slice(0,8)},preview:c.preview??null};}
