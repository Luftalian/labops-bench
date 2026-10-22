# Runtime policies

[The agent interface](../docs/SCHEDULER_INTERFACE.md) describes observations, decisions, timing and how to run a new algorithm or model.

- policy-runtime.mjs: public decision problem, finite-candidate answer conversion and custom-policy wrapper.
- benchmark-actions.mjs: candidate menu and shared decision instructions.
- benchmark-providers.mjs: Jev typed adapter and Luna file-inbox adapter.
- llm-scheduler.mjs: provider-injected canonical structured decision interface.
- scheduler-controller.mjs: host loop, timeout and decision-boundary handling.
- scheduler_contract.py: read-only shape/reference checker.

Development AGENTS.md and skills are not contestant context. The engine owns task constraints, reservations, time and scoring. Historical PoC module-management recordings and the fixed-design evaluator remain separate modes.
