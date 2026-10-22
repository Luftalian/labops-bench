import fs from 'node:fs';
const schema = JSON.parse(fs.readFileSync(new URL('../contracts/labops.schema.json', import.meta.url)));
export const schedulerOutputSchema = {...schema, title: 'SchedulerDecision', $ref: '#/$defs/SchedulerDecision'};
export const schedulerInstruction = `You schedule jobs in one simulated laboratory. Use only the public observation.
Initially choose exact installed counts within room/count limits and an optional explicit layout.
Assign integer priority 0..1000 to every remaining job; larger values run first when feasible.
At rescheduling epochs choose keep or a complete physical target layout. Preserve every device model, device/arm ID and installed count. Module exchange is forbidden.
Respect committed operations and engine-owned timing. Movement, reconnection and calibration consume the published model times.
Return one SchedulerDecision matching the provided JSON schema, observation identity and epoch. Include a concise operational reason. Do not invent results, alter task data or send execution code.`;

// Provider-neutral adapter: the caller supplies a structured-output generator.
// No SDK, network request, provider name, credential or model is implicit.
export function createLLMController({generate}) {
  if (typeof generate !== 'function') throw new TypeError('A structured-output generator is required.');
  return async (observation, {signal} = {}) => generate({system: schedulerInstruction,
    observation: structuredClone(observation), output_schema: structuredClone(schedulerOutputSchema), signal});
}
