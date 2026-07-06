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
| Bundle fetch + extract (`vdocs-data-v1.tar.gz` → globalStorage) | **done 2026-07-05** | `installDataRelease` (bundle.ts): record→manifest→bundle→staged-extract→verify→atomic rename; dependency-free tar reader (tar.ts, PAX + ustar-prefix, traversal-safe), real-bundle extraction smoke green |
| Twin-link handlers (Atlas side of contract v1) | **mostly done 2026-07-05** | `openSection`/`openDoc`/`search`/`pins` commands + the vscode:// URI handler (parseDeepLink-routed) registered; `openEntity` awaits entity queries (P4) |
| VSCode extension harness (activate, library tree, search view) | **done 2026-07-05** | ext/ thin adapters over tested model (compass discipline); library tree = facets→values(+counts, vocab labels)→docs→sections; FTS quick-pick search; sections render via VSCode's own markdown preview (virtual docs) — interim surface until the hydrating webview; in-host smoke green vs real release |
| Reading pane webview (marked+DOMPurify), TOC/breadcrumbs | **hydrating interim surface done 2026-07-05** | `sectionMarkdown` now runs the full hydration chain (chrome strip → tables → boilerplate → images) over chunk-reconstructed text, with `makeGoldLoaders` reading CSV/boilerplate from the installed bundle's gold tree (measured: chunks carry 2,866 table placeholders / ~15k chrome lines / 245 boilerplate links, so the chain applies without gold slicing). A dedicated webview (custom TOC/breadcrumbs, richer styling) remains optional polish |
| Predecessor bug classes as regression tests (mis-nested extracted-table placeholder; nav chrome; CAS image paths) | **done 2026-07-05** | `src/model/hydrate.ts`, red-first: blockquote-nested placeholder hydrates without collapsing (THE bug), unresolved CAS refs degrade to visible notes, nav chrome strips; chain proven on the real PXRM gold bundle |
| Table (CSV sidecar) + figure (rich-assets) hydration | **tables done / figures gated** | CSV sidecars ship in the bundle and hydrate to pipe tables (real-corpus test green); figure hydration still gated on rich-assets joining the release (Track P-vdocs 3) — until then `rewriteImages` degrades visibly |
| 10-benchmark-doc parity acceptance vs vdocs-web | **automated core done 2026-07-05; human side-by-side open** | `src/store/benchmark.test.ts` (opt-in `ATLAS_BENCHMARK=1`): 10 docs across CLI/INF/FIN — resolve, TOC-complete vs `section_count`, all ~4k sections render chrome-free with citations, app-filtered search finds each. PASS on data-v1. The visual side-by-side + the vdocs-web freeze decision remain the owner's call |
| vsix packaging | **done 2026-07-05** | `.vscodeignore` strategy (npm `files` dropped — vsce forbids both); `npm run vsix` → 19 KB `vista-atlas-0.1.0.vsix` (bundle + contracts only). GitHub-release publication still to do |

## Producer gaps discovered (for Track P-vdocs)

- **`chunks(section_id)` is unindexed in index.db** (query plan: `SCAN chunks`,
  ~36 ms per section body). vdocs-web only reconstructed whole docs, so
  section-at-a-time was never a proven query shape; Atlas's reading pane makes
  it one. Producer should add the index (the vdocs analog of what vista-meta
  did for `xindex_tags` on 2026-07-05). Consumer impact today: one section
  open ≈ 36 ms (tolerable interactively); the benchmark sweep runs ~2.5 min.

## Cross-repo pointer

Atlas now consumes the shared store modules — per the proposal (§6) this is
the trigger for extracting **vista-store** to a sibling repo consumed by both
twins. Until that lands (its own effort, coordinator session), the four
modules + `twinlink.ts` are kept **byte-identical** with vista-compass's; any
fix must land in both repos.
