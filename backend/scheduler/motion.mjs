import {exchangePlan, stagingErrors} from './staging.mjs';
import {catalog, validateLayout} from '../poc/sim/v4/tasks.mjs';
import {overlaps, robotPoint, rotate, routePath, distance} from '../poc/sim/v2/geometry.mjs';
import {fleetRoom} from '../poc/sim/v4/fleet.mjs';

const angle = (a, b) => ((b - a + 540) % 360) - 180;
export function interpolateLayout(from, to, fraction) {
  return Object.fromEntries(['devices', 'robots'].map(category => [category, from[category].map(a => {
    const b = to[category].find(b => b.id === a.id), key = category === 'devices' ? 'rotation' : 'yaw';
    return {...a, x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction,
      [key]: a[key] + angle(a[key], b[key]) * fraction};
  })]));
}
function pieces(layout) {
  const boxes = layout.devices.map(d => {
    const [w, h] = catalog.equipment[d.model].size_m;
    const points = [[-w/2, -h/2], [w/2, -h/2], [-w/2, h/2], [w/2, h/2]].map(p => rotate(p, d.rotation));
    const x = Math.min(...points.map(p => p[0])), y = Math.min(...points.map(p => p[1]));
    return {id: d.id, x: d.x + x, y: d.y + y, w: Math.max(...points.map(p => p[0])) - x, h: Math.max(...points.map(p => p[1])) - y};
  });
  for (const r of layout.robots) {
    boxes.push({id: r.id, x: r.x - .14, y: r.y - .14, w: .28, h: .28});
    const hand = robotPoint(r, 'handoff', catalog), corners = [[-.2, -.13], [.2, -.13], [-.2, .13], [.2, .13]]
      .map(p => rotate(p, r.yaw)).map(p => [hand[0] + p[0], hand[1] + p[1]]);
    const x = Math.min(...corners.map(p => p[0])), y = Math.min(...corners.map(p => p[1]));
    boxes.push({id: r.id, x, y, w: Math.max(...corners.map(p => p[0])) - x, h: Math.max(...corners.map(p => p[1])) - y});
  }
  return boxes;
}
function radius(resource) {
  return resource.model ? Math.hypot(...catalog.equipment[resource.model].size_m) / 2
    : Math.hypot(...catalog.robot.handoff_offset_m) + .25;
}
export function relocationPlan(env, target, config, model) {
  if (JSON.stringify(env.layout.parked_devices ?? []) !== JSON.stringify(target.parked_devices ?? [])) return exchangePlan(env, target, config, model);
  const errors = stagingErrors(target, env.task), fail = (code, message) => errors.push({code, message});
  const old = env.layout, changed = [];
  for (const category of ['devices', 'robots']) {
    const a = new Map(old[category].map(d => [d.id, d])), b = new Map(target[category].map(d => [d.id, d]));
    if (a.size !== b.size || target[category].length !== b.size || [...a.keys()].some(id => !b.has(id))) {
      fail('inventory_changed', 'Relocation must preserve unique device and arm IDs.'); continue;
    }
    for (const [id, from] of a) {
      const to = b.get(id), isArm = category === 'robots', kind = isArm ? 'arm' : 'device', key = isArm ? 'yaw' : 'rotation';
      if (!isArm && from.model !== to.model) {fail('model_changed', 'Device models are immutable after installation.'); continue;}
      const fields = isArm ? ['x', 'y', 'yaw'] : ['x', 'y', 'rotation', 'input_robot_id', 'output_robot_id'];
      if (fields.every(k => from[k] === to[k])) continue;
      const moved = from.x !== to.x || from.y !== to.y || from[key] !== to[key];
      if (moved && (!config[isArm ? 'allow_arm_relocation' : 'allow_device_relocation'] ||
          !isArm && catalog.equipment[from.model].mobility !== 'mobile')) fail('relocation_disabled', id + ' cannot be moved.');
      changed.push({id, kind, from, to, distance_m: distance([from.x, from.y], [to.x, to.y]),
        rotation_deg: Math.abs(angle(from[key], to[key]))});
    }
  }
  if (errors.length) return {errors};
  const endpoint = validateLayout(target, env.task, catalog);
  if (!endpoint.valid) return {errors: endpoint.errors.map(e => ({code: e.code, message: JSON.stringify(e)}))};
  // AMRs keep their homes; relocation never creates cars or teleports bays.
  for (const car of env.carriers) {
    const room = fleetRoom(env.task, env.carriers, car.id, catalog);
    for (const point of [env.task.intake, ...target.robots.map(r => robotPoint(r, 'dock', catalog))])
      if (!routePath(car.home, point, target, room, catalog)) fail('fleet_access', 'Existing AMR bay disconnected: ' + car.id);
  }
  if (!changed.length) return {errors, changed, stages: []};
  const p = model?.parameters;
  const positive = ['translation_speed_m_s', 'rotation_speed_deg_s', 'sweep_step_m', 'sweep_step_deg'];
  const times = ['device_disconnect_s', 'device_reconnect_s', 'device_calibrate_s', 'arm_disconnect_s', 'arm_reconnect_s', 'arm_calibrate_s', 'clearance_m'];
  if (!p || positive.some(k => !Number.isFinite(p[k]) || p[k] <= 0) || times.some(k => !Number.isFinite(p[k]) || p[k] < 0))
    return {errors: [{code: 'unsupported_reconfiguration', message: 'A valid host-owned physical relocation model is required.'}]};
  const steps = Math.max(1, ...changed.flatMap(c => [Math.ceil(c.distance_m / p.sweep_step_m), Math.ceil(c.rotation_deg / p.sweep_step_deg)]));
  if (steps > 10000) return {errors: [{code: 'motion_limit', message: 'Movement exceeds bounded swept-envelope checks.'}]};
  const staticBoxes = [...(env.task.room.obstacles ?? []), ...(env.task.room.cutouts ?? []),
    ...env.carriers.map(c => ({x: c.home[0] - catalog.carrier.radius_m, y: c.home[1] - catalog.carrier.radius_m,
      w: 2 * catalog.carrier.radius_m, h: 2 * catalog.carrier.radius_m}))];
  const moving = new Map(changed.map(c => [c.id, c]));
  // For each interval use the union of endpoint AABBs plus an arc-length
  // bound for rotation. This contains the entire rigid planar sweep, not only
  // sampled poses. Service/reach constraints apply again at the final layout.
  for (let i = 0; i < steps && !errors.length; i++) {
    const start = pieces(interpolateLayout(old, target, i / steps)), end = pieces(interpolateLayout(old, target, (i + 1) / steps));
    const swept = start.map((a, j) => {
      const b = end[j], c = moving.get(a.id), pad = c ? radius(c.from) * c.rotation_deg / steps * Math.PI / 180 : 0;
      const x = Math.min(a.x, b.x) - pad, y = Math.min(a.y, b.y) - pad;
      return {id: a.id, x, y, w: Math.max(a.x + a.w, b.x + b.w) + pad - x, h: Math.max(a.y + a.h, b.y + b.h) + pad - y};
    });
    for (const [j, box] of swept.entries()) {
      if (box.x < 0 || box.y < 0 || box.x + box.w > env.task.room.width_m || box.y + box.h > env.task.room.depth_m)
        fail('motion_outside_floor', box.id + ' swept envelope leaves the room.');
      if (staticBoxes.some(b => overlaps(box, b, p.clearance_m))) fail('motion_obstacle', box.id + ' swept envelope intersects an obstacle or parked AMR.');
      if (swept.slice(0, j).some(b => b.id !== box.id && overlaps(box, b, p.clearance_m)))
        fail('motion_collision', box.id + ' swept envelope intersects another asset.');
    }
  }
  const sum = fn => changed.reduce((s, c) => s + fn(c), 0);
  const stages = [['relocation_disconnect', sum(c => p[c.kind + '_disconnect_s'])],
    ['relocate', sum(c => c.distance_m / p.translation_speed_m_s + c.rotation_deg / p.rotation_speed_deg_s)],
    ['relocation_reconnect', sum(c => p[c.kind + '_reconnect_s'])],
    ['relocation_calibrate', sum(c => p[c.kind + '_calibrate_s'])]].filter(([, duration]) => duration > 0);
  return {errors, changed, stages, duration_s: stages.reduce((s, [, duration]) => s + duration, 0),
    target: structuredClone(target), model: structuredClone(model)};
}
