# Build the one-page summary

Use TeX Live with pdfLaTeX, Biber, newtx, biblatex and TikZ:

```sh
latexmk -pdf -interaction=nonstopmode -halt-on-error main.tex
```

For Overleaf, upload this directory, choose main.tex and pdfLaTeX, and use Biber for the bibliography.

- main.tex: text, layout, captions and citations.
- protocol-figure.tex: editable vector evaluation loop.
- references.bib: seven scientific/data references.
- assets/lab-runtime-angle.jpg: scenario 12, GPT Luna, 12,596.022 simulation seconds, two-bay cell.
- assets/lab-runtime-large.png: scenario 03 v2, GPT Luna, 1,089.706 simulation seconds; 32 instruments, 32 arms, eight AMRs and 64 jobs in a 32×24 m room.

The images are two independent example scenarios, not successive layouts within one run. They show saved simulated execution, not physical laboratory validation or fresh inference. Scenario 03 begins with prepared samples in local buffers.

The large screenshot is a 1275×717 UI capture, cropped by TikZ to x=190..710 and y=175..475. Capture used temporary display-only changes to catalog loading, refresh rate and shadows; source results were unchanged. Its recorded result is:

benchmark/published/recordings/2026-10-21T16-09-37.772Z-gpt-6-luna-medium-24a0cb5a/lemat-sdl-03-many-arms/result.json.gz

Decompressed SHA-256: 8a22c3867a2daadf9d8849dcc87c1675b0707c3959cdd7b3f293739384230ff8.

This recording belongs to the first 50-trial selection and remains in the repository. The refreshed 80-trial comparison uses run 2026-10-22T11-41-27.612Z-gpt-6-luna-medium-e86af7cf for scenario 03, with the same makespan (7,249.935 simulation seconds).

The PDF is A4, one page, with 10 pt body text and a vector observation–decision–execution loop. The evaluated component includes algorithms and heuristics as well as AI agents. Numeric examples are converted from recorded seconds to hours, rounded to three decimals.

See [citation support](../Citation-review.md), [source and result evidence](../README.md), and [the protocol](../../LEMAT_SDL_BENCHMARK.md).
