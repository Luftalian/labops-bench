import {suite,suiteConfig} from '../../benchmark/lemat-sdl/suite.mjs';
import {initialCandidates} from '../../agent/benchmark-actions.mjs';
import {packedCellLayout} from '../../agent/layout-packing.mjs';
import {placeExact,requestViolations} from '../counts/evaluator.mjs';
import {loadCustomTasks,customizeTask} from '../counts/custom-tasks.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {serialize, deserialize} from 'node:v8';
import {createHash} from 'node:crypto';
import {ROOT} from '../stage1/service.mjs';
import {SchedulerSession} from './session.mjs';
import {schedulerFixture, defaultConfig} from './tasks.mjs';
import {validate} from './validate.mjs';

const sourceFiles = ['contracts/labops.schema.json', 'backend/scheduler/session.mjs', 'backend/scheduler/tasks.mjs',
      'backend/scheduler/policy.mjs','backend/scheduler/staging.mjs','backend/counts/custom-tasks.mjs','benchmark/lemat-sdl/suite.mjs','benchmark/lemat-sdl/scenarios.json','benchmark/lemat-sdl/workflows.json','agent/benchmark-actions.mjs','agent/challenge-actions.mjs','agent/layout-packing.mjs','agent/policy-runtime.mjs', 'backend/scheduler/motion.mjs', 'backend/scheduler/data/relocation.json',
      'backend/scheduler/service.mjs', 'backend/scheduler/validate.mjs', 'backend/counts/evaluator.mjs', 'backend/counts/tasks.mjs',
      'backend/poc/sim/v4/core.mjs','backend/poc/sim/v4/initial-samples.mjs', 'backend/poc/sim/v4/environment.mjs', 'backend/poc/sim/v4/fleet.mjs',
      'backend/poc/sim/v4/agents.mjs', 'backend/poc/sim/v4/tasks.mjs', 'backend/poc/sim/v2/geometry.mjs',
      'backend/poc/sim/v2/tasks.mjs', 'backend/poc/sim/v4/placement.mjs', 'backend/poc/sim/v4/concurrency.mjs',
      'backend/poc/sim/v4/diagnostics.mjs', 'agent/scheduler-controller.mjs', 'agent/llm-scheduler.mjs',
      'backend/poc/sim/v2/data/catalog.json', 'backend/poc/sim/v2/data/procedures.json', 'requirements-lock.txt'];
const fileHash = file => createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex');
const loadedSourceHashes = Object.fromEntries(sourceFiles.map(f => [f, fileHash(f)]));
const unchanged = source => Object.entries(source).every(([file, expected]) => fs.existsSync(path.join(ROOT, file)) && fileHash(file) === expected);

