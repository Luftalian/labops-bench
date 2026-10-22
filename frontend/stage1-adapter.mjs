// Display adapter only. Metrics always remain the canonical server response.
// Graph paths are drawn between their declared node positions; no collision or
// robot reach certification is implied by the reused PoC illustrations.
export function displayResult(bundle, result, originalCatalog) {
  const {task, catalog: canonical} = bundle;
  const catalog = structuredClone(originalCatalog);
  const models = {mixer: 'stirrer', furnace: 'furnace', dryer: 'oven', analyzer: 'xrd'};
  for (const d of canonical.devices) {
    const model = structuredClone(catalog.equipment[models[d.device_type]]);
    model.size_m = [d.width_m, d.depth_m, .7];
    model.ports = {}; model.batch.max_slots = 1;
    catalog.equipment['stage1_' + d.device_type] = model;
  }
  const point = id => {const n = task.transport.nodes.find(n => n.node_id === id); return [n.x_m, task.room.depth_m - n.y_m];};
  const devices = result.resolved_placement.map(p => {
    const slot = task.slots.find(s => s.slot_id === p.slot_id), model = canonical.devices.find(d => d.device_type === p.device_type);
    return {id: p.instance_id, display_name: p.device_type[0].toUpperCase() + '-' + p.instance_id.split('-').at(-1), model: 'stage1_' + p.device_type,
      x: slot.x_m + model.width_m / 2, y: task.room.depth_m - slot.y_m - model.depth_m / 2, rotation: 0};
  });
  let last = point(task.transport.entry_node);
  const trace = [], batches = [];
  for (const e of result.events) {
    if (e.kind === 'process') {
      trace.push({...e, resource: e.resource_id});
      batches.push({id: e.event_id, device_id: e.resource_id, job_ids: [e.job_id], slots: 1, capacity: 1,
        start_s: e.start_s, end_s: e.end_s, process_start_s: e.start_s, process_end_s: e.end_s});
    } else if (e.resource_id === 'robot-001') {
      const points = e.path_nodes.length ? e.path_nodes.map(point) : [last];
      // A drain-clipped move covers only its recorded distance along the graph.
      if (e.path_nodes.length > 1) {
        let remain = e.distance_m;
        const clipped = [points[0]];
        for (let i = 1; i < points.length; i++) {
          const edges = task.transport.edges.filter(x =>
            x.from_node === e.path_nodes[i - 1] && x.to_node === e.path_nodes[i] ||
            x.to_node === e.path_nodes[i - 1] && x.from_node === e.path_nodes[i]);
          const length = Math.min(...edges.map(x => x.distance_m));
          const f = Math.min(1, remain / length);
          clipped.push(points[i - 1].map((v, axis) => v + (points[i][axis] - v) * f));
          remain -= Math.min(remain, length);
          if (f < 1) break;
        }
        points.splice(0, points.length, ...clipped);
      }
      const empty = e.kind === 'transport_empty';
      last = points.at(-1);
      trace.push({...e, resource: 'amr-1', from: points[0], to: last,
        empty_path: empty ? points : [points[0]], loaded_path: empty ? [last] : points,
        empty_until_s: empty ? e.end_s : e.start_s,
        loaded_from_s: empty ? e.end_s : e.start_s, loaded_until_s: e.end_s});
    }
  }
  return {catalog, replay: {configuration: {room: task.room, intake: point(task.transport.entry_node), buffer_slots: 0},
    layout: {devices, robots: []}, jobs: [], fleet: [{id: 'amr-1', home: point(task.transport.entry_node)}],
    trace, batches, metrics: {elapsed_s: Math.max(0, ...result.events.map(e => e.end_s))}}};
}
