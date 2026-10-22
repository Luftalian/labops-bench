# Third party sources and notices

LabOpsBench includes third-party code, robot geometry and derived scientific annotations. Their original terms remain in force. This file does not grant a license to the project's own code, model services, original papers, or third-party trademarks. Project-wide licensing has not been selected.

## Self-Building Labs reference

Jiaru Bai et al., *Self-Building Labs*, [arXiv:2610.23826v1](https://arxiv.org/abs/2610.23826v1), 16 October 2026, is a conceptual reference for configuring executable laboratories. Its article is CC BY 4.0. The inspected acquisition manifests and code identify no imported SBL data, code, CAD, learned skills or experimental traces. This citation does not imply an end-to-end reproduction or grant permission for separate SBL artifacts. See [the scope and bibliographic record](docs/SOURCES.md#self-building-labsとの関係).

## LeMat-Synth annotations

Source: [LeMaterial/lematerial-llm-synthesis](https://github.com/LeMaterial/lematerial-llm-synthesis), revision `e4bacbcbac084544ca68d48242336c2e36f6ee15`. Attribution: LeMaterial and the LeMat-Synth contributors; see the [LeMat-Synth paper](https://arxiv.org/abs/2510.26824v2).

The upstream repository is licensed under Apache License 2.0. An unchanged copy is included at [licenses/LeMat-Synth-APACHE-2.0.txt](licenses/LeMat-Synth-APACHE-2.0.txt). The pinned repository tree has no additional `NOTICE` file. This repository uses public GitHub annotations, not the gated Hugging Face corpus or the complete original papers.

Affected data include `benchmark/lemat-sdl/workflows.json`, `backend/poc/sim/v2/data/procedures.json`, `backend/poc/demo/workshop/data/procedures.json`, and procedure-derived fields retained in historical source snapshots and recorded tasks/results. Imported files and historical recordings remain checksum-preserved; this notice accompanies them without rewriting them.

**Changes made by this project:** selected and deduplicated extracted procedures; normalized durations to seconds; selected prepared-sample operation windows; assigned device capabilities; replaced missing times with explicitly marked assumptions; serialized some independent preparations; generated workloads, arrivals, room geometry and resource conditions. For the 14-task scheduler suite, vacuum-oven drying is mapped to an oven rather than a centrifuge. The output is a scheduling approximation, not an independently verified chemical recipe. Detailed field pointers, omissions and transformations are retained in [workflows.json](benchmark/lemat-sdl/workflows.json) and [the source inventory](docs/LEMAT_SOURCE_RECORDS.md).

Apache-2.0 for the repository is not a blanket permission to redistribute original article prose, images, PDFs or the gated corpus. The source-paper terms remain separate:

- Kun Yang, Yachun Wang, Junhua Shen, Spencer M. Scott, Brian J. Riley, John D. Vienna and Jie Lian, *Cs3Bi2I9-hydroxyapatite composite waste forms for cesium and iodine immobilization*, Journal of Advanced Ceramics 11, 712–728 (2022), [DOI](https://doi.org/10.1007/s40145-021-0565-z). © The Author(s) 2021. [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), as stated in the [publisher's rights section](https://link.springer.com/article/10.1007/s40145-021-0565-z). HA and Cs3Bi2I9 scheduling windows are selected, normalized and mapped as described above. The correspondence to the upstream hash ID is based on matching content, not an explicit upstream DOI field.
- Mansoureh Tavan, Parichehr Hanachi, Mohammad Hossein Mirjalili and Abolfazl Dashtbani-Roozbehani, *Comparative assessment of the biological activity of the green synthesized silver nanoparticles and aqueous leaf extract of Perilla frutescens (L.)*, Scientific Reports 13, 6391 (2023), [DOI](https://doi.org/10.1038/s41598-023-33625-x). © The Author(s) 2023. [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), stated on the final page of the [published article held by the author's institution](https://researchnow-admin.flinders.edu.au/ws/portalfiles/portal/150065240/Tavan_Comparative_P2023.pdf). Sonication and centrifugation windows are selected and normalized; handling and automation are project assumptions. The correspondence to the upstream hash ID is based on matching content.
- Trevor A. Petach, Apurva Mehta, Michael F. Toney and David Goldhaber-Gordon, *Crystal truncation rods from miscut surfaces* (2017), [arXiv:1706.00484](https://arxiv.org/abs/1706.00484), [journal DOI](https://doi.org/10.1103/PhysRevB.95.184104). The arXiv non-exclusive distribution license is not a license for this project to redistribute the article. LabOpsBench uses an extracted etching-operation window, not the PDF or figures. Full-text redistribution is not cleared by this notice.

The remaining imported annotation records have source URLs and hashes but have not all had their original-paper prose rights independently reviewed. See the per-record review status in [data/lemat-source-inventory.json](data/lemat-source-inventory.json). Public release of the full imported text collection requires that separate review or a derived distribution that excludes uncleared prose. Citation alone does not replace permission.

## xArm6 geometry

The seven visual STL meshes come from the manufacturer-maintained [xArm-Developer/uf-gym](https://github.com/xArm-Developer/uf-gym/tree/5d93e0419193bfed8a7cefc7bbe9b045a650f049/urdf/xarm), revision `5d93e0419193bfed8a7cefc7bbe9b045a650f049`.

Copyright (c) 2020 Quentin Gallouédec. Copyright (c) 2024 UFACTORY Inc. Licensed under MIT; the complete notice is retained at [backend/poc/sim/physics/assets/xarm6/LICENSE](backend/poc/sim/physics/assets/xarm6/LICENSE). Visual meshes are preserved unchanged. Scene positioning, materials and animation are project rendering choices. No manufacturer endorsement or real robot safety certification is implied.

The older PoC used a separate BSD-licensed `xarm_ros` base mesh for a raster footprint. That asset is historical provenance, not the seven meshes distributed by this integration.

## Three.js

Copyright © 2010–2026 three.js authors. Three.js, OrbitControls and STLLoader are distributed under MIT. The complete notice is retained at [backend/poc/demo/vendor/LICENSE-three.txt](backend/poc/demo/vendor/LICENSE-three.txt), and license headers remain in the bundled modules. The recorded-results viewer copies this notice alongside its modules.

## Instrument models and editing tools

Instrument bodies, AMR geometry, furniture and scene layouts are procedural project models. Manufacturer dimension/specification sources are listed in [docs/SOURCES.md](docs/SOURCES.md); factual dimensions are not manufacturer CAD. No manufacturer datasheet PDF is bundled with the integration. FFmpeg is used as an external local editing command; its executable and libraries are not included in the media archive. Its licensing does not grant rights to source content or trademarks.

## Model outputs and media credits

GPT Luna and Jev are accessed as hosted services; no model weights are distributed. Service terms and any account-specific agreement govern their use. Saved public output summaries and priority choices must be identified as AI-generated, and edited policy summaries must not be described as private internal reasoning or live inference. Playback multipliers do not measure inference latency.

Suggested accompanying video/README credits (keep this file with distributed source/viewer packages):

> Simulation and editing: LabOpsBench contributors. Robot geometry: xArm-Developer/uf-gym, MIT; Three.js, MIT. Scheduling inputs derived from LeMat-Synth public annotations, Apache-2.0; original-paper references and adaptation notices are listed in docs/SOURCES.md. Model decisions: saved GPT Luna / Jev outputs. Cinematic scenes are synthetic simulations.
