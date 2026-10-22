import {randomUUID} from 'node:crypto';
import {HallEnvironment} from '../poc/sim/v4/environment.mjs';
import {catalog} from '../poc/sim/v4/tasks.mjs';
import {nativeTask, hash} from '../counts/tasks.mjs';
import {placeExact, requestViolations} from '../counts/evaluator.mjs';
import {PROTOCOL, defaultConfig, relocationModel, transitionModels, digest} from './tasks.mjs';
import {validate} from './validate.mjs';
import {priorityActions} from './policy.mjs';
import {relocationPlan} from './motion.mjs';

const copy = structuredClone, EPS = 1e-7;
const violation = (code, message) => ({code, message});
export class SchedulerSession {
  constructor(bundle, {sessionId = randomUUID(), config = defaultConfig, model = relocationModel} = {}) {
    this.bundle = copy(bundle); this.sessionId = sessionId; this.config = copy(config); this.model = copy(model);
    this.env = new HallEnvironment(nativeTask(bundle.task, bundle.request));
    this.started = false; this.request = null; this.epoch = 0; this.revision = 0; this.usedDecisions = 0;
    this.epochDecided = false; this.pending = null; this.receipts = []; this.cache = new Map(); this.journal = [];
    const t = bundle.task;
    this.context = {task_id: t.task_id, task_version: t.version, task_hash: hash(t), catalog_id: t.catalog_id,
      catalog_version: t.catalog_version, workload_hash: t.workload_hash, room: copy(t.room), external_staging: copy(t.external_staging ?? null), initial_sample_policy:t.initial_sample_policy??null,
      placement_policy:t.policies.placement, inventory_policy:t.policies.inventory??null, buffer_slots:t.workload_parameters.buffer_slots??bundle.catalog.robot.buffer_slots,
      resource_limits: copy(t.resource_limits), simulation_seed: t.simulation_seed,
      simulation_cutoff_s: t.simulation_cutoff_s, objective: t.objective, transition_models: transitionModels(model)};
    this.record('created', {config: this.config, context: this.context});
  }
  record(kind, data) {this.journal.push({sequence: this.journal.length, time_s: this.env.time, kind, ...copy(data)});}
  get phase() {return this.env.phase === 'done' ? 'done' : this.started ? 'reschedule' : 'initial_design';}
  installed() {return {equipment_counts: copy(this.request?.equipment_counts ?? Object.fromEntries(Object.keys(this.bundle.task.resource_limits.equipment).map(k => [k, 0]))),
    arms: this.request?.arm_count ?? 0, amrs: this.request?.amr_count ?? 0};}
  snapshot() {
    const e = this.env, o = e.observe(), live = e.jobs.filter(j => j.status !== 'done');
    const active = e.trace.filter(t => t.end_s > e.time + EPS);
    const resources = [];
    const add = (id, kind, available = e.time, slots = {}) => {
      const intervals = active.filter(t => t.resource === id);
      resources.push({resource_id: id, kind, state: intervals.some(t => t.start_s <= e.time + EPS) ? 'busy' : intervals.length ? 'reserved' : 'idle',
        available_s: Math.max(e.time, available, ...intervals.map(t => t.end_s)),
        committed_job_ids: [...new Set([...intervals.flatMap(t => t.job_ids ?? []), ...live.filter(j =>
          j.admitted_s !== undefined && j.nodes.some(n => n.status !== 'done' && j.routes[n.id] === id)).map(j => j.id)])],
        capacity_slots: null, occupied_slots: null, future_reserved_slots: null, ...slots});
    };
    for (const d of e.layout.devices) add(d.id, 'device', e.deviceState[d.id].available_s);
    for (const r of e.layout.robots) {
      add(r.id, 'arm');
      const tokens = e.tokens.filter(t => t.robot_id === r.id);
      add(r.id + '-buffer', 'buffer', e.time, {capacity_slots: e.task.buffer_slots,
        occupied_slots: tokens.filter(t => t.available_s <= e.time).length,
        future_reserved_slots: Math.max(tokens.filter(t => t.available_s > e.time).length, e.credits()[r.id])});
    }
    if (this.started) for (const c of e.carriers) add(c.id, 'amr', c.available_s);
    if (this.pending?.phase === 'transitioning') add('relocation-team', 'configuration_cart', this.pending.end_s);
    const jobs = live.map(j => ({job_id: j.id, arrival_s: j.arrival_s, due_s: j.due_s ?? null,
      status: j.arrival_s > e.time ? 'future' : j.nodes.some(n => n.status === 'running') ? 'running' : j.admitted_s !== undefined ? 'admitted' : 'queued',
      current_priority: j.priority, sample_location:!this.started&&this.context.initial_sample_policy==='local-arm-buffer'?'staged_after_initial_design':e.tokens.find(t=>t.job_id===j.id)?.robot_id??(j.admitted_s!==undefined?'in_engine':'intake'), nodes: j.nodes.map(n => {
        const batch = e.batches.find(b => b.id === n.batch_id), remaining = n.status === 'done' ? 0 : n.status === 'running'
          ? Math.max(0, (batch?.process_end_s ?? e.time) - Math.max(e.time, batch?.process_start_s ?? e.time)) : n.duration_s;
        return {node_id: n.id, depends_on: copy(n.parents), required_capability: n.capability, process_s: n.duration_s,
          remaining_process_s: remaining, status: n.status === 'done' ? 'completed' : n.status === 'running' && batch?.process_start_s > e.time ? 'reserved' : n.status,
          assigned_device_id: n.device_id ?? j.routes?.[n.id] ?? null};
      })}));
    return {protocol: PROTOCOL, session_id: this.sessionId, snapshot_id: digest([this.sessionId, this.revision, this.epoch, e.version, e.time]),
      epoch_id: this.epoch, state_version: this.revision, time_s: e.time, phase: this.phase, config: copy(this.config),
      decision_required: this.phase !== 'done' && !this.epochDecided && this.usedDecisions < this.config.max_decisions,
      decisions_remaining: Math.max(0, this.config.max_decisions - this.usedDecisions),
      context: copy(this.context), catalog: copy(this.bundle.catalog), layout: copy(e.layout), installed_resources: this.installed(),
      jobs, completed_jobs: e.jobs.length - jobs.length, total_jobs: e.jobs.length, resources, reservations: copy(active),
      reconfiguration_state: {phase: this.pending?.phase ?? 'idle', decision_id: this.pending?.decision_id ?? null,
        deadline_s: this.pending?.deadline_s ?? null, target_layout: this.pending ? copy(this.pending.plan.target) : null},
      recent_receipts: copy(this.receipts.slice(-20))};
  }
  receipt(id, decisionHash, {status = 'rejected', code, errors = [], priority = 'rejected', layout = 'rejected', applied = null}) {
    const r = {protocol: PROTOCOL, session_id: this.sessionId, decision_id: id, decision_hash: decisionHash,
      epoch_id: this.epoch, state_version: ++this.revision, time_s: this.env.time, status, priority_status: priority,
      layout_status: layout, applied_time_s: applied, code, violations: errors};
    this.receipts.push(r); this.record('receipt', {receipt: r}); return r;
  }
  async submit(decision) {
    const key = typeof decision?.decision_id === 'string' && decision.decision_id ? decision.decision_id : null;
    const h = digest(decision ?? null), cached = key && this.cache.get(key);
    if (cached && cached.hash !== h) return {status: 409, body: {error: 'decision_id_conflict'}};
    if (cached?.response) return copy(cached.response);
    if (this.phase === 'done') return {status: 409, body: {error: 'session_terminal'}};
    if (!cached && this.usedDecisions >= this.config.max_decisions) return {status: 429, body: {error: 'decision_budget_exhausted'}};
    const before = this.snapshot();
    if (!cached) {
      this.usedDecisions++;
      this.record('submitted', {decision, decision_hash: h, observation: before, call: this.usedDecisions});
      if (key) this.cache.set(key, {hash: h, response: null});
    } else this.record('infrastructure_retry', {decision_id: key, decision_hash: h});
    let errors, plan, placement;
    try {errors = await this.validateDecision(decision);}
    catch (error) {
      this.record('infrastructure_failure', {decision_id: key, message: error.message});
      return {status: 500, body: {error: 'validation_unavailable', message: 'Retry the same decision ID and payload; no extra call will be charged.'}};
    }
    if (!errors.length) {
      for (const field of ['session_id', 'snapshot_id', 'epoch_id', 'state_version'])
        if (decision[field] !== before[field]) errors.push(violation('stale_state', 'Mismatched ' + field));
      if (decision.type !== before.phase) errors.push(violation('wrong_phase', 'Decision type does not match session phase.'));
      if (this.epochDecided) errors.push(violation('epoch_already_decided', 'Advance before another accepted decision.'));
      const jobs = before.jobs.map(j => j.job_id), priorities = decision.priorities.map(p => p.job_id);
      if (new Set(priorities).size !== priorities.length || priorities.length !== jobs.length || jobs.some(id => !priorities.includes(id)))
        errors.push(violation('priority_job_set', 'Provide exactly one priority for every remaining job.'));
      if (decision.type === 'initial_design') {
        const q = decision.initial_design;
        if (q.task_id !== this.context.task_id || q.task_version !== this.context.task_version || q.submission_id !== key)
          errors.push(violation('design_context', 'Initial design must match the task and decision identity.'));
        errors.push(...requestViolations(this.bundle.task, q));
        if (!errors.length) {
          placement = placeExact(this.bundle.task, q);
          if (!placement.validation.valid) errors.push(...placement.validation.errors.map(v => violation(v.code, JSON.stringify(v))));
        }
      } else if (decision.reconfiguration.mode === 'replace_layout') {
        if (this.pending) errors.push(violation('reconfiguration_in_progress', 'Wait for pending relocation to resolve.'));
        else {plan = relocationPlan(this.env, decision.reconfiguration.layout, this.config, this.model); errors.push(...plan.errors);}
      }
    }
    let response;
    if (errors.length) {
      response = {status: 422, body: this.receipt(key ?? 'malformed-' + this.usedDecisions, h, {code: errors[0].code, errors})};
      if (!this.started && this.usedDecisions >= this.config.max_decisions) this.env.finish('initialization_failed');
    } else {
      if (decision.type === 'initial_design') {
        this.request = copy(decision.initial_design); this.env = new HallEnvironment(placement.native);
        for (const action of [{type: 'set_layout', layout: placement.layout}, {type: 'start'}]) {
          const r = this.env.apply({...action, state_version: this.env.version});
          if (!r.accepted) throw new Error('Validated initial placement failed to start: ' + r.code);
        }
        this.started = true;
      }
      for (const p of decision.priorities) this.env.jobs.find(j => j.id === p.job_id).priority = p.priority;
      this.env.log('scheduler_priorities', {decision_id: key, priorities: decision.priorities, reason: decision.reason});
      this.epochDecided = true;
      if (plan?.changed.length) {
        this.pending = {decision_id: key, decision_hash: h, phase: 'draining', plan,
          deadline_s: Math.min(this.env.time + this.config.max_drain_s, this.env.task.horizon_s)};
        this.env.log('relocation_drain_requested', {decision_id: key, deadline_s: this.pending.deadline_s});
        response = {status: 200, body: this.receipt(key, h, {status: 'accepted_pending', code: 'draining', priority: 'applied', layout: 'draining'})};
      } else response = {status: 200, body: this.receipt(key, h, {status: 'applied', code: 'applied', priority: 'applied',
        layout: decision.type === 'initial_design' ? 'applied' : 'kept', applied: this.env.time})};
    }
    if (key) this.cache.set(key, {hash: h, response: copy(response)});
    return response;
  }
  async validateDecision(decision) {return validate(decision, 'SchedulerDecision');}
  timeout(reason = 'controller_timeout') {
    if (this.phase === 'done' || this.epochDecided || this.usedDecisions >= this.config.max_decisions) return;
    this.usedDecisions++; this.revision++; this.record('controller_failure', {reason, call: this.usedDecisions});
    if (!this.started && this.usedDecisions >= this.config.max_decisions) this.env.finish('initialization_failed');
    if (this.started) this.epochDecided = true;
  }
  resolvePending(status, code, layout) {
    const p = this.pending;
    this.receipt(p.decision_id, p.decision_hash, {status, code, priority: 'applied', layout,
      applied: status === 'applied' ? this.env.time : null});
    this.pending = null;
  }
  quiet() {
    return !this.env.jobs.some(j => j.admitted_s !== undefined && j.status !== 'done') && this.env.tokens.length === 0 &&
      !this.env.trace.some(t => t.end_s > this.env.time + EPS);
  }
  beginTransition() {
    const p = this.pending, plan = relocationPlan(this.env, p.plan.target, this.config, this.model);
    if (plan.errors.length) {this.resolvePending('rejected', 'revalidation_failed', 'rejected'); return;}
    p.plan = plan; p.phase = 'transitioning'; let at = this.env.time;
    for (const [kind, duration] of plan.stages) {
      const end = at + duration;
      this.env.trace.push({resource: 'relocation-team', kind, start_s: at, end_s: end, job_ids: [], decision_id: p.decision_id});
      for (const c of plan.changed) this.env.trace.push({resource: c.id, kind, start_s: at, end_s: end, job_ids: [],
        decision_id: p.decision_id, asset_kind: c.kind, from_pose: copy(c.from), to_pose: copy(c.to),
        path: [[c.from.x, c.from.y], [c.to.x, c.to.y]], distance_m: kind === 'relocate' ? c.distance_m : 0});
      at = end;
    }
    p.end_s = at; this.env.log('relocation_started', {decision_id: p.decision_id, end_s: at, model: plan.model});
    this.receipt(p.decision_id, p.decision_hash, {status: 'accepted_pending', code: 'relocation_started', priority: 'applied', layout: 'transitioning'});
  }
  finishTransition() {
    const e = this.env, p = this.pending;
    e.layout = copy(p.plan.target); e.layoutHistory.push({time_s: e.time, layout: copy(e.layout)});
    e.calendars = Object.fromEntries(e.layout.robots.map(r => [r.id, []]));
    e.futureArmReservations = []; e.traffic = []; e.fleetPaths = new Map();
    for (const d of e.layout.devices) {e.deviceState[d.id] ??= {batch_slots:1}; e.deviceState[d.id].available_s = e.time; e.deviceState[d.id].last_recipe = null;}
    e.log('relocation_applied', {decision_id: p.decision_id}); this.resolvePending('applied', 'relocation_applied', 'applied');
  }
  async advance() {
    if (this.phase === 'done') return this.snapshot();
    if (!this.started || !this.epochDecided && this.usedDecisions < this.config.max_decisions)
      throw new Error('A valid decision or controller timeout is required before advancing.');
    const e = this.env, target = Math.min((this.epoch + 1) * this.config.decision_interval_s, e.task.horizon_s);
    let actions = 0;
    while (e.phase !== 'done' && e.time < target - EPS) {
      if (++actions > 20000) {e.finish('scheduler_action_limit'); break;}
      if (this.pending?.phase === 'transitioning') {
        e.time = Math.min(target, this.pending.end_s, e.task.horizon_s); e.version++; e.refresh();
        if (e.time >= this.pending.end_s - EPS) this.finishTransition();
        if (e.time >= e.task.horizon_s && e.phase !== 'done') e.finish('time_horizon');
        continue;
      }
      if (this.pending?.phase === 'draining') {
        if (e.time >= this.pending.deadline_s - EPS) this.resolvePending('expired', 'drain_timeout', 'expired');
        else if (this.quiet()) {this.beginTransition(); continue;}
      }
      let applied = false;
      for (const action of priorityActions(e, {draining: !!this.pending})) {
        const probe = Object.assign(new HallEnvironment(e.task), copy({...e}));
        if (!probe.apply(action).accepted) continue;
        if (!e.apply(action).accepted) throw new Error('A feasible dispatch failed to commit.');
        applied = true; break;
      }
      if (applied) continue;
      const future = [...e.trace.map(t => t.end_s), e.nextEvent(), this.pending?.deadline_s]
        .filter(t => Number.isFinite(t) && t > e.time + EPS);
      if (!future.length && !this.pending && this.usedDecisions >= this.config.max_decisions) {e.finish('scheduler_deadlock'); break;}
      // An idle epoch can still be resolved by the next physical-layout
      // decision (for example a parked device). Keep the periodic boundary.
      const until = Math.min(target, ...future, e.task.horizon_s);
      const r = e.apply({type: 'wait', state_version: e.version, until_s: until});
      if (!r.accepted) throw new Error('Scheduler wait failed: ' + r.code);
      // Shared legacy wait labels any horizon hit as truncated, even when
      // its refresh just completed the last unload at that exact instant.
      if (e.terminal_reason === 'time_horizon' && e.jobs.every(j => j.status === 'done')) e.finish('completed');
      if (actions % 200 === 0) await new Promise(resolve => setImmediate(resolve));
    }
    if (e.phase !== 'done' && e.time >= e.task.horizon_s - EPS) e.finish('time_horizon');
    // Reflect events at the exact epoch before publishing its snapshot.
    if (e.phase !== 'done' && this.pending?.phase === 'draining') {
      if (e.time >= this.pending.deadline_s - EPS) this.resolvePending('expired', 'drain_timeout', 'expired');
      else if (this.quiet()) this.beginTransition();
    }
    if (e.phase === 'done' && this.pending) this.resolvePending('expired', e.terminal_reason === 'completed' ? 'workload_completed' : 'episode_ended', 'expired');
    if (e.phase !== 'done') {this.epoch++; this.epochDecided = false;}
    this.revision++; this.record('advanced', {epoch_id: this.epoch, state_version: this.revision,
      terminal_reason: e.terminal_reason, observation_hash: digest(this.snapshot())});
    return this.snapshot();
  }
  result() {
    const e = this.env, native = e.result(), completed = e.terminal_reason === 'completed';
    native.schema_version = 'labops.scheduler.replay.v0.2';
    native.metrics = {elapsed_s: e.time, completed_jobs: native.metrics.completed_jobs, total_jobs: e.jobs.length};
    if (native.validation) delete native.validation.installed_cost;
    native.evidence.agent = 'Structured scheduler decisions; shared nonpreemptive engine. No model inference implied.';
    return {protocol: PROTOCOL, session_id: this.sessionId, status: completed ? 'completed' : e.terminal_reason === 'time_horizon' ? 'truncated' :
      e.phase === 'done' ? 'error' : this.phase, terminal_reason: e.terminal_reason, objective: this.context.objective,
      metrics: {makespan_s: completed ? e.time : null, elapsed_s: e.time, total_jobs: e.jobs.length,
        completed_jobs: e.jobs.filter(j => j.status === 'done').length}, installed_resources: this.installed(),
      context: copy(this.context), config: copy(this.config), used_decisions: this.usedDecisions,
      receipts: copy(this.receipts), replay: this.started ? native : null};
  }
  exportState() {const {env, ...state} = this; return {...state, env: {...env}};}
  static restore(state) {
    const s = Object.assign(Object.create(SchedulerSession.prototype), state);
    s.env = Object.assign(new HallEnvironment(state.env.task), state.env); return s;
  }
}
