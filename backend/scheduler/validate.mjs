import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
export function validate(value, definition, python = process.env.LABOPS_PYTHON ?? root + '.venv/bin/python') {
  return new Promise((resolve, reject) => {
    const child = spawn(python, [root + 'backend/counts/validate.py'], {cwd: root, stdio: ['pipe', 'pipe', 'pipe']});
    let output = '', error = '';
    child.stdout.on('data', b => output += b); child.stderr.on('data', b => error += b);
    child.on('error', reject);
    child.on('close', code => {
      if (code) return reject(new Error(error || 'Schema validation failed'));
      try {const r = JSON.parse(output); resolve(r.status === 200 ? [] : [{code: 'invalid_shape', message: r.body.message}]);}
      catch (e) {reject(e);}
    });
    child.stdin.on('error', () => {}); child.stdin.end(JSON.stringify({definition, value}));
  });
}
