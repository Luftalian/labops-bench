// Presentation-only projection of recorded movement. It never advances engine
// state, infers processing durations, or computes benchmark scores.
export function projectedReplay(replay,t) {
  const past=replay.layout_history?.filter(h=>h.time_s<=t).at(-1)??replay.layout_history?.[0];
  const layout=structuredClone(past?.layout??replay.layout),since=past?.time_s??0;
  const move=(asset,e)=>{
    const f=Math.min(1,Math.max(0,(t-e.start_s)/(e.end_s-e.start_s))),a=e.from_pose,b=e.to_pose,key=asset.model?'rotation':'yaw';
    asset.x=a.x+(b.x-a.x)*f;asset.y=a.y+(b.y-a.y)*f;asset[key]=a[key]+(((b[key]-a[key]+540)%360)-180)*f;
  };
  const recent=(replay.trace??[]).filter(e=>e.start_s>=since&&e.start_s<=t);
  for(const asset of [...layout.devices,...layout.robots]) {
    const e=recent.filter(e=>e.resource===asset.id&&(e.kind==='relocate'||e.kind==='external_egress'&&e.from_pose?.y>=0)).at(-1);
    if(e)move(asset,e);
  }
  for(const e of recent.filter(e=>e.kind==='external_ingress'&&e.from_pose?.y<0)) {
    if(layout.devices.some(d=>d.id===e.resource))continue;
    const asset=structuredClone(e.to_pose);move(asset,e);layout.devices.push(asset);
  }
  layout.devices=layout.devices.filter(d=>d.y>=0);
  return {...replay,layout};
}
