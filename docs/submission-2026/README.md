# Submission paper and evidence

**[Final one-page PDF](LabOpsBench-one-page-summary-latex.pdf)**
LabOpsBench: Benchmarking AI Agents for Laboratory Configuration and Experiment Scheduling
Ryoma Yamamoto · Haruki Nakajima

| Material | Location |
| --- | --- |
| Editable manuscript, diagram and references | [latex/](latex/README.md) |
| Full-page preview | [PNG](LabOpsBench-one-page-summary-latex-preview.png) |
| Evaluation-loop figure | [PNG](LabOpsBench-evaluation-loop.png) |
| Claims and supporting sources | [Citation-review.md](Citation-review.md) |
| All 80 selected trial values | [benchmark-results.json](evidence/benchmark-results.json) |
| Paper's quoted values and artifact hashes | [manuscript-validation.json](evidence/manuscript-validation.json) |
| Source records, revisions and hashes | [source-records.json](evidence/source-records.json) |
| Evaluation source and public-history mapping | [submission-provenance.json](evidence/submission-provenance.json) |
| Package checksums | [package-manifest.json](evidence/package-manifest.json) |

The paper uses 16 scenarios with five methods each: 14 derived from public LeMat-Synth annotations and two synthetic scheduler tasks. The 80 distributed runs are selected recordings, not the full experimental history. The quoted scenario 12 and 14 runs are unchanged from the first 50-trial version; on 2026-10-22, scenarios 01-10 and the two synthetic tasks were freshly run for all five methods under the same task and configuration hashes ([selection](../LEMAT_SDL_BENCHMARK.md), [validation](../SCHEDULER_REFRESH_VALIDATION.json)). Workflow definitions and screenshots are preserved; superseded recordings remain in the repository but are not part of the comparison.

## Verify and rebuild

From the repository root, with Python's standard library:

```sh
python3 docs/submission-2026/verify_evidence.py
```

This checks recording hashes, completion, quoted values, source records, manuscript artifacts and citation keys. It performs no model calls.

For TeX Live with pdfLaTeX, Biber, newtx and TikZ:

```sh
cd docs/submission-2026/latex
latexmk -pdf -interaction=nonstopmode -halt-on-error main.tex
```

Rebuilt PDF metadata may differ while the rendered text stays the same. Update artifact hashes after intentionally changing an artifact.

[Evaluation protocol](../LEMAT_SDL_BENCHMARK.md) · [Recorded results](../LEMAT_SDL_RESULTS.md) · [Sources](../SOURCES.md) · [Third-party notices](../../THIRD_PARTY_NOTICES.md) · [Video sources](../SUBMISSION_VIDEO.md)
