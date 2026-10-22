import {catalog} from '../backend/poc/sim/v4/tasks.mjs';
import {planLayout} from '../backend/poc/sim/v2/geometry.mjs';

const templates=new Map(),snap=v=>Math.round(v/catalog.placement_grid_m)*catalog.placement_grid_m;
export function stationTemplate(model) {
  if(!templates.has(model)) {
    const task={room:{width_m:4,depth_m:4,obstacles:[],cutouts:[]},intake:[.5,3.5],robot_budget:1,inventory:{[model]:1},required_capabilities:[],buffer_slots:8};
    const p=planLayout(task,catalog,17,{devicesPerArm:1});
    if(!p.validation.valid)throw new Error('No cell template for '+model);
    const a=p.layout.robots[0],d=p.layout.devices[0];templates.set(model,{dx:d.x-a.x,dy:d.y-a.y,rotation:d.rotation});
  }
  return templates.get(model);
}

// A geometric proposal, never a feasibility certificate. The engine still
// checks bodies, service zones, arm reach/buffers and radius-inflated routes.
// Unlike the legacy grid, free room area does not force larger station spacing.
export function packedCellLayout(task,counts,{pitch_x_m=1.2,pitch_y_m=2.6,columns=null,reverse=false,activeIds=null}={}) {
  if(![pitch_x_m,pitch_y_m].every(v=>Number.isFinite(v)&&v>0))throw new Error('Cell pitch must be positive and finite');
  let entries=Object.entries(counts).flatMap(([model,n])=>Array.from({length:n},(_,i)=>({id:model+'-'+(i+1),model})));
  const parked=[];if(activeIds)entries=entries.filter(d=>{if(activeIds.includes(d.id))return true;parked.push(d);return false;});
  if(reverse)entries.reverse();
  const cols=Math.min(entries.length,columns??Math.max(1,Math.floor((task.room.width_m-1.1)/pitch_x_m)+1));
  const rows=Math.ceil(entries.length/cols),layout={devices:[],robots:[]};
  for(const [i,d]of entries.entries()){
    const t=stationTemplate(d.model),arm={id:'arm-'+(i+1),x:snap(.8+i%cols*pitch_x_m),y:snap(task.room.depth_m-1.4-(rows-1-Math.floor(i/cols))*pitch_y_m),yaw:0};
    layout.robots.push(arm);layout.devices.push({...d,x:snap(arm.x+t.dx),y:snap(arm.y+t.dy),rotation:t.rotation,input_robot_id:arm.id,output_robot_id:arm.id});
  }
  if(task.external_staging)layout.parked_devices=parked;
  return layout;
}