export class SchedulerService {
  constructor({directory = path.join(ROOT, 'results/local/scheduler-v0.2'), definitions = [schedulerFixture(14, 10), schedulerFixture(8, 7),...suite()]} = {}) {
    this.directory = directory; this.customDirectory=path.join(directory,'custom-tasks'); this.definitions = [...definitions,...loadCustomTasks(this.customDirectory)]; this.sessions = new Map(); this.queues = new Map();
    fs.mkdirSync(directory, {recursive: true});
    for (const id of fs.readdirSync(directory)) {
      if (!/^[a-f0-9-]{36}$/.test(id)) continue;
      const file = path.join(directory, id, 'private-state.v8');
      if (fs.existsSync(file)) {
        const session = SchedulerSession.restore(deserialize(fs.readFileSync(file)));
        this.sessions.set(id, session); if (this.compatible(session)) this.save(session);
      }
    }
  }
  tasks() {return structuredClone(this.definitions.map(({request,...publicBundle}) => {
    const config=['public-cell-candidates-v1','dense-cell-candidates-v2'].includes(publicBundle.task.policies.placement)?suiteConfig:defaultConfig;
    const s=new SchedulerSession({...publicBundle,request},{config}),predefined=config===suiteConfig&&!publicBundle.task.task_id.startsWith('custom-');
    const candidates=predefined?initialCandidates(s.snapshot()):[];
    return {...publicBundle,scheduler_config:config,...(candidates.length?{layout_candidates:candidates,suggested_design:(candidates.find(c=>c.id==='packed-full')??candidates[0]).design}:{})};
  }));}
  async packing(body){
    if(!body||Object.keys(body).some(k=>!['task_id','task_version','equipment_counts','amr_count','pitch_x_m','pitch_y_m'].includes(k)))return {status:422,body:{error:'invalid_packing_parameters'}};
    const bundle=this.definitions.find(b=>b.task.task_id===body.task_id&&b.task.version===body.task_version);
    if(!bundle)return {status:404,body:{error:'unknown_task'}};
    if(bundle.task.external_staging)return {status:422,body:{error:'Select an active-model candidate for staging tasks; edit canonical JSON for other layouts.'}};
    const countErrors=await validate(body.equipment_counts,'Counts');
    if(countErrors.length||![body.pitch_x_m,body.pitch_y_m].every(v=>Number.isFinite(v)&&v>0))return {status:422,body:{error:'invalid_packing_parameters',violations:countErrors}};
    const design={schema_version:'0.2',submission_id:'packing-preview',task_id:bundle.task.task_id,task_version:bundle.task.version,simulation_seed:bundle.task.simulation_seed,
      equipment_counts:body.equipment_counts,arm_count:Object.values(body.equipment_counts).reduce((n,v)=>n+v,0),amr_count:body.amr_count};
    const errors=await validate(design,'DesignRequest');if(errors.length)return {status:422,body:{error:'invalid_design',violations:errors}};
    errors.push(...requestViolations(bundle.task,design));if(errors.length)return {status:422,body:{error:'invalid_resources',violations:errors}};
    design.layout=packedCellLayout(bundle.task,design.equipment_counts,body);
    const p=placeExact(bundle.task,design);if(!p.validation.valid)return {status:422,body:{error:'packing_geometry_rejected',violations:p.validation.errors}};
    return {status:200,body:{design,note:'Geometry-valid proposal; not a simulation score. One arm per device. Original body, reach and route constraints preserved.'}};
  }
  customize(body) {return customizeTask(this.definitions,body,this.customDirectory);}
  compatible(session) {
    const source = session.journal.find(e => e.kind === 'provenance')?.source_hashes;
    return !source || unchanged(source);
  }
  async read(id, kind = 'observation') {
    await (this.queues.get(id) ?? Promise.resolve());
    const s = this.sessions.get(id);
    if (!s) return {status: 404, body: {error: 'unknown_session'}};
    return {status: 200, body: kind === 'journal' ? structuredClone(s.journal) : kind === 'result'
      ? this.compatible(s) ? s.result() : JSON.parse(fs.readFileSync(path.join(this.directory, id, 'result.json'), 'utf8')) : s.snapshot()};
  }
  save(session) {
    const folder = path.join(this.directory, session.sessionId); fs.mkdirSync(folder, {recursive: true});
    const atomic = (name, data) => {fs.writeFileSync(path.join(folder, name + '.tmp'), data); fs.renameSync(path.join(folder, name + '.tmp'), path.join(folder, name));};
    // The state contains the complete committed journal. If a process stops
    // between these writes, startup can reconstruct the text journal from it.
    atomic('private-state.v8', serialize(session.exportState()));
    const journal = path.join(folder, 'decisions.jsonl');
    const existing = fs.existsSync(journal) ? fs.readFileSync(journal, 'utf8').trim().split('\n').filter(Boolean) : [];
    if (existing.length > session.journal.length || existing.some((line, i) => line !== JSON.stringify(session.journal[i])))
      throw new Error('Persisted scheduler journal disagrees with committed state.');
    // Preserve the committed prefix, then atomically publish the appended
    // journal so a stopped process cannot leave half a JSONL record.
    atomic('decisions.jsonl', session.journal.map(e => JSON.stringify(e)).join('\n') + '\n');
    atomic('result.json', JSON.stringify(session.result(), null, 2) + '\n');
  }
  async create(body) {
    if (!unchanged(loadedSourceHashes)) return {status: 409, body: {error: 'server_source_changed: restart the development server before creating sessions'}};
    const shape = await validate(body, 'SchedulerSessionRequest');
    if (shape.length) return {status: 422, body: {error: 'invalid_session_config', violations: shape}};
    const bundle = this.definitions.find(b => b.task.task_id === body.task_id && b.task.version === body.task_version);
    if (!bundle) return {status: 404, body: {error: 'unknown_task'}};
    const config = body.config ?? (['public-cell-candidates-v1','dense-cell-candidates-v2'].includes(bundle.task.policies.placement)?suiteConfig:defaultConfig), errors = await validate(config, 'SchedulerConfig');
    if (errors.length) return {status: 422, body: {error: 'invalid_session_config', violations: errors}};
    if (config.max_decisions > 1024 || config.decision_interval_s < 1 || config.response_timeout_ms > 300000)
      return {status: 422, body: {error: 'local_session_limits'}};
    const session = new SchedulerSession(bundle, {config}); this.sessions.set(session.sessionId, session);

    session.record('provenance', {node: process.version, source_hashes: loadedSourceHashes});
    this.save(session); return {status: 201, body: session.snapshot()};
  }
  async operate(id, operation, body) {
    if (!this.sessions.has(id)) return {status: 404, body: {error: 'unknown_session'}};
    const work = (this.queues.get(id) ?? Promise.resolve()).then(async () => {
      const session = this.sessions.get(id); let response;
      if (!this.compatible(session)) return {status: 409, body: {error: 'session_source_changed: create a new session; recorded results remain readable'}};
      if (operation === 'decisions') response = await session.submit(body);
      else if (operation === 'advance') {
        if (body && Object.keys(body).length) return {status: 422, body: {error: 'advance_takes_no_clock_override'}};
        try {response = {status: 200, body: await session.advance()};}
        catch (error) {response = {status: 409, body: {error: error.message}};}
      } else return {status: 404, body: {error: 'unknown_operation'}};
      this.save(session); return response;
    });
    this.queues.set(id, work.catch(() => {})); return work;
  }
}
