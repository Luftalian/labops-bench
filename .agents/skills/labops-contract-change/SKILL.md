---
name: labops-contract-change
description: Change LabOpsBench shared API, schemas, metric semantics or cross-component interfaces while keeping consumers and fixtures aligned.
---

# Shared contract changes

Read `SPEC.md`, `contracts/README.md` and the affected definition in `contracts/labops.schema.json` from the repository root. For simulation or scoring changes, read the corresponding canonical document in `docs/`.

Identify the producer, consumers, old behavior and intended new behavior. Distinguish a type change from a change in meaning. An unchanged JSON key with a different horizon or denominator is still a breaking semantic change.

Update the canonical schema and affected semantic document, then fixtures, validators and consumers in the same change. Keep frontend and runtime-agent copies generated or checked against the canonical contract; do not create independent handwritten specifications.

Record the reason and status in `docs/DECISIONS.md`. Change the appropriate schema/task/policy version when previous results become incomparable. Preserve support for existing fixtures or make the incompatibility explicit.

Run the contract checker and relevant behavioral checks. Report compatibility, consumer changes and exact validation. Ordinary implementation under an agreed contract proceeds without a new approval ritual.
