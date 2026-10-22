import {randomUUID} from 'node:crypto';
import {PROTOCOL} from '../backend/scheduler/tasks.mjs';

export function decisionEnvelope(observation) {
  return {protocol: PROTOCOL, session_id: observation.session_id, snapshot_id: observation.snapshot_id,
    epoch_id: observation.epoch_id, state_version: observation.state_version, decision_id: randomUUID()};
}
// This is the only model-facing contract: a public immutable observation in,
// a structured decision out. Inject a provider's async function here; importing
// this module never calls a model or reads credentials.
export async function runController(session, controller, {onEpoch = () => {}, signal} = {}) {
  while (session.phase !== 'done') {
    if (signal?.aborted) throw new Error('Controller run aborted');
    if (session.usedDecisions < session.config.max_decisions && !session.epochDecided) {
      const observation = session.snapshot(), abort = new AbortController(); let timer;
      const forward = () => abort.abort(signal.reason); signal?.addEventListener('abort', forward, {once: true});
      const started = performance.now();
      try {
        const decision = await Promise.race([
          Promise.resolve().then(() => controller(structuredClone(observation), {signal: abort.signal})),
          new Promise((_, reject) => {timer = setTimeout(() => {abort.abort(); reject(new Error('controller_timeout'));}, session.config.response_timeout_ms);})
        ]);
        if (signal?.aborted) throw new Error('Controller run aborted');
        let response = await session.submit(decision);
        if (response.status >= 500) response = await session.submit(decision);
      } catch (error) {
        if (signal?.aborted) throw error;
        if (error.fatal) {session.record('provider_failure',{message:error.message});session.env.finish('provider_failure');break;}
        session.timeout(error.message === 'controller_timeout' ? 'controller_timeout' : 'controller_error');
      } finally {
        clearTimeout(timer); signal?.removeEventListener('abort', forward);
        session.record('controller_wall_time', {epoch_id: observation.epoch_id, wall_time_ms: performance.now() - started});
      }
    }
    if (session.phase === 'done') break;
    if (session.epochDecided || session.usedDecisions >= session.config.max_decisions) {
      if (!session.started) {session.env.finish('initialization_failed'); break;}
      await session.advance(); await onEpoch(session.snapshot());
    }
  }
  return session.result();
}
