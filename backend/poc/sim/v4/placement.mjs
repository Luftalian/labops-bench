import {planHall} from './tasks.mjs';

// A failed heuristic candidate is evidence about this planner, not a packing proof.
export function assessReferencePlacement(task,plan=planHall(task)){
 const errors=plan.validation.errors??[],counts={};for(const e of errors)counts[e.code]=(counts[e.code]??0)+1;
 return {selection:plan.selection??null,...resourceUsage(task,plan.layout,plan.fleet_count??0),valid:plan.validation.valid,phase:'design',code:plan.validation.valid?'layout_valid':'layout_search_failed',message:plan.validation.valid?`The reference planner selected ${plan.layout.devices.length} devices within the configured limits and found a valid layout.`:'The reference planner could not place a capability-complete subset within the resource limits in this room while satisfying geometry constraints. No experiments started.',room:{width_m:task.room.width_m,depth_m:task.room.depth_m},available_devices:Object.values(task.initial_inventory).reduce((a,b)=>a+b,0),candidate_devices:plan.layout.devices.length,candidate_arms:plan.layout.robots.length,method:plan.method??'reference-layout-search',error_count:errors.length,error_counts:counts,examples:errors.slice(0,6),infeasibility_proven:false,note:'This is a reference layout-search result, not proof that every possible layout is infeasible. Increase room dimensions, reduce equipment, or supply a different layout through the agent API.'};
}
export function checkReferencePlacement(task){
 const report=assessReferencePlacement(task);if(report.valid)return report;
 // Offer a checked alternative, never claim a minimum room size or alter inventory.
 for(const [width_m,depth_m]of [[30,30],[60,40]]){if(width_m<task.room.width_m||depth_m<task.room.depth_m||width_m===task.room.width_m&&depth_m===task.room.depth_m)continue;
  const wider={...task,room:{...task.room,width_m,depth_m,obstacles:task.room.obstacles.map(o=>({...o,x:o.x+(width_m-task.room.width_m),y:o.y+(depth_m-task.room.depth_m)}))},intake:[task.intake[0],task.intake[1]+depth_m-task.room.depth_m]};
  if(planHall(wider).validation.valid){report.suggested_room={width_m,depth_m,note:'Reference layout checked with the same equipment; not a minimum-size guarantee.'};break;}
 }
 return report;
}

export function resourceUsage(task,layout,amrs){
 const count=model=>layout.devices.filter(d=>d.model===model).length;
 const limits={benches:task.bench_budget,furnaces:task.initial_inventory.furnace??0,ovens:task.initial_inventory.oven??0,xrd:task.initial_inventory.xrd??0,amrs:task.topology.shared_sample_amrs??1};
 const installed={benches:layout.devices.filter(d=>d.model.startsWith('flex_')).length,furnaces:count('furnace')+count('furnace_large'),ovens:count('oven'),xrd:count('xrd'),amrs};
 return {resource_limits:limits,installed_resources:installed,unused_resources:Object.fromEntries(Object.keys(limits).map(k=>[k,limits[k]-installed[k]]))};
}
