import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {spawn, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const legacyDefinitions = ['single-mix-valid.json', 'four-stage-input.json'].map(name =>
  JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures', name))));
const publicBundle = b => Object.fromEntries(['fixture_note', 'catalog', 'workflow', 'task'].map(k => [k, b[k]]));

export class EvaluationService {
  constructor({directory = path.join(ROOT, 'results/local/stage1'), callLimit = 20,
               definitions = legacyDefinitions,
               schemaFile = path.join(ROOT, 'contracts/archive/labops-v0.1.schema.json'),
               python = process.env.LABOPS_PYTHON ?? path.join(ROOT, '.venv/bin/python')} = {}) {
    this.directory = directory;
    this.callLimit = callLimit;
    this.python = python;
    this.definitions = definitions;
    this.schemaFile = schemaFile;
    this.runs = new Map();
    fs.mkdirSync(directory, {recursive: true});
    // Completed submissions survive local server restarts; incomplete journal
    // entries retain their call and may retry with the same id and payload.
    for (const name of fs.readdirSync(directory)) {
      const file = path.join(directory, name, 'manifest.json');
      if (!fs.existsSync(file)) continue;
      const run = JSON.parse(fs.readFileSync(file));
      run.cache = new Map(); run.queue = Promise.resolve(); run.searching = false;
      const journal = path.join(directory, name, 'submissions.jsonl');
      if (fs.existsSync(journal)) for (const line of fs.readFileSync(journal, 'utf8').trim().split('\n').filter(Boolean)) {
        const record = JSON.parse(line);
        if (['submitted', 'result'].includes(record.kind)) run.cache.set(record.id, record);
      }
      run.used_calls = Math.max(run.used_calls, ...[...run.cache.values()].map(r => r.call), 0);
      this.runs.set(run.run_id, run);
    }
  }
  tasks() { return structuredClone(this.definitions.map(publicBundle)); }
  snapshot(run) { const {cache, queue, ...data} = run; return structuredClone(data); }
  save(run) {
    const folder = path.join(this.directory, run.run_id);
    fs.mkdirSync(folder, {recursive: true});
    fs.writeFileSync(path.join(folder, 'manifest.json.tmp'), JSON.stringify(this.snapshot(run), null, 2) + '\n');
    fs.renameSync(path.join(folder, 'manifest.json.tmp'), path.join(folder, 'manifest.json'));
  }
  journal(run, data) {
    fs.appendFileSync(path.join(this.directory, run.run_id, 'submissions.jsonl'),
                      JSON.stringify({at: new Date().toISOString(), ...data}) + '\n');
  }
  create(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).some(k => !['task_id', 'task_version', 'method', 'search_seed'].includes(k)) ||
        !['manual', 'random', 'greedy', 'ai'].includes(body.method ?? 'manual') ||
        !Number.isSafeInteger(body.search_seed ?? 0) || (body.search_seed ?? 0) < 0)
      return {status: 422, body: {error: 'invalid_run_configuration'}};
    const bundle = this.definitions.find(b => b.task.task_id === body.task_id && b.task.version === body.task_version);
    if (!bundle) return {status: 404, body: {error: 'unknown_task_version'}};
    const run = {run_id: randomUUID(), task_id: body.task_id, task_version: body.task_version,
      method: body.method ?? 'manual', search_seed: body.search_seed ?? 0, call_limit: this.callLimit,
      used_calls: 0, result_origin: 'simulation', track: bundle.workflow.track,
      task_hash: sha(bundle.task), catalog_hash: sha(bundle.catalog), workflow_hash: sha(bundle.workflow),
      schema_sha256: createHash('sha256').update(fs.readFileSync(this.schemaFile)).digest('hex'),
      policies: bundle.task.policies,
      ...(bundle.task.equipment_budget_credits === undefined ? {} : {equipment_budget_credits: bundle.task.equipment_budget_credits, horizon_s: bundle.task.horizon_s}),
      created_at: new Date().toISOString(),
      git_commit: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: ROOT, encoding: 'utf8'}).trim(),
      git_dirty: Boolean(execFileSync('git', ['status', '--porcelain'], {cwd: ROOT, encoding: 'utf8'}).trim()),
      source_hashes: Object.fromEntries(['backend/stage1/engine.py', 'backend/stage1/cli.py', 'backend/stage1/service.mjs',
        'scripts/check_contracts.py', 'requirements-dev.txt'].map(f => [f,
          createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex')])),
      node_version: process.version,
      python_version: execFileSync(this.python, ['--version'], {encoding: 'utf8'}).trim(),
      model: null, prompt_hash: null, api_spending: null, tokens: null,
      recommendation: null, stop_reason: null, cache: new Map(), queue: Promise.resolve()};
    this.runs.set(run.run_id, run); this.save(run);
    return {status: 201, body: this.snapshot(run)};
  }
  evaluate(runId, request) {
    const run = this.runs.get(runId);
    if (!run) return Promise.resolve({status: 404, body: {error: 'unknown_run'}});
    const job = run.queue.then(() => this.submit(run, request));
    run.queue = job.catch(() => {});
    return job;
  }
  async submit(run, request) {
    const id = typeof request?.submission_id === 'string' && request.submission_id ? request.submission_id : randomUUID();
    const hash = sha(canonical(request));
    const prior = run.cache.get(id);
    if (prior) {
      if (prior.request_hash !== hash) {
        this.journal(run, {kind: 'id_conflict', id, request_hash: hash});
        return {status: 409, body: {error: 'submission_id_payload_conflict'}};
      }
      if (prior.response && prior.response.status < 500) return prior.response;
    } else if (run.used_calls >= run.call_limit) {
      return {status: 429, body: {error: 'evaluation_call_limit', used_calls: run.used_calls}};
    }
    const call = prior?.call ?? ++run.used_calls;
    const record = {kind: 'submitted', id, call, request_hash: hash, request};
    run.cache.set(id, record); this.journal(run, record); this.save(run);
    const bundle = this.definitions.find(b => b.task.task_id === run.task_id && b.task.version === run.task_version);
    let response;
    const start = performance.now();
    if (sha(bundle.task) !== run.task_hash || sha(bundle.catalog) !== run.catalog_hash || sha(bundle.workflow) !== run.workflow_hash) {
      response = {status: 409, body: {error: 'bound_task_changed', message: 'Restore the original task/catalog/workflow or create a new versioned run'}};
    } else if (typeof request?.task_id === 'string' && typeof request?.task_version === 'string' &&
        (request.task_id !== run.task_id || request.task_version !== run.task_version)) {
      response = {status: 404, body: {error: 'task_version_not_bound_to_run'}};
    } else {
      try { response = await this.compute(bundle, request); }
      catch (error) { response = {status: 500, body: {error: 'evaluation_failed', message: error.message}}; }
    }
    const done = {...record, kind: 'result', response, wall_time_ms: performance.now() - start};
    run.cache.set(id, done); this.journal(run, done); this.save(run);
    return response;
  }
  compute(bundle, request) {
    return new Promise((resolve, reject) => {
      const child = spawn(this.python, [path.join(ROOT, 'backend/stage1/cli.py')], {cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe']});
      let output = '', errors = '';
      const timer = setTimeout(() => child.kill(), 30000);
      child.stdout.on('data', b => output += b);
      child.stderr.on('data', b => errors += b);
      child.on('error', e => {clearTimeout(timer); reject(e);});
      child.on('close', code => {
        clearTimeout(timer);
        if (code !== 0) return reject(new Error(errors || 'Evaluator stopped or timed out'));
        try { resolve(JSON.parse(output)); } catch (error) { reject(error); }
      });
      child.stdin.on('error', () => {});
      child.stdin.end(JSON.stringify({bundle, request}));
    });
  }
}

export function rank(results) {
  return results.filter(r => r.valid && r.result_origin === 'simulation').sort((a, b) =>
    b.metrics.throughput_jobs_per_hour - a.metrics.throughput_jobs_per_hour ||
    a.metrics.equipment_cost_credits - b.metrics.equipment_cost_credits ||
    (a.metrics.makespan_s ?? Infinity) - (b.metrics.makespan_s ?? Infinity));
}

export async function search(service, runId) {
  const run = service.runs.get(runId);
  if (!run || !['random', 'greedy'].includes(run.method)) throw new Error('A random or greedy run is required');
  if (run.used_calls) throw new Error('Search requires a fresh run');
  const bundle = service.tasks().find(b => b.task.task_id === run.task_id && b.task.version === run.task_version);
  const kinds = bundle.catalog.devices.map(d => d.device_type).sort();
  const required = new Set(bundle.workflow.steps.map(s => s.device_type));
  let counts = Object.fromEntries(kinds.map(k => [k, Number(required.has(k))]));
  const results = [];
  let state = run.search_seed >>> 0;
  const rng = () => {state = (state + 0x6d2b79f5) >>> 0; let t = Math.imul(state ^ state >>> 15, 1 | state); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296;};
  const evaluate = async candidate => {
    const response = await service.evaluate(runId, {schema_version: '0.1', submission_id: randomUUID(),
      task_id: run.task_id, task_version: run.task_version, stage: 1,
      equipment_counts: candidate, simulation_seed: 0});
    if (response.status === 200) results.push(response.body);
    if (response.status >= 500) throw new Error('Evaluator failed; retained in run journal');
    return response.body;
  };
  try {
    if (run.method === 'random') {
      while (run.used_calls < run.call_limit) {
        // Every generated candidate is submitted, including invalid/duplicate ones.
        counts = Object.fromEntries(kinds.map(k => [k, Math.floor(rng() *
          (bundle.catalog.devices.find(d => d.device_type === k).max_instances + 1))]));
        await evaluate(counts);
      }
    } else {
      let best = await evaluate(counts);
      while (best.valid && run.used_calls < run.call_limit) {
        const neighbors = [];
        for (const k of kinds) {
          if (run.used_calls >= run.call_limit) break;
          const device = bundle.catalog.devices.find(d => d.device_type === k);
          if (counts[k] >= device.max_instances) continue;
          const candidate = {...counts, [k]: counts[k] + 1};
          const cost = bundle.catalog.devices.reduce((s, d) => s + d.unit_cost_credits * candidate[d.device_type], 0);
          if (cost > bundle.task.equipment_budget_credits || Object.values(candidate).reduce((s, n) => s + n, 0) > bundle.task.slots.length) continue;
          neighbors.push({candidate, result: await evaluate(candidate)});
        }
        const next = rank([best, ...neighbors.map(n => n.result)])[0];
        if (!next || next === best) break;
        counts = neighbors.find(n => n.result === next).candidate; best = next;
      }
    }
    run.recommendation = rank(results)[0]?.submission_id ?? null;
    run.stop_reason = run.used_calls >= run.call_limit ? 'call_limit' : 'no_improving_candidate';
  } catch (error) {run.stop_reason = 'error'; run.search_error = error.message;}
  service.save(run);
  return {run: service.snapshot(run), results, requests: [...run.cache.values()].map(record => record.request)};
}
