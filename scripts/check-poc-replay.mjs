import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
// The imported verifier writes a Git-ignored proof. Prepare its output in a
// fresh clone without modifying the original verifier or its trace assertions.
const poc=fileURLToPath(new URL('../backend/poc/',import.meta.url));
fs.mkdirSync(new URL('../backend/poc/results/v4/validation/large-hall/',import.meta.url),{recursive:true});
process.chdir(poc);
await import('../backend/poc/scripts/verify-luna-replay.mjs');
