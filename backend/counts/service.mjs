import {loadCustomTasks,customizeTask} from './custom-tasks.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {Worker} from 'node:worker_threads';
import {EvaluationService, ROOT} from '../stage1/service.mjs';
const definitions = fs.readdirSync(path.join(ROOT, 'fixtures/counts')).filter(f => f.endsWith('.json')).sort().map(f =>
  JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures/counts', f))));
const files = ['contracts/labops.schema.json', 'backend/counts/tasks.mjs', 'backend/counts/evaluator.mjs',
  'backend/counts/worker.mjs','backend/counts/custom-tasks.mjs', 'backend/counts/validate.py', 'backend/counts/service.mjs', 'backend/stage1/service.mjs',
  'backend/poc/sim/v4/core.mjs','backend/poc/sim/v4/initial-samples.mjs', 'backend/poc/sim/v4/environment.mjs', 'backend/poc/sim/v4/agents.mjs',
  'backend/poc/sim/v4/tasks.mjs', 'backend/poc/sim/v4/fleet.mjs', 'backend/poc/sim/v2/geometry.mjs',
  'backend/poc/sim/v2/tasks.mjs', 'backend/poc/sim/v2/data/catalog.json', 'backend/poc/sim/v2/data/procedures.json',
  'requirements-lock.txt'];

export class CountEvaluationService extends EvaluationService {
  constructor(options = {}) {
    super({directory: path.join(ROOT, 'results/local/counts-v0.2'), definitions,
      schemaFile: path.join(ROOT, 'contracts/labops.schema.json'), ...options});
    this.customDirectory=path.join(this.directory,'custom-tasks'); this.definitions=[...this.definitions,...loadCustomTasks(this.customDirectory)];
    this.workerQueue = Promise.resolve();
  }
  customize(body) {return customizeTask(this.definitions,body,this.customDirectory);}
  create(body) {
    if (!['manual', 'ai'].includes(body?.method ?? 'manual')) return {status: 422, body: {error: 'model_and_baseline_evaluation_deferred'}};
    const response = super.create(body);
    if (response.status !== 201) return response;
    const run = this.runs.get(response.body.run_id), bundle = this.definitions.find(b => b.task.task_id === run.task_id && b.task.version === run.task_version);
    Object.assign(run, {contract_version: '0.2', objective: bundle.task.objective,
      room: bundle.task.room, resource_limits: bundle.task.resource_limits,
      simulation_cutoff_s: bundle.task.simulation_cutoff_s, simulation_seed: bundle.task.simulation_seed,
      engine: 'poc-shared-hall-v4/count-policy-1',
      source_hashes: Object.fromEntries(files.map(f => [f, createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex')]))});
    this.save(run);
    return {status: 201, body: this.snapshot(run)};
  }
  validate(value, definition) {
    return new Promise((resolve, reject) => {
      const child = spawn(this.python, [path.join(ROOT, 'backend/counts/validate.py')], {cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe']});
      let output = '', error = '';
      child.stdout.on('data', b => output += b); child.stderr.on('data', b => error += b);
      child.on('error', reject);
      child.on('close', code => {
        if (code !== 0) return reject(new Error(error || 'Schema validation process failed'));
        try {resolve(JSON.parse(output));} catch (e) {reject(e);}
      });
      child.stdin.on('error', () => {});
      child.stdin.end(JSON.stringify({definition, value}));
    });
  }
  async compute(bundle, request) {
    const shape = await this.validate(request, 'DesignRequest');
    if (shape.status !== 200) return shape;
    const calculation = this.workerQueue.then(() => new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./worker.mjs', import.meta.url), {workerData: {bundle, request}});
      let received = false;
      const timer = setTimeout(() => {worker.terminate(); reject(new Error('30 second computation limit; no completed score assigned'));}, 30000);
      worker.on('message', response => {received = true; clearTimeout(timer); resolve(response);});
      worker.on('error', e => {clearTimeout(timer); reject(e);});
      worker.on('exit', code => {if (!received) {clearTimeout(timer); reject(new Error('Simulation worker exited ' + code));}});
    }));
    this.workerQueue = calculation.catch(() => {});
    const response = await calculation;
    if (response.status === 200) {
      const valid = await this.validate(response.body, 'EvaluationResult');
      if (valid.status !== 200) throw new Error('Evaluator produced an invalid 0.2 result: ' + valid.body.message);
    }
    return response;
  }
}
