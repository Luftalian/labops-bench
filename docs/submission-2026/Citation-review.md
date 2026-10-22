# Claims and supporting sources

The final manuscript uses seven numbered scientific/data references and three inline official infrastructure links. It describes concrete initiatives without inferring worldwide adoption rates or growth in investment from a few examples.

| Source | Supported claim |
| --- | --- |
| [Tom et al., Chemical Reviews (2024)](https://doi.org/10.1021/acs.chemrev.4c00055) | SDLs combine automated experimentation with decisions informed by experimental results |
| [Boiko et al., Nature (2023)](https://doi.org/10.1038/s41586-023-06792-0) | Coscientist uses tools and executes robotic experiments |
| [Pagel et al., Communications Chemistry (2026)](https://doi.org/10.1038/s42004-026-01993-w) | ACRA translates, checks and executes literature-derived robotic workflows |
| [Arias and Taylor (2024)](https://doi.org/10.1002/admt.202400084) | Cloud laboratories provide remote access to shared experimental equipment |
| [Zhou et al., Chemical Science (2026)](https://doi.org/10.1039/D6SC03892A) | Workflow dependencies and instrument-capacity constraints motivate scheduling |
| [Lederbauer et al., LeMat-Synth, v2 (2026)](https://arxiv.org/abs/2510.26824v2) | Source dataset construction methodology |
| [LeMaterial public annotations](https://github.com/LeMaterial/lematerial-llm-synthesis/tree/e4bacbcbac084544ca68d48242336c2e36f6ee15/annotations) | The pinned public data actually adapted into the benchmark |

## Infrastructure examples

- [Acceleration Consortium](https://acceleration.utoronto.ca/news/u-of-t-receives-200-million-grant-to-support-acceleration-consortiums-self-driving-labs-research): support for SDL research and the Lash Miller facility expansion.
- [CMU/Genesis](https://www.cmu.edu/news/stories/archives/2026/july/connecting-autonomous-laboratories-to-speed-scientific-advancement): a project connecting heterogeneous autonomous laboratories. It is an initiative, not evidence that every proposed facility is complete.
- [JST ARiSE, page 8](https://www.jst.go.jp/program/arise/pdf/arise_siryo_st.pdf#page=8): concept demonstrations integrating AI agents, orchestration software and research equipment.

These examples cover facility expansion, inter-laboratory connections and integrated autonomous systems. They are not all dedicated building-construction programs.

## Project-specific evidence

The benchmark definition, 14 scenarios, 50 selected trials, model settings, three source records and eight workflow templates are supported by the repository's code, configuration and recordings. External papers do not validate LabOpsBench's particular motion model.

The compared policies choose configurations/exchanges from shared candidates and prioritize predefined jobs. The engine validates and dispatches operations and controls simulated transport. The benchmark does not evaluate scientific hypothesis generation.

Quoted values use final arm unloading as completion, convert seconds to hours and round to three decimals. Single selected trials do not establish general model superiority. See [the evidence verifier](verify_evidence.py) and [the comparison protocol](../LEMAT_SDL_BENCHMARK.md).
