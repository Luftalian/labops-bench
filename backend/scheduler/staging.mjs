import {catalog, validateLayout} from '../poc/sim/v4/tasks.mjs';
import {bounds, overlaps, robotPoint} from '../poc/sim/v2/geometry.mjs';
import {routePath} from '../poc/sim/v2/geometry.mjs';
import {fleetRoom} from '../poc/sim/v4/fleet.mjs';

export const ownedDevices = layout => [...layout.devices, ...(layout.parked_devices ?? [])];
export function stagingErrors(layout, task) {
  const errors = [], add = (code, message) => errors.push({code, message});
  const parked = layout.parked_devices ?? [], ids = ownedDevices(layout).map(d => d.id);
  if (parked.length && !task.external_staging) add('external_staging_disabled', 'This task has no external storage.');
  if(ids.some(id=>/^amr-/.test(id)))add('reserved_fleet_id','Owned device IDs cannot use the AMR namespace.');
  if (new Set(ids).size !== ids.length || ids.some(id => layout.robots.some(r => r.id === id))) add('duplicate_id', 'Owned resource IDs must be unique.');
  if (parked.some(d => !catalog.equipment[d.model] || catalog.equipment[d.model].mobility !== 'mobile')) add('immobile_storage', 'Only mobile devices may use external storage.');
  const s = task.external_staging;
  if (s && (parked.length > s.capacity || layout.devices.length > s.max_active_devices)) add('staging_capacity', 'Room or external storage capacity exceeded.');
  if (s && (s.gate.x-s.gate.width_m/2<0 || s.gate.x+s.gate.width_m/2>task.room.width_m)) add('gate_outside_wall','The whole doorway must fit the north wall.');
  return errors;
}

// Sequential extraction/insertion through an explicit opening in the north wall.
// Every swept device rectangle is checked against stationary assets. The external
// store itself is an abstract service with a declared handling time, not a CAD model.
export function exchangePlan(env, target, config, model) {
  const old = env.layout, s = env.task.external_staging, errors = stagingErrors(target, env.task);
  const fail = (code, message) => errors.push({code, message});
  if (!s || !config.allow_device_relocation) return {errors: [{code:'external_staging_disabled', message:'External exchange is disabled.'}]};
  const a = ownedDevices(old), b = ownedDevices(target);
  if (a.length !== b.length || a.some(d => !b.some(e => e.id === d.id && e.model === d.model))) fail('inventory_changed', 'Owned IDs, models and total counts are fixed.');
  if (JSON.stringify(old.robots) !== JSON.stringify(target.robots)) fail('exchange_arm_move', 'Move arms separately from external device exchange.');
  const removed = old.devices.filter(d => !target.devices.some(e => e.id === d.id));
  const added = target.devices.filter(d => !old.devices.some(e => e.id === d.id));
  for (const d of old.devices.filter(d => target.devices.some(e => e.id === d.id)))
    if (JSON.stringify(d) !== JSON.stringify(target.devices.find(e => e.id === d.id))) fail('exchange_stationary_move', 'Move retained assets separately from exchange.');
  const endpoint = validateLayout(target, env.task, catalog);
  errors.push(...endpoint.errors.map(e => ({code:e.code, message:JSON.stringify(e)})));
  for(const car of env.carriers) {
    const room=fleetRoom(env.task,env.carriers,car.id,catalog);
    for(const point of [env.task.intake,...target.robots.map(r=>robotPoint(r,'dock',catalog))])
      if(!routePath(car.home,point,target,room,catalog))fail('fleet_access','Existing AMR bay would be disconnected.');
  }
  const p = model.parameters, changed = [];
  const stationary = old.devices.filter(d => !removed.includes(d));
  const obstacles = [...(env.task.room.obstacles ?? []), ...old.robots.flatMap(r => {
    const h = robotPoint(r,'handoff',catalog);
    return [{x:r.x-.14,y:r.y-.14,w:.28,h:.28},{x:h[0]-.2,y:h[1]-.13,w:.4,h:.26}];
  }), ...env.carriers.map(c => ({x:c.home[0]-catalog.carrier.radius_m,y:c.home[1]-catalog.carrier.radius_m,w:2*catalog.carrier.radius_m,h:2*catalog.carrier.radius_m}))];
  function path(d, installed, direction) {
    if (catalog.equipment[d.model].mobility !== 'mobile') fail('immobile_device', d.id);
    const box = bounds(d,catalog), gate = s.gate;
    if (box.x < gate.x - gate.width_m/2 || box.x+box.w > gate.x+gate.width_m/2) fail('gate_alignment', d.id+' must align with the north-wall opening.');
    // Fixed x/yaw translation to the gate; no unmodeled diagonal maneuver.
    const sweep = {x:box.x,y:0,w:box.w,h:box.y+box.h};
    if ([...obstacles,...installed.filter(e=>e.id!==d.id).map(e=>bounds(e,catalog))].some(o=>overlaps(sweep,o,p.clearance_m))) fail('gate_path_blocked', d.id+' has no clear extraction/insertion corridor.');
    const outside = {...d,y:-box.h/2-.1};
    changed.push({id:d.id,kind:'device',direction,from:direction==='out'?d:outside,to:direction==='out'?outside:d,distance_m:d.y-outside.y,rotation_deg:0});
  }
  // Remove in source order; insert in target order, checking each intermediate state.
  const active = [...old.devices];
  for (const d of removed) {path(d,active,'out'); active.splice(active.findIndex(e=>e.id===d.id),1);}
  for (const d of added) {path(d,active,'in'); active.push(d);}
  const out = changed.filter(c=>c.direction==='out'), incoming = changed.filter(c=>c.direction==='in');
  const sum = xs => xs.reduce((n,c)=>n+c.distance_m/p.translation_speed_m_s,0);
  const stages = [['relocation_disconnect',out.length*p.device_disconnect_s],['external_egress',sum(out)],
    ['external_handling',changed.length*s.handling_s_per_device],['external_ingress',sum(incoming)],
    ['relocation_reconnect',incoming.length*p.device_reconnect_s],['relocation_calibrate',incoming.length*p.device_calibrate_s]].filter(([,t])=>t>0);
  return {errors,changed,stages,duration_s:stages.reduce((n,[,t])=>n+t,0),target:structuredClone(target),model:{...structuredClone(model),external_staging:structuredClone(s)}};
}
