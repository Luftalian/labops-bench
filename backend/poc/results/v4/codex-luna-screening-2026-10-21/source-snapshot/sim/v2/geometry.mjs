export const rotate=([x,y],degrees=0)=>{const a=degrees*Math.PI/180;return [x*Math.cos(a)-y*Math.sin(a),x*Math.sin(a)+y*Math.cos(a)];};
export const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function portPose(device,kind,catalog){const p=catalog.equipment[device.model].ports[kind],v=rotate(p.point_m,device.rotation),n=rotate(p.normal,device.rotation);return {point:[device.x+v[0],device.y+v[1],p.point_m[2]],normal:n,approach:p.approach};}
export function bounds(d,catalog){const [w,h]=catalog.equipment[d.model].size_m,swap=d.rotation%180!==0;return {x:d.x-(swap?h:w)/2,y:d.y-(swap?w:h)/2,w:swap?h:w,h:swap?w:h};}
export const overlaps=(a,b,gap=0)=>a.x<b.x+b.w+gap-1e-7&&a.x+a.w+gap>b.x+1e-7&&a.y<b.y+b.h+gap-1e-7&&a.y+a.h+gap>b.y+1e-7;
export function inFloor(point,room,margin=0){const [x,y]=point;if(x<margin||y<margin||x>room.width_m-margin||y>room.depth_m-margin)return false;return !(room.cutouts??[]).some(r=>x>r.x-margin&&x<r.x+r.w+margin&&y>r.y-margin&&y<r.y+r.h+margin);}
export function robotPoint(r,key,catalog){const offset=rotate(catalog.robot[key+'_offset_m'],r.yaw??0);return [r.x+offset[0],r.y+offset[1]];}
function rectInside(b,room){return [[b.x,b.y],[b.x+b.w,b.y],[b.x,b.y+b.h],[b.x+b.w,b.y+b.h]].every(p=>inFloor(p,room))&&!(room.cutouts??[]).some(c=>overlaps(b,c));}
export function serviceBox(d,kind,catalog){const p=portPose(d,kind,catalog),s=catalog.equipment[d.model].service_depth_m,wide=.18;return Math.abs(p.normal[0])>.5?{x:Math.min(p.point[0],p.point[0]+p.normal[0]*s),y:p.point[1]-wide/2,w:s,h:wide}:{x:p.point[0]-wide/2,y:Math.min(p.point[1],p.point[1]+p.normal[1]*s),w:wide,h:s};}
export function routePath(from,to,layout,room,catalog){
  const g=catalog.route_grid_m,r=catalog.carrier.radius_m,nx=Math.ceil(room.width_m/g),ny=Math.ceil(room.depth_m/g),boxes=[...layout.devices.map(d=>bounds(d,catalog)),...(room.obstacles??[]),...layout.robots.map(a=>({x:a.x-.14,y:a.y-.14,w:.28,h:.28}))];
  const point=i=>[(i%nx+.5)*g,(Math.floor(i/nx)+.5)*g],key=p=>Math.floor(p[1]/g)*nx+Math.floor(p[0]/g);
  const pass=i=>{const p=point(i);return inFloor(p,room,r)&&!boxes.some(b=>p[0]>b.x-r&&p[0]<b.x+b.w+r&&p[1]>b.y-r&&p[1]<b.y+b.h+r);};
  const start=key(from),end=key(to);if(!pass(start)||!pass(end))return null;
  const q=[start],seen=new Map([[start,null]]);let index=0;
  while(index<q.length){const k=q[index++];if(k===end){const path=[];for(let n=k;n!==null;n=seen.get(n))path.push(point(n));path.reverse();return {points:[from,...path,to],distance_m:distance(from,path[0])+distance(path.at(-1),to)+(path.length-1)*g};}
    for(const n of [k-1,k+1,k-nx,k+nx]){if(n<0||n>=nx*ny||Math.abs(n%nx-k%nx)+Math.abs(Math.floor(n/nx)-Math.floor(k/nx))!==1||seen.has(n)||!pass(n))continue;seen.set(n,k);q.push(n);}}
  return null;
}
export function validateLayout(layout,task,catalog,{routes=true,complete=true}={}){
  const errors=[],add=(code,detail)=>errors.push({code,...detail});
  if(!layout||!Array.isArray(layout.devices)||!Array.isArray(layout.robots))return {valid:false,errors:[{code:'invalid_layout'}],physics_status:'not_checked'};
  if(layout.devices.length>64||layout.robots.length>32||layout.robots.some(r=>!r||typeof r.id!=='string'||r.id==='amr-1'||![r.x,r.y].every(Number.isFinite)||![0,90,180,270].includes(r.yaw??0))||layout.devices.some(d=>!d||typeof d.id!=='string'||d.id==='amr-1'||typeof d.model!=='string'||![d.x,d.y,d.rotation].every(Number.isFinite)))return {valid:false,errors:[{code:'invalid_layout_structure'}],physics_status:'not_checked'};
  if(layout.robots.length>task.robot_budget)add('robot_budget',{maximum:task.robot_budget});
  const ids=new Set(),inventory=task.inventory??{};let cost=0;
  for(const r of layout.robots){if(ids.has(r.id))add('duplicate_id',{id:r.id});ids.add(r.id);if(![r.x,r.y,r.yaw??0].every(Number.isFinite)||!inFloor([r.x,r.y],task.room,.16))add('robot_outside_floor',{robot:r.id});const hand=robotPoint(r,'handoff',catalog),deck={x:hand[0]-.2,y:hand[1]-.13,w:.4,h:.26},base={x:r.x-.14,y:r.y-.14,w:.28,h:.28};if(!rectInside(deck,task.room))add('buffer_outside_floor',{robot:r.id});for(const o of task.room.obstacles??[])if(overlaps(base,o,.03)||overlaps(deck,o,.03))add('robot_obstacle_collision',{robot:r.id});}
  for(let i=0;i<layout.robots.length;i++)for(let j=0;j<i;j++)if(distance([layout.robots[i].x,layout.robots[i].y],[layout.robots[j].x,layout.robots[j].y])<.32)add('robot_collision',{robot:layout.robots[i].id});
  const counts={};
  for(const d of layout.devices){
    if(ids.has(d.id))add('duplicate_id',{id:d.id});ids.add(d.id);
    const model=catalog.equipment[d.model];if(!model){add('unknown_model',{device:d.id});continue;}
    counts[d.model]=(counts[d.model]??0)+1;cost+=model.cost_units;
    if(![d.x,d.y,d.rotation].every(Number.isFinite)||![0,90,180,270].includes(d.rotation)){add('invalid_pose',{device:d.id});continue;}
    if([d.x,d.y].some(v=>Math.abs(v/catalog.placement_grid_m-Math.round(v/catalog.placement_grid_m))>1e-6))add('off_grid',{device:d.id});
    const b=bounds(d,catalog);if(!rectInside(b,task.room))add('outside_floor',{device:d.id});
    for(const o of task.room.obstacles??[])if(overlaps(b,o,.03))add('obstacle_collision',{device:d.id});
    for(const other of layout.devices){if(other===d||!catalog.equipment[other.model])continue;if(overlaps(b,bounds(other,catalog),.03))add('device_collision',{device:d.id,other:other.id});}
    for(const r of layout.robots)if(overlaps(b,{x:r.x-.14,y:r.y-.14,w:.28,h:.28},.03))add('robot_base_collision',{device:d.id,robot:r.id});
    for(const r of layout.robots){const hand=robotPoint(r,'handoff',catalog);if(overlaps(b,{x:hand[0]-.2,y:hand[1]-.13,w:.4,h:.26},.025))add('buffer_collision',{device:d.id,robot:r.id});}
    for(const kind of ['input','output']){
      const arm=layout.robots.find(r=>r.id===d[kind+'_robot_id']);if(!arm){add('unassigned_port',{device:d.id,port:kind});continue;}
      const p=portPose(d,kind,catalog),delta=[arm.x-p.point[0],arm.y-p.point[1]],planar=Math.hypot(...delta),reach=Math.hypot(planar,p.point[2]-catalog.robot.shoulder_height_m),dot=(delta[0]*p.normal[0]+delta[1]*p.normal[1])/Math.max(planar,1e-9);
      if(reach>catalog.robot.reach_m+1e-6||reach<catalog.robot.min_reach_m||p.point[2]<catalog.robot.tool_height_range_m[0]||p.point[2]>catalog.robot.tool_height_range_m[1])add('unreachable_port',{device:d.id,port:kind,reach_m:reach});
      if(p.approach!=='top'&&dot<catalog.robot.approach_cos_min)add('wrong_approach_direction',{device:d.id,port:kind,approach_cos:dot});
      const zone=serviceBox(d,kind,catalog);if(!rectInside(zone,task.room))add('service_zone_outside',{device:d.id,port:kind});
      for(const other of layout.devices)if(other!==d&&catalog.equipment[other.model]&&overlaps(zone,bounds(other,catalog)))add('blocked_service_zone',{device:d.id,port:kind,other:other.id});
      for(const o of task.room.obstacles??[])if(overlaps(zone,o))add('blocked_service_zone',{device:d.id,port:kind});
      // Straight tool access is a geometric screen, not a joint-space collision certificate.
      for(let k=1;k<10;k++){const f=k/10,pt=[arm.x+(p.point[0]-arm.x)*f,arm.y+(p.point[1]-arm.y)*f],boxes=[...layout.devices.filter(o=>o!==d&&catalog.equipment[o.model]).map(o=>bounds(o,catalog)),...(task.room.obstacles??[])];if(boxes.some(c=>pt[0]>c.x-.025&&pt[0]<c.x+c.w+.025&&pt[1]>c.y-.025&&pt[1]<c.y+c.h+.025)){add('blocked_tool_corridor',{device:d.id,port:kind});break;}}
    }
  }
  for(const [model,count] of Object.entries(counts))if(count>(inventory[model]??0))add('inventory_exceeded',{model,count,maximum:inventory[model]??0});
  if(cost>task.capital_budget)add('capital_budget',{cost,maximum:task.capital_budget});
  if(complete)for(const capability of task.required_capabilities??[])if(!layout.devices.some(d=>d.model===capability||(capability==='furnace'&&d.model==='furnace_large')))add('missing_capability',{capability});
  const connections={};
  if(routes&&errors.length===0){const used=new Set(layout.devices.flatMap(d=>[d.input_robot_id,d.output_robot_id]));for(const r of layout.robots.filter(r=>used.has(r.id))){const dock=robotPoint(r,'dock',catalog),p=routePath(task.intake,dock,layout,task.room,catalog);if(!p)add('unreachable_dock',{robot:r.id});else connections[r.id]=p;}}
  return {valid:errors.length===0,errors,installed_cost:cost,occupied_area_m2:layout.devices.filter(d=>catalog.equipment[d.model]).reduce((n,d)=>{const b=bounds(d,catalog);return n+b.w*b.h;},0),connections,physics_status:'not_checked',validation_scope:'body / service zone / tool corridor / reach sphere / port normal / inflated AMR routing; no articulated IK certificate'};
}
export function seeded(seed){let a=seed>>>0;return ()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
export function planLayout(task,catalog,seed=0,{shuffle=false}={}){
  const rng=seeded(seed),snap=v=>Math.round(v/catalog.placement_grid_m)*catalog.placement_grid_m;
  const models=Object.entries(task.inventory).flatMap(([model,n])=>Array.from({length:n},(_,i)=>({id:model+'-'+(i+1),model}))).sort((a,b)=>{if(a.model==='flow_reactor')return -1;if(b.model==='flow_reactor')return 1;const sa=catalog.equipment[a.model].size_m,sb=catalog.equipment[b.model].size_m;return sb[0]*sb[1]-sa[0]*sa[1];});
  let best=null;
  for(let attempt=0;attempt<32;attempt++){
    const armCount=Math.min(task.robot_budget,Math.max(task.inventory.flow_reactor?2:1,Math.ceil(models.length/2))),cols=Math.min(armCount,Math.max(1,Math.floor(task.room.width_m/2.35))),rows=Math.ceil(armCount/cols),robots=Array.from({length:armCount},(_,i)=>({id:'arm-'+(i+1),x:snap((i%cols+.5)*task.room.width_m/cols),y:snap((Math.floor(i/cols)+.45)*(task.room.depth_m-1.2)/rows+.5),yaw:0}));
    if(task.inventory.flow_reactor&&robots.length>=2){robots[0].x=snap(task.room.width_m/2-.9);robots[1].x=snap(task.room.width_m/2+.9);robots[0].y=robots[1].y=2.3;}
    const layout={devices:[],robots};let failed=false;
    for(const d of models){
      const m=catalog.equipment[d.model],candidates=[];
      if(d.model==='flow_reactor')for(const a of robots)for(const b of robots){if(a===b)continue;const cx=snap((a.x+b.x)/2),cy=snap((a.y+b.y)/2);candidates.push({...d,x:cx,y:cy,rotation:0,input_robot_id:a.id,output_robot_id:b.id});}
      else for(const r of robots)for(const rotation of [0,90,270,180])for(const dist of [.36,.46,.56,.64])for(const side of [0,-.18,.18,-.3,.3]){const p=rotate(m.ports.input.point_m,rotation),n=rotate(m.ports.input.normal,rotation);candidates.push({...d,x:snap(r.x-n[0]*dist-p[0]-n[1]*side),y:snap(r.y-n[1]*dist-p[1]+n[0]*side),rotation,input_robot_id:r.id,output_robot_id:r.id});}
      if(attempt>0||shuffle)candidates.sort(()=>rng()-.5);
      const options=[];
      for(const c of candidates){if(options.filter(o=>o.c.input_robot_id===c.input_robot_id).length>=4)continue;const b=bounds(c,catalog);if(robots.some(r=>{const p=robotPoint(r,'dock',catalog);return overlaps(b,{x:p[0]-.32,y:p[1]-.32,w:.64,h:.64});}))continue;const candidate={robots,devices:[...layout.devices,c]};const v=validateLayout(candidate,task,catalog,{routes:false,complete:false});if(v.valid){const armLoad=layout.devices.filter(x=>x.input_robot_id===c.input_robot_id).length,travel=distance([c.x,c.y],task.intake);options.push({c,score:armLoad*.3+travel*.02+(shuffle?rng():0)});}}
      if(!options.length){failed=true;break;}
      options.sort((a,b)=>a.score-b.score);const order=[...options.slice(attempt%3),...options.slice(0,attempt%3)];const choice=order.find(({c})=>validateLayout({robots,devices:[...layout.devices,c]},task,catalog,{complete:false}).valid);if(!choice){failed=true;break;}layout.devices.push(choice.c);
    }
    if(!best||layout.devices.length>best.devices.length)best=layout;
    if(!failed&&validateLayout(layout,task,catalog).valid)return {layout,validation:validateLayout(layout,task,catalog),attempts:attempt+1};
  }
  return {layout:best,validation:validateLayout(best,task,catalog),attempts:32};
}
