import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {displayResult} from '../../frontend/stage1-adapter.mjs';
const bundle=JSON.parse(fs.readFileSync(new URL('../../fixtures/single-mix-valid.json',import.meta.url)));
const catalog=JSON.parse(fs.readFileSync(new URL('../../backend/poc/sim/v2/data/catalog.json',import.meta.url)));
test('viewer adapter preserves canonical data and exact count, flips y only for display',()=>{
  const original=JSON.stringify({bundle,catalog});
  const {replay,catalog:visual}=displayResult(bundle,bundle.result,catalog);
  assert.equal(replay.layout.devices.length,1);
  const slot=bundle.task.slots[0],device=bundle.catalog.devices.find(d=>d.device_type==='mixer');
  assert.equal(replay.layout.devices[0].x,slot.x_m+device.width_m/2);
  assert.equal(replay.layout.devices[0].y,bundle.task.room.depth_m-slot.y_m-device.depth_m/2);
  assert.deepEqual(visual.equipment.stage1_mixer.size_m.slice(0,2),[device.width_m,device.depth_m]);
  assert.deepEqual(replay.layout.robots,[]);
  assert.equal(JSON.stringify({bundle,catalog}),original);
  assert.equal(bundle.result.metrics.makespan_s,12);
});
test('a drain-clipped move ends at its recorded partial distance',()=>{
  const result=structuredClone(bundle.result);
  result.events=[{...result.events[0],end_s:0.5,distance_m:0.5}];
  const {replay}=displayResult(bundle,result,catalog);
  assert.equal(replay.trace[0].to[0],0.5);
  assert.equal(replay.trace[0].end_s,0.5);
});
