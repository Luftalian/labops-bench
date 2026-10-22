import fs from 'node:fs';
import assert from 'node:assert/strict';
import {publicCatalog, hash} from '../backend/counts/tasks.mjs';
const folder = new URL('../fixtures/counts/', import.meta.url);
for (const file of fs.readdirSync(folder).filter(f => f.endsWith('.json'))) {
  const b = JSON.parse(fs.readFileSync(new URL(file, folder)));
  assert.deepEqual(b.catalog, publicCatalog, 'Fixture catalog must match the actual PoC model used by the engine');
  assert.equal(hash(b.task.jobs), b.task.workload_hash);
}
console.log('PASS count fixture catalog and frozen workload hashes');
