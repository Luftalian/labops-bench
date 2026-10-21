---
name: labops-simulator
description: Implement or debug LabOpsBench discrete-event simulation of multiple instruments, fixed dispatch, queues and robot transport.
---

# Laboratory operations simulator

Read `docs/SIMULATION.md`, `docs/EVALUATION.md` and the related schema definitions from the repository root. Start with the hand-computed fixture; it is an oracle, not an implementation.

Preserve explicit instance identity and actual parallel processing. Do not model an added instrument by dividing processing time. Batch capacity is a separate mechanism and remains unsupported above one until its admission, compatibility and flushing policy exists.

Follow the documented tie-breaking, destination reservation, empty travel and exit-completion rules. Keep event generation independent of rendering. Evaluate each candidate from a clean initial state.

Test meaningful invariants: one-resource exclusion, real overlap on two devices, fixed input replay, budget/space/required-device rejection, horizon boundaries and resource release. Include a case where adding a device does not materially improve throughput. Do not assert monotonic improvement under every changed placement.

Use SimPy if practical; a simpler deterministic event engine is allowed when it preserves the agreed semantics. Keep chemistry prediction and LLM calls outside this module. Report unsupported assumptions and pass events to the viewer without inventing display-only measurements.
