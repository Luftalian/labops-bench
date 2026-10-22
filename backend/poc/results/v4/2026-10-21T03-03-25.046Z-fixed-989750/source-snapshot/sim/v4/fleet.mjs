import {routePath,bounds,distance,robotPoint} from '../v2/geometry.mjs';

// Closed tours keep idle cars in distinct off-aisle bays. Other cars treat those
// bays as static obstacles. Swept grid cells reserve time intervals
// through arm handoffs and return; footprint padding is conservative.
export function createFleet(layout,task,catalog){
 const count=task.topology.shared_sample_amrs??1;
 if(count===1)return [{id:'amr-1',home:structuredClone(task.intake),at:structuredClone(task.intake),available_s:0}];
 const r=catalog.carrier.radius_m,g=catalog.route_grid_m,points=[],homes=[];
 for(let x=.3;x<task.room.width_m-.25;x+=.8)points.push([Number(x.toFixed(2)),.3]);
 for(let y=1.1;y<task.room.depth_m-.25;y+=.8)points.push([task.room.width_m-.3,Number(y.toFixed(2))]);
 for(const p of points){
  if(distance(p,task.intake)<1||homes.some(h=>distance(h,p)<.8-1e-6))continue;
  const boxes=[...layout.devices.map(d=>bounds(d,catalog)),...layout.robots.map(a=>({x:a.x-.2,y:a.y-.2,w:.4,h:1.45})),...(task.room.obstacles??[])];
  if(boxes.some(b=>p[0]>b.x-r-g&&p[0]<b.x+b.w+r+g&&p[1]>b.y-r-g&&p[1]<b.y+b.h+r+g)||!routePath(p,task.intake,layout,task.room,catalog))continue;
  homes.push(p);if(homes.length===count)break;
 }
 if(homes.length!==count)throw new Error('No collision-free parking bays for requested fleet');
 const fleet=homes.map((home,i)=>({id:'amr-'+(i+1),home,at:structuredClone(home),available_s:0}));
 // Prove all used docks remain connected for every car with other bays occupied.
 for(const car of fleet){const room=fleetRoom(task,fleet,car.id,catalog);for(const point of [task.intake,...layout.robots.filter(a=>layout.devices.some(d=>d.input_robot_id===a.id||d.output_robot_id===a.id)).map(a=>robotPoint(a,'dock',catalog))])if(!routePath(car.home,point,layout,room,catalog))throw new Error('Fleet parking blocks a required transport route');}
 return fleet;
}
export function fleetRoom(task,fleet,id,catalog){const r=catalog.carrier.radius_m;return {...task.room,obstacles:[...(task.room.obstacles??[]),...fleet.filter(c=>c.id!==id).map(c=>({x:c.home[0]-r,y:c.home[1]-r,w:2*r,h:2*r}))]};}
// Cells covering the complete swept disc, with extra grid padding. Disjoint cell
// sets guarantee separated centerline polylines even at diagonal endpoints.
export function sweptCells(points,catalog){
 const g=catalog.route_grid_m,r=catalog.carrier.radius_m+g*Math.SQRT2/2,cells=new Set();
 const mark=p=>{for(let x=Math.floor((p[0]-r)/g);x<=Math.floor((p[0]+r)/g);x++)for(let y=Math.floor((p[1]-r)/g);y<=Math.floor((p[1]+r)/g);y++)cells.add(x+','+y);};
 for(let i=0;i<points.length;i++){const a=points[i],b=points[i+1]??a,n=Math.max(1,Math.ceil(distance(a,b)/(g/2)));for(let k=0;k<=n;k++)mark([a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n]);}return cells;
}
export function intersecting(a,b){if(a.size>b.size)[a,b]=[b,a];for(const cell of a)if(b.has(cell))return true;return false;}

// Space-time reservations of swept grid cells. Each cell can hold several
// disjoint intervals, allowing a later vehicle through after a crossing clears.
export function tourReservations(trip,catalog){
 const cells=new Map(),g=catalog.route_grid_m;
 const reserve=(points,start,end)=>{
  if(end<=start)return;
  const lengths=points.slice(1).map((p,i)=>distance(p,points[i])),length=lengths.reduce((s,d)=>s+d,0);let elapsed=0;
  for(let i=0;i<Math.max(1,points.length-1);i++){
   const a=points[i]??points[0],b=points[i+1]??a,d=lengths[i]??0,n=Math.max(1,Math.ceil(d/(g/2)));
   for(let k=0;k<n;k++){const p=[a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n],q=[a[0]+(b[0]-a[0])*(k+1)/n,a[1]+(b[1]-a[1])*(k+1)/n],at=length?start+(elapsed+d*k/n)/length*(end-start):start,until=length?start+(elapsed+d*(k+1)/n)/length*(end-start):end;
    for(const key of sweptCells([p,q],catalog)){if(!cells.has(key))cells.set(key,[]);cells.get(key).push({start_s:at,end_s:until});}
   }elapsed+=d;
  }
 };
 reserve(trip.empty_path,trip.start_s,trip.empty_until_s);
 reserve([trip.empty_path.at(-1)],trip.empty_until_s,trip.loaded_from_s);
 reserve(trip.loaded_path,trip.loaded_from_s,trip.loaded_until_s);
 reserve([trip.to],trip.loaded_until_s,trip.return_start_s);
 reserve(trip.return_path,trip.return_start_s,trip.end_s);
 for(const [key,list]of cells){const merged=[];for(const item of list.sort((a,b)=>a.start_s-b.start_s)){const last=merged.at(-1);if(last&&item.start_s<=last.end_s+1e-8)last.end_s=Math.max(last.end_s,item.end_s);else merged.push({...item});}cells.set(key,merged);}
 return cells;
}
export function trafficDelay(a,b){
 for(const [key,list]of a){const other=b.get(key);if(!other)continue;for(const x of list)for(const y of other)if(x.start_s<y.end_s-1e-8&&x.end_s>y.start_s+1e-8)return y.end_s-x.start_s+1e-6;}
 return 0;
}
