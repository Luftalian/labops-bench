# Codex GPT-6 Luna shared-hall trial

The requested model was launched as a Codex managed subagent with model override gpt-6-luna, medium reasoning, and no inherited conversation. The installed standalone Codex CLI exited with code 137 even for help, so no CLI inference was claimed. This is one hybrid trial on 24 synthetic mixed-screening jobs (seed 17), not a general model ranking.

## Control boundary

Luna chose one module exchange or hold every 600 simulated seconds. Initial placement came from the existing feasibility heuristic. Admission, route assignment, compatible batch dispatch, transport and event progression used the fixed deterministic executor. No reference reconfiguration decisions were substituted for model output. Public summaries included installed/stock module counts, available stations, commitment-based eligibility and visible demand (one-hour horizon). The reference sees the full public observation; Luna received a compact summary, so information representation differs.

The agent was instructed not to inspect source, private state or hidden future jobs. This is a trusted-agent harness, not an OS-isolated evaluation. Model selection is evidenced by the parent Codex agent launch configuration; service-side resolved snapshot and token usage are not exposed by that tool. No API-key inference was used.

## Observed result

| Manager | Completed | Simulated minutes | Exchanges | Invalid actions |
|---|---:|---:|---:|---:|
| codex-luna-manager | 24/24 | 98.7 | 7 | 0 |
| fixed-cadenced | 24/24 | 108.6 | 0 | 0 |
| adaptive-cadenced | 24/24 | 79.8 | 1 | 0 |

All three use the same configuration/workload hashes, initial layout, 600-second manager cadence and fixed executor. Luna made 10 management decisions. It finished faster than the fixed configuration and slower than the demand-aware reference in this single case. Frequent changes and temporary removal of the last grinder are possible explanations for the slower result; the comparison does not isolate their causal contributions. Original decisions are retained, including the removal at 2,400 s and restoration at 3,000 s.

| Time (min) | Decision | Justification |
|---:|---|---|
| 0 | flex_press-1 → stirrer | Press has no visible pending or future work; add capacity to the busiest visible stirring queue. |
| 10 | flex_grinder-2 → filter | Visible filter work is heavily queued while four grinders have only three pending operations; add a filter station. |
| 20 | flex_grinder-3 → sonicator | Six visible sonication operations leave a 1,800-second queue on one station; three grinders remain for the visible grinding queue. |
| 30 | flex_grinder-4 → centrifuge | Eleven visible centrifugation operations remain on one station, while only two grinding operations remain across two grinders. |
| 40 | flex_grinder-1 → stirrer | Stirring has the largest remaining per-station queue; keep one grinder for its remaining visible operation. |
| 50 | flex_grinder-4 → grinder | One visible grinding operation remains and there are no grinders; restore the final grinder while retaining the other centrifuge station. |
| 60 | hold | All flexible stations are still occupied; allow queued work to progress until a justified exchange becomes available. |
| 70 | hold | Visible workloads still occupy all flexible stations; continue processing before changing shared modules. |
| 80 | flex_grinder-4 → centrifuge | No grinding work remains; add a second centrifuge to its two-operation queue while retaining all active capabilities. |
| 90 | hold | Only one centrifugation and one filtration operation remain; a 360-second setup would exceed the visible 120-second process totals. |

## Evidence and validation

- Raw trial, manifest, every public observation/action/receipt: results/v4/codex-luna-screening-2026-10-21/.
- Parent launch configuration and prompt hash: parent-evidence.json in that folder; [manager prompt](luna-controller-prompt.txt).
- [Matched comparison](../results/v4/luna-evaluation.json). This contains no previous independent-campus LLM run.
- The original comparison replayed every saved Luna action before running matched references. After the simulator upgrade, verify the original trial with node scripts/verify-luna-replay.mjs; it imports the checksum-verified source-snapshot and asserts exact trace equality. The historical comparison is retained without recomputing it under a different simulator.
- results/v4/validation/codex-luna/raw-audit.json: three recorded episodes / 240 operations, geometry, precedence, calendars, finite stocks/buffers, compatibility and source/result hashes.
- continuous-separation.json independently checks the declared piecewise-linear AMR trajectories. These validate software invariants, not chemical or robot safety.

## Viewer and playback

Open [Luna directly](http://127.0.0.1:4173/?replay=luna) or choose Recorded runs → GPT-6 Luna. The viewer offers the recorded Luna trial in the manager selector, shows model decisions separately in the feed, and labels the rule-executor boundary. Recorded trial parameters are locked while selected. Replaying does not invoke any model. Selecting a rule manager enables editable scenarios and fresh simulation. Benchmark report shows the matching three-manager comparison for the Luna replay.

Playback adds 2×, 4× and 8× realtime, adds 1 hour per 2/4/8 seconds for episode overview (default: 1 hour / 8 s), and retains 1 hour/s and 1 day/s. Adaptive activity pace remains optional and explicitly skips idle time.

Official documentation consulted for the attempted CLI route: [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode) (structured output, event logs and saved authentication). The successful trial used the desktop-managed subagent rather than that failed CLI route.
