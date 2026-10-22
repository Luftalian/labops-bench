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
| All 50 selected trial values | [benchmark-results.json](evidence/benchmark-results.json) |
| Paper's quoted values and artifact hashes | [manuscript-validation.json](evidence/manuscript-validation.json) |
| Source records, revisions and hashes | [source-records.json](evidence/source-records.json) |
| Evaluation source and public-history mapping | [submission-provenance.json](evidence/submission-provenance.json) |
| Package checksums | [package-manifest.json](evidence/package-manifest.json) |

The paper uses 14 scenarios: three methods on ten scenarios and five on four additional challenges. The 50 distributed runs are selected recordings, not the full experimental history. The original simulation results, workflow definitions, manuscript and screenshots are preserved. Later viewer/video improvements do not change the recorded comparison.

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
