// Descriptive resource loads; these are not causal bottleneck certificates.
export function resourceDiagnostics(r,catalog){
 const end=Math.max(0,r.metrics.elapsed_s),clip=(a,b)=>Math.max(0,Math.min(end,b)-Math.max(0,a)),pools=new Map();
 const pool=cap=>{if(!pools.has(cap))pools.set(cap,{resource:cap,process_s:0,assigned_capacity_s:0,kind:'process'});return pools.get(cap);};
 const history=r.layout_history.length?r.layout_history:[{time_s:0,layout:r.layout}];
 for(let i=0;i<history.length;i++){const h=history[i],duration=clip(h.time_s,history[i+1]?.time_s??end);for(const d of h.layout.devices)pool(catalog.equipment[d.model]?.capability??d.model).assigned_capacity_s+=duration;}
 let total=0,thermal=0;
 for(const b of r.batches){const duration=clip(b.process_start_s,b.process_end_s),cap=catalog.equipment[b.model]?.capability??b.model;pool(cap).process_s+=duration;total+=duration;if(['furnace','oven'].includes(cap))thermal+=duration;}
 const rows=[...pools.values()].map(p=>({...p,load:p.assigned_capacity_s?p.process_s/p.assigned_capacity_s:0}));
 for(const [name,ids]of [['robot_arms',r.layout.robots.map(a=>a.id)],['transport_amrs',r.fleet.map(c=>c.id)]]){const set=new Set(ids),busy=r.trace.filter(s=>set.has(s.resource)).reduce((n,s)=>n+clip(s.start_s,s.end_s),0),capacity=end*ids.length;rows.push({resource:name,kind:'reservation',process_s:busy,assigned_capacity_s:capacity,load:capacity?busy/capacity:0});}
 return {scope:'Process / assigned station time; arms and AMRs show reserved / available time. Parallel resource-seconds are not elapsed time. Setup and queued loading reduce process utilization. Loads describe contention and do not prove the causal bottleneck.',thermal_process_resource_share:total?thermal/total:0,process_resource_s:total,resources:rows.sort((a,b)=>b.load-a.load||a.resource.localeCompare(b.resource))};
}
