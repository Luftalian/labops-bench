import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {EvaluationService, ROOT, search} from '../backend/stage1/service.mjs';
import {CountEvaluationService} from '../backend/counts/service.mjs';
import {handleV4} from '../backend/poc/scripts/api-v4.mjs';
import {SchedulerService} from '../backend/scheduler/service.mjs';
import {handleScheduler} from '../backend/scheduler/http.mjs';

const poc = path.join(ROOT, 'backend/poc');
// Original PoC record manifests resolve their paths against this directory.
process.chdir(poc);
const service = new EvaluationService();
const counts = new CountEvaluationService();
const scheduler = new SchedulerService();
const send = (res, status, body) => {res.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}); res.end(JSON.stringify(body));};
async function read(req) {
  let body = '';
  for await (const part of req) { body += part; if (body.length > 1000000) throw new Error('Request exceeds 1 MB'); }
  return body ? JSON.parse(body) : {};
}
const mime = {'.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain', '.stl': 'application/octet-stream'};
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const p = decodeURIComponent(url.pathname);
    if (await handleScheduler(req, res, p, scheduler, {read, send})) return;
    if(p==='/v2/custom-tasks'&&req.method==='POST'){const r=await counts.customize(await read(req));return send(res,r.status,r.body);}
    if (p === '/v2/tasks' && req.method === 'GET') return send(res, 200, counts.tasks());
    if (p === '/v2/catalog' && req.method === 'GET') return send(res, 200, counts.tasks()[0].catalog);
    if (p === '/v2/runs' && req.method === 'POST') {
      const response = counts.create(await read(req)); return send(res, response.status, response.body);
    }
    const countRun = p.match(/^\/v2\/runs\/([a-f0-9-]+)$/);
    if (countRun && req.method === 'GET') {
      const run = counts.runs.get(countRun[1]);
      return send(res, run ? 200 : 404, run ? counts.snapshot(run) : {error: 'unknown_run'});
    }
    if (p === '/v2/evaluations' && req.method === 'POST') {
      let body; try {body = await read(req);} catch {body = null;}
      const response = await counts.evaluate(req.headers['x-labops-run-id'], body);
      return send(res, response.status, response.body);
    }
    if (p.startsWith('/v2/')) return send(res, 404, {error: 'unknown_endpoint'});
    if (p === '/v1/tasks' && req.method === 'GET') return send(res, 200, service.tasks());
    if (p === '/assets/poc-catalog.json' && req.method === 'GET') return send(res, 200,
      JSON.parse(fs.readFileSync(path.join(poc, 'sim/v2/data/catalog.json'))));
    if (p === '/v1/runs' && req.method === 'POST') {
      const response = service.create(await read(req)); return send(res, response.status, response.body);
    }
    const runPath = p.match(/^\/v1\/runs\/([a-f0-9-]+)(\/search)?$/);
    if (runPath) {
      const run = service.runs.get(runPath[1]);
      if (!run) return send(res, 404, {error: 'unknown_run'});
      if (runPath[2] && req.method === 'POST') {
        if (run.searching || run.used_calls || !['random', 'greedy'].includes(run.method)) return send(res, 409, {error: 'fresh_baseline_run_required'});
        run.searching = true;
        try {return send(res, 200, await search(service, run.run_id));}
        finally {run.searching = false; service.save(run);}
      }
      if (!runPath[2] && req.method === 'GET') return send(res, 200, service.snapshot(run));
    }
    if (p === '/v1/evaluations' && req.method === 'POST') {
      let body;
      try { body = await read(req); } catch {body = null;}
      const response = await service.evaluate(req.headers['x-labops-run-id'], body);
      return send(res, response.status, response.body);
    }
    if (p.startsWith('/v1/')) return send(res, 404, {error: 'unknown_endpoint'});
    if (await handleV4(req, res, p)) return;
    if(p==='/benchmarks/catalog.json')return send(res,200,JSON.parse(fs.readFileSync(path.join(ROOT,'fixtures/counts/room-14x10.json'))).catalog);
    let target,encoding;
    if(p==='/benchmarks/'||p==='/benchmarks')target=path.join(ROOT,'frontend/benchmarks/index.html');
    else if(p.startsWith('/benchmark-recordings/')){const match=p.match(/^\/benchmark-recordings\/([a-zA-Z0-9T._-]+)\/(lemat-sdl-[a-z0-9-]+)\/result\.json$/);if(!match)return send(res,403,{error:'forbidden'});const recordingRoot=path.join(ROOT,'results/lemat-sdl');target=path.resolve(recordingRoot,match[1],match[2],'result.json');if(!target.startsWith(recordingRoot+path.sep))return send(res,403,{error:'forbidden'});if(!fs.existsSync(target)){target=path.join(ROOT,'benchmark/published/recordings',match[1],match[2],'result.json.gz');encoding='gzip';}}
    else if (p === '/scheduler/' || p === '/scheduler') target = path.join(ROOT, 'frontend/scheduler/index.html');
    else if (p === '/legacy/' || p === '/legacy') target = path.join(ROOT, 'frontend/legacy/index.html');
    else if (p === '/poc' || p === '/poc/') target = path.join(poc, 'demo/index.html');
    else if (p === '/campus/styles.css' || p.startsWith('/hall/') || p.startsWith('/workshop/') || p.startsWith('/vendor/')) {
      const asset = p.match(/^\/workshop\/assets\/xarm\/(base|link[1-6])\.stl$/);
      target = asset ? path.join(poc, `sim/physics/assets/xarm6/xarm_description/meshes/xarm6/visual/${asset[1]}.stl`)
        : path.resolve(poc, 'demo', '.' + p);
      if (!target.startsWith(path.join(poc, asset ? 'sim/physics/assets/' : 'demo/'))) return send(res, 403, {error: 'forbidden'});
    } else {
      target = path.resolve(ROOT, 'frontend', '.' + (p === '/' ? '/index.html' : p));
      if (!target.startsWith(path.join(ROOT, 'frontend/'))) return send(res, 403, {error: 'forbidden'});
    }
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return send(res, 404, {error: 'not_found'});
    res.writeHead(200, {'Content-Type': encoding?'application/json':mime[path.extname(target)] ?? 'application/octet-stream',...(encoding?{'Content-Encoding':encoding}:{}), 'Cache-Control': 'no-store'});
    if (p === '/poc' || p === '/poc/') {
      const html = fs.readFileSync(target, 'utf8')
        .replace('href="/workshop/index.html">v2 sandbox', 'href="/">Formal benchmark')
        .replace('SHARED HALL v4</span>', 'ADDITIONAL MODE · v4</span>');
      res.end(html);
    } else res.end(fs.readFileSync(target));
  } catch (error) {if (!res.headersSent) send(res, 400, {error: error.message}); else res.end();}
});
const port = Number(process.env.PORT ?? 4173);
server.listen(port, '127.0.0.1', () => console.log(`Room/count benchmark: http://127.0.0.1:${port}/\nPoC dynamic hall: http://127.0.0.1:${port}/poc/\nLegacy 0.1: http://127.0.0.1:${port}/legacy/`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
