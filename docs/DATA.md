# Data and assumptions

The published scheduler suite uses three public LeMat-Synth GitHub annotation records at revision e4bacbcbac084544ca68d48242336c2e36f6ee15. It does not use the gated Hugging Face dataset as a whole.

Eight workflow templates retain source URLs, record IDs, hashes, extraction indices, JSON pointers, original durations, equipment mappings and omitted operations in benchmark/lemat-sdl/workflows.json. The bundled raw annotations are retained for checksum verification; source availability is documented in [the record inventory](LEMAT_SOURCE_RECORDS.md).

Distinguish literature-extracted values, assumptions, synthetic fixtures and derived quantities. Literature extraction is not independent experimental validation. Missing durations and equipment capabilities are modeled assumptions. Unit-operation jobs do not represent complete chemical synthesis.

The fixed-design development fixtures are synthetic. Historical v0.1 field provenance and archived fixtures remain version-specific.

See [sources and usage conditions](SOURCES.md), [LeMat attribution](../benchmark/lemat-sdl/ATTRIBUTION.md) and [third-party notices](../THIRD_PARTY_NOTICES.md). Upstream licenses do not automatically cover the original papers, figures or unrelated assets.
