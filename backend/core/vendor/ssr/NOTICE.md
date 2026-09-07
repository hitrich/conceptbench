# Vendored SSR numerical kernel

`compute.py` is unmodified from pymc-labs/semantic-similarity-rating commit
`86dcd2597c7824e4fd6546b884c5500c43a4b022` (version 1.1.0).

Source: https://github.com/pymc-labs/semantic-similarity-rating

The pinned repository's LICENSE contains Apache License 2.0 and is preserved here.
Its README and package metadata say MIT; this release follows the actual license file.
Only the NumPy numerical kernel is vendored. ConceptBench supplies reviewed embeddings
and calls that kernel directly, avoiding the unrelated local transformer runtime.
Validation and degenerate-input guards live in `core/research.py`, not in upstream code.
