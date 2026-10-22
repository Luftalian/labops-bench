import fs from 'node:fs';
import {developmentFixture} from '../backend/counts/tasks.mjs';
const directory = new URL('../fixtures/counts/', import.meta.url);
fs.mkdirSync(directory, {recursive: true});
for (const [width, depth] of [[8, 7], [14, 10]]) {
  fs.writeFileSync(new URL(`room-${width}x${depth}.json`, directory),
                   JSON.stringify(developmentFixture(width, depth), null, 2) + '\n');
}
