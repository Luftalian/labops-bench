# Simulation data and geometry provenance

## Structured procedures

`demo/data/raw/` preserves three unmodified public LeMat-Synth annotation files at commit `e4bacbcbac084544ca68d48242336c2e36f6ee15`:

- `1409.1070`: Cu3Nb2O8, ordered mixing/pressing and 36 h / 40 h sintering.
- `1605.04038`: two PLD thin-film procedures.
- `2502.03121`: MoSe2, MBE operations followed by manual polishing as represented in the extraction. The 1 h annealing duration is retained. Missing durations are assumptions.

The first nonempty extraction in each file is selected. These are model extractions with potential errors, not independently verified paper ground truth. Procedures and conditions remain intact in `demo/data/procedures.json`, with source model, file, index and SHA-256. The gated Hugging Face dataset has not been fetched.

`node scripts/prepare-data.mjs` regenerates these records. Stage-to-device mapping examines equipment names, so a press labelled `mix` is not sent to a mixer, and MBE is not sent to PLD. Automated execution of manual operations is an unvalidated capability assumption.

## Actual manufacturer geometry

`raw/xarm6-base.stl` is the manufacturer robot-base mesh from [xarm_ros](https://github.com/xArm-Developer/xarm_ros) at commit `cf51617d98bc55a88d9aa735acfa43a0bbb8e425`. The corresponding robot description and BSD-style license are saved beside it. `node scripts/prepare-geometry.mjs` reads every binary STL vertex, computes axis-aligned bounds and rounds X/Y extent upward to the 0.25 m grid.

The mesh extent is about 0.15524 × 0.12600 × 0.15480 m, producing a 1 × 1-cell raster footprint. This is the base mesh, not the complete arm envelope. The manufacturer's [xArm specification](https://www.ufactory.cc/xarm-collaborative-robot/) provides 0.7 m reach. The reserved 1 × 1 m square and 2D reach circle are modeling assumptions; full-link collision and inverse-kinematics checks are now performed separately using the complete official model in [../physics/](../physics/README.md).

## Explicit assumptions

Furnace dimensions are 0.41 × 0.42 × 0.58 m from the ELF 11/6 manufacturer datasheet, rounded upward to the grid. The original datasheet is `raw/elf-product-data-sheet.pdf`, hash-pinned in `source-manifest.json`. This supplies bounding dimensions, not furnace CAD or an automation design. Other instrument bodies are assumed surrogates. Missing durations, handling speed, load/unload duration, setup time, inventory, arrivals and module compatibility are recorded in `catalog.json` and each benchmark task. Future CAD import can replace instrument dimensions using the same rasterization path, after validating units and access ports.

Only idle, unreserved preparation/press modules may be exchanged. Furnace/PLD/MBE/XRD infrastructure is fixed after installation. Setup consumes a cell's robot. Unattended heating retains its furnace and releases the robot. Devices remain single-sample; ramp/cooldown are modeled with uncalibrated scenario parameters; cleaning, gases, batch compatibility, sample lifetime and storage limits remain unmodeled.

## Related primary sources

- Bai et al. (2026), [Self-Building Labs](https://arxiv.org/abs/2610.23826v1).
- [LeMat-Synth repository](https://github.com/LeMaterial/lematerial-llm-synthesis).
- [UFACTORY specification](https://www.ufactory.cc/xarm-collaborative-robot/).

Source material is kept distinct from our implementation and assumptions. Source acquisition and reproduction commands appear in the project README.
