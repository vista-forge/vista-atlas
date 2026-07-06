---
name: data-release-consumption
description: How Atlas consumes the vdocs data release — bundle carrier shape, verification chain, dist/ staging, shared-module discipline
metadata:
  type: project
---

- **The vdocs release carrier is a tar.gz bundle, not standalone assets** (unlike
  vista-meta's data-v1): `rafael5/vdocs` tag `data-v1` publishes only
  `vdocs-data-v1.tar.gz` + `vdocs-data-v1.manifest.json` + `SHA256SUMS`; index.db
  and the gold tree live *inside* the bundle. Trust chain: committed record
  (`contracts/releases/vdocs-data-v1.json`) pins the bundle + manifest assets →
  the (sha-pinned) producer manifest's `files` block pins the extracted contents.
  Any future fetch/extract code must verify in that order.
- **Chunk parts overlap** (producer `split_oversized` in vdocs
  `stages/index/index_pure.py`): structural windows carry a one-block overlap,
  hard splits none. Reconstruction = `joinChunkParts` — never concatenate
  `v_chunks.text` parts directly (silent duplication).
- **Dev/test data path**: `~/data/vdocs/dist/` (override `VDOCS_DATA_HOME`) is the
  release *staging* copy — sha-verified by the integration test before use. The
  live lake `~/data/vdocs/index.db` is never opened (project rule; it has
  `-wal`/`-shm` churn from operator runs).
- **Shared-module discipline until vista-store extracts**: `src/store/{engine,
  verify,release,fetch}.ts` + `src/twinlink.ts` + `contracts/twin-link.v1.json`
  are kept **byte-identical** with vista-compass's copies — a fix in one repo
  must land in both. Atlas consuming these is the proposal-§6 trigger for the
  extraction (cross-repo, coordinator session; tracked in
  `docs/p2-atlas-mvp-tracker.md`).
- **Rich bundles gap**: data-v1 marks `rich_assets`/`rich_tables`/`history_cas`
  `excluded` — FIGURE hydration is gated on Track P-vdocs 3 (producer work).
  But **table CSV sidecars DO ship** (inside the bundle's gold tree,
  `<doc>/tables/*.csv`), so table hydration is not gated.
- **Gold markdown grammar** (measured 2026-07-05, encoded in
  `src/model/hydrate.ts` tests): table placeholder
  `_[Table N (extracted to CSV)](tables/table-NN.csv)_`; boilerplate link
  `_[<snippet> — shared boilerplate](_shared/boilerplate/bp-<id>.md)_` (em
  dash); images are bare CAS refs `![alt](<sha256>.<ext>)`, sometimes inside
  blockquotes with prose glued right after the `)`; nav chrome is standalone
  `[↑ Back to Contents](#contents)` lines; `v_documents.bundle_path` maps to
  `gold/consolidated/<bundle_path>/body.md`.
