// Counts distinct jobs (union overlapping process intervals within each job),
// separate from reserved operations and from independent station windows.
function peak(intervals){const events=intervals.flatMap(([start,end])=>end>start?[{t:start,d:1},{t:end,d:-1}]:[]).sort((a,b)=>a.t-b.t||a.d-b.d);let n=0,best=0,at=0;for(const e of events){n+=e.d;if(n>best){best=n;at=e.t;}}return {count:best,at_s:at};}
function union(list){const out=[];for(const [a,b]of [...list].sort((a,b)=>a[0]-b[0])){const last=out.at(-1);if(last&&a<=last[1])last[1]=Math.max(last[1],b);else out.push([a,b]);}return out;}
export function concurrencyStats(r){
 const end=r.metrics.elapsed_s,clip=([a,b])=>[Math.max(0,a),Math.min(end,b)],jobs=new Map(),furnaces=[];
 for(const b of r.batches){const span=clip([b.process_start_s,b.process_end_s]);for(const id of b.job_ids){if(!jobs.has(id))jobs.set(id,[]);jobs.get(id).push(span);}if(b.model==='furnace'||b.model==='furnace_large')furnaces.push(span);}
 const processing=peak([...jobs.values()].flatMap(union)),reserved=peak(r.jobs.flatMap(j=>union(j.nodes.filter(n=>n.start_s!==undefined).map(n=>clip([n.start_s,n.completed_s]))))),wip=peak(r.jobs.filter(j=>j.admitted_s!==undefined).map(j=>clip([j.admitted_s,j.completed_s??end]))),thermal=peak(furnaces);
 return {released_at_zero_jobs:r.jobs.filter(j=>j.arrival_s===0).length,peak_processing_jobs:processing.count,peak_processing_jobs_at_s:processing.at_s,peak_reserved_jobs:reserved.count,peak_work_in_progress_jobs:wip.count,peak_processing_furnaces:thermal.count,furnaces_used:new Set(r.batches.filter(b=>b.model==='furnace'||b.model==='furnace_large').map(b=>b.device_id)).size};
}
