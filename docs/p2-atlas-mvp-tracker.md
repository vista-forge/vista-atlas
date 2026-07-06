---
status: accepted
---

# P2 — Atlas MVP tracker

Governing design: `vista-meta/docs/proposals/vista-atlas-and-compass-de-novo.md`
(§4 Atlas surfaces, §8 sequencing). P2 = vdocs-web parity in-editor: facets,
search, reading pane with table/figure hydration. Acceptance: side-by-side
parity on 10 benchmark docs; vdocs-web frozen.

## Status

| Step | State | Notes |
|---|---|---|
| Data layer: shared store modules (engine/verify/release/fetch) | **done 2026-07-05** | byte-identical with vista-compass's P1 copies (clikit precedent) until vista-store extracts |
| vdocs data-v1 release record pinned | **done 2026-07-05** | `contracts/releases/vdocs-data-v1.json` — bundle + producer-manifest assets; inner files verify via the (itself sha-pinned) producer manifest |
| index.db contract check (`checkIndexDb`) | **done 2026-07-05** | read_schema_version 1.5 rule (same MAJOR, MINOR ≥), corpus hash, bound `v_*`/`chunks_fts` surface |
| Query layer: documents/facets/TOC/section body/FTS scopes | **done 2026-07-05** | `src/model/queries.ts`; `joinChunkParts` inverts the producer one-block-overlap chunk grammar |
| Real-release integration smoke | **done 2026-07-05** | env-gated on `~/data/vdocs/dist`; record→manifest→db sha chain verified before any query |
| Bundle fetch + extract (`vdocs-data-v1.tar.gz` → globalStorage) | todo | needs a dependency-free tar reader (bundle is the only db carrier — unlike vista-meta, index.db is not a standalone asset) |
| Twin-link handlers (Atlas side of contract v1) | todo | contract artifact + validation lib already in-repo |
| VSCode extension harness (activate, library tree, search view) | todo | model on compass's ext/ + smoke/ pattern |
| Reading pane webview (marked+DOMPurify), TOC/breadcrumbs | todo | body source: chunk reconstruction now; evaluate gold-tree file per section once bundle extract lands |
| Predecessor bug classes as regression tests (mis-nested extracted-table placeholder; nav chrome; CAS image paths) | todo | TDD-first per clean-room rule, before the hydration transforms they guard |
| Table (CSV sidecar) + figure (rich-assets) hydration | todo | rich bundles are `excluded` from data-v1 (Track P-vdocs 3 gap) — hydrate from lake-adjacent copies only behind a dev flag, or wait for the producer release |
| 10-benchmark-doc parity acceptance vs vdocs-web | todo | closes P2; freezes vdocs-web |

## Cross-repo pointer

Atlas now consumes the shared store modules — per the proposal (§6) this is
the trigger for extracting **vista-store** to a sibling repo consumed by both
twins. Until that lands (its own effort, coordinator session), the four
modules + `twinlink.ts` are kept **byte-identical** with vista-compass's; any
fix must land in both repos.
