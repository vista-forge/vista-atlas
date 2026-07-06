# Build log — vista-atlas

Chronological narrative of *why* the project got to its current shape.
Complements `git log` (which captures *what* per-commit) with rationale,
trade-offs, things tried and reverted, and explicit deferrals.

Update this whenever you land something non-trivial, before pushing.
`make log MSG="..."` appends a dated stub. Keep entries small — one
per landed change beats a monthly retrospective.

## How to read this log

Format conventions:

- Newest entries at the **bottom**. The chronological top-to-bottom
  flow tells the story of the project.
- Each entry: a `## YYYY-MM-DD — short title` heading.
- Useful sub-sections per entry:
  - **Done** — what shipped
  - **Tried and reverted** — approaches abandoned, with the reason
  - **Deferred** — things known-needed but consciously skipped
  - **Smoke results** — coverage %, perf number, or whatever metric
    the project gates on

The log is for *humans reading the project later*, including you in
six months. Don't summarise diffs — the diff is the diff. Focus on
*reasoning that isn't obvious from reading the code*.

---

## 2026-XX-XX — initial scaffold from ~/claude/templates/node

**Done:**

- Bootstrapped from the Node template.
- Working `greet()` with table-driven tests in `src/index.test.ts`.
- CI green on Node 22 + Node 24.

**Deferred:**

- (replace this section with real deferrals as the project grows)

## 2026-07-05 — P2 start: Atlas data layer over the pinned data-v1 release

**Done:**

- Shared store modules (`engine`/`verify`/`release`/`fetch` + `twinlink` and
  `contracts/twin-link.v1.json`) brought over from vista-compass's P1,
  **byte-identical** (verified by diff) — the clikit precedent, until
  vista-store extracts to a sibling repo. Only `release.test.ts`'s
  committed-record block differs (it tests *this* repo's record).
- `contracts/releases/vdocs-data-v1.json`: pinned release record. Key
  difference from the vista-meta release: **index.db is not a standalone
  asset** — it ships inside `vdocs-data-v1.tar.gz` (98 MB), so the record
  pins the bundle + the producer manifest, and the manifest (itself
  sha-pinned) carries the inner-file pins for post-extract verification.
- `checkIndexDb` (TDD): meta pins (`read_schema_version` per ADR 0001 —
  same MAJOR, MINOR ≥ required; `corpus_content_hash`) + the bound
  contract surface (6 `v_*` views' columns + `chunks_fts`).
- Query layer (TDD, fixture db mirroring the real shapes):
  `listDocuments`/`facetCounts`/`getDocument`/`listSections`/`sectionText`/
  `searchChunks` (FTS5, proposal scopes name/headings/all, bm25 +
  `snippet(-1)`), `escapeFtsQuery` (metacharacter-safe).
- **`joinChunkParts`** — the increment's real find: consecutive `v_chunks`
  parts *overlap* (producer `split_oversized`: windows are "\n\n"-joined
  blocks, the last block of each window repeats as the first block of the
  next; hard line/char splits have no overlap). Naive concatenation
  silently duplicates the overlap block — encoded as failing tests first,
  per the clean-room bug-class rule; reconstruction drops a leading block
  the accumulated text already ends with, else joins with "\n".
- Integration smoke (env-gated on `~/data/vdocs/dist`, skips in CI): the
  full trust chain — committed record → producer manifest sha → index.db
  sha (322 MB, streamed) → contract check → spike queries through the
  query layer (kaajee FTS, doc resolve, section reconstruct, app facet).
  ~0.6 s total.

**Smoke results:** 123 tests, statements 98.4% / branch 92.7% / funcs
100%; `make check` fully green; real-db integration PASS.

**Deferred:**

- Bundle fetch + tar extract (needs a dependency-free tar reader) — the
  install-from-GitHub path; dev runs use the verified `dist/` staging copy.
- Reading-pane body source decision: chunk reconstruction works, but the
  extracted gold tree may be the higher-fidelity section source once the
  bundle lands locally — evaluate before building the webview.
- vista-store extraction to a sibling repo (cross-repo; coordinator
  session) — Atlas consuming the modules is the proposal's trigger.
- Entity queries (P4 surface) — views are contract-checked but unqueried.

## 2026-07-05 — bundle install path: tar extractor + installDataRelease

**Done:**

- `tar.ts`: dependency-free streaming tar.gz extractor — exactly the
  dialect the producer emits (Python tarfile PAX default: file-only
  entries, ustar prefix splits, PAX `path` overrides) and hardened
  against hostile archives (absolute/`..` paths, link entries,
  corrupt checksums all reject; TDD'd via a hand-assembled tar-bytes
  fixture builder so every dialect + attack case is explicit).
- `manifest.ts`: producer-manifest parser (defensive; it's a fetched
  artifact, not a committed one).
- `bundle.ts` `installDataRelease`: the full chain — ensure manifest
  asset → corpus-hash drift check vs the committed record → ensure
  bundle asset → extract to a staging dir → verify every
  manifest-pinned inner file → atomic rename into place. Idempotent:
  a verified install makes no network request; a failed hop leaves no
  partial install.
- Real-bundle integration smoke: the extractor runs against the actual
  98 MB release tar.gz (filtered to the small pinned gold sidecars, so
  no 322 MB write) and every extracted file sha-verifies. ~2.2 s.

**Smoke results:** 156 tests, statements 97.9% / funcs 100%;
`make check` green; real-bundle extraction PASS.

**Deferred:**

- Wiring `installDataRelease` to the extension's globalStorage +
  a first-run progress UI — lands with the extension harness.
- The extracted gold tree as the reading-pane body source (vs chunk
  reconstruction) — decide when the webview work starts.

## 2026-07-05 — extension harness: library tree, search, interim reading surface

**Done:**

- package.json grew the extension identity (publisher vista-forge,
  `main` → esbuild-bundled `dist/extension.cjs`, `engines.vscode ^1.125`,
  contributes: explorer view + search/refresh/reload commands +
  dataPath/docLimit settings); `make check` now also proves the bundle
  builds. Dev deps: @types/vscode, @vscode/test-electron, vsce, esbuild.
- Model layer first, TDD (the compass discipline — ext/ only builds
  TreeItems): `library.ts` (facet dimensions → values with counts +
  vocab labels → documents → sections), `reading.ts` (section as a
  titled markdown page ending in its own `vdocs://section/<id>`
  citation line — §3.5 citation discipline), `getSection`/`vocabLabels`
  queries.
- `ext/`: activation acquires the release (dataPath override for dev,
  else `installDataRelease` into globalStorage with progress), opens
  read-only, contract-checks (warns on mismatch), badges the view with
  `data-v1 · <hash8>`. Library tree, FTS quick-pick search,
  twin-link commands (`openSection`/`openDoc`/`search`/`pins`) and the
  vscode:// URI handler routed through the contract's parseDeepLink.
- **Interim reading surface decision:** sections render as virtual
  markdown documents through VSCode's own preview — zero webview code,
  zero sanitizer surface, and gold-body markdown is already
  preview-friendly. The hydrating webview (tables/figures/boilerplate)
  stays on the tracker as the real P2 reading pane; this makes Atlas
  *usable* today.
- In-host smoke (compass's run.ts/suite.ts pattern, installed VSCode,
  settings → the verified dist/ staging copy): activation, a real
  section renders with citation line, twin-link commands answer.
  PASS on VSCode 1.125 / Node 24 host.

**Smoke results:** 177 unit tests, statements 98.2%; `make check`
(incl. bundle) green; `npm run test:vscode` PASS.

**Deferred:**

- `openEntity` handler — awaits entity queries (P4).
- Hydrating reading-pane webview + the predecessor bug-class transforms
  (mis-nested table placeholder, nav chrome, CAS image paths).
- vsix packaging + GitHub release of the extension.

## 2026-07-05 — hydration transforms: the predecessor bug classes, red-first

**Done:**

- `src/model/hydrate.ts` — the reading pane's engine as pure
  (text, loader) functions, every predecessor bug class encoded as a
  failing test before the code existed (clean-room principle 8):
  - **mis-nested table placeholder** (THE vdocs-web bug that silently
    collapsed tables): the italic `Table N (extracted to CSV)` link to
    its `tables/…csv` sidecar
    hydrates into a pipe table; a blockquote-nested placeholder keeps
    every generated row inside the quote; a missing sidecar keeps the
    visible link. Nothing is ever dropped.
  - **CAS image paths**: `![alt](<sha256>.<ext>)` rewrites through a
    resolver; unresolved refs become a visible "figure unavailable"
    note, never a broken image (rich-assets are still excluded from
    data-v1).
  - **nav chrome**: standalone `↑ Back to Contents` self-link lines
    strip (P-vdocs 2 consumer workaround); inline mentions survive.
  - plus `splitFrontmatter`, a minimal CSV parser (quoted fields, ""
    escapes, CRLF), `csvToMarkdownTable` (pipe-escaped, row-capped),
    and `hydrateBoilerplate` (`_shared/boilerplate` links inline as
    attributed quotes; unavailable → link kept).
- Real-corpus validation folded into the bundle integration test: the
  PXRM user-manual gold bundle extracts from the actual release
  tar.gz, its frontmatter splits, chrome strips, a real CSV sidecar
  becomes a pipe table, and every CAS ref degrades visibly.

**Smoke results:** 212 tests, statements 98.0%; `make check` green;
real-corpus hydration chain PASS.

**Deferred:**

- Wiring the transforms into the reading surface (gold body.md via
  `bundle_path` + webview or enriched virtual markdown) — next.
- Figure hydration proper — gated on rich-assets joining the release.

## 2026-07-05 — reading surface hydrates: transforms wired end-to-end

**Done:**

- Measured first: the FTS chunks carry the constructs (2,866 table
  placeholders, ~15k chrome lines, 245 boilerplate links, 1,048 image
  refs across `v_chunks`), so the hydration chain applies directly to
  chunk-reconstructed section text — no gold body slicing needed for
  the interim surface.
- `sectionMarkdown` now runs the full chain: chrome strip always;
  tables + boilerplate hydrate through injectable `HydrationLoaders`;
  CAS images resolve or degrade visibly. `makeGoldLoaders(goldRoot)`
  supplies real loaders from the installed bundle's gold tree
  (traversal-guarded, `_shared/`-scoped; corpus text is untrusted
  input).
- `bundle_path` joined the bound contract surface + `DocumentDetail`
  (it keys doc-bundle sidecar loads).
- Extension wiring: after data acquisition, a `gold/` directory next
  to index.db (the installed-bundle layout) activates the loaders; a
  bare-db dataPath (e.g. the dist staging copy) degrades gracefully to
  links + notes. In-host smoke still green.

**Smoke results:** 222 tests, statements 97.9%; `make check` green;
`test:vscode` PASS.

**Deferred:**

- A dedicated webview reading pane (custom TOC, styling) — optional
  polish now that the preview surface hydrates.
- Figure hydration proper — still gated on rich-assets joining the
  release (Track P-vdocs 3).

## 2026-07-05 — vsix packaging + the P2 benchmark sweep

**Done:**

- **vsix**: `.vscodeignore` whitelist strategy (the npm `files` field
  had to go — vsce refuses both); `npm run vsix` produces a 19 KB
  `vista-atlas-0.1.0.vsix` carrying exactly the runtime payload
  (esbuild bundle + the two contract artifacts + README/LICENSE).
- **Benchmark sweep** (`src/store/benchmark.test.ts`, opt-in via
  `ATLAS_BENCHMARK=1`): the automated core of the §8 P2 acceptance.
  Ten documents across clinical/infrastructure/financial apps and
  doc types (FileMan DG, Kernel TM, Broker DG, CPRS UM, Reminders MM,
  Lab TM, Pharmacy UM, TIU TM, Health Summary UM, VBECS UG): each
  resolves, lists a TOC exactly matching its declared section_count,
  renders every section (~4k total) chrome-free with its citation
  line, and is found by app-filtered search. **PASS** against the
  real data-v1 release.
- **Producer gap found and recorded**: index.db has no
  `chunks(section_id)` index — every section body is a table SCAN
  (~36 ms). vdocs-web reconstructed whole docs, so the per-section
  shape was never proven; Atlas makes it one. Filed in the tracker as
  a Track P-vdocs item; the sweep is opt-in until the producer ships
  the index.

**Smoke results:** 222 tests + gated sweep PASS (141 s when opted
in); `make check` green; vsix builds clean.

**Deferred:**

- GitHub-release publication of the vsix.
- The human side-by-side vs vdocs-web + the freeze decision (owner).

## 2026-07-05 — COURSE CORRECTION: the vdocs-web carbon copy

**Why:** the owner rejected the native-VSCode surface ("completely
utterly wrong") — the target is the vdocs-web experience itself: the
full faceted-search SPA in a browser-style editor tab, replicated
from its code (clean-room rule amended in CLAUDE.md; code reference
authorized).

**Done:**

- **Vendored the SPA verbatim**: vdocs-web's built frontend
  (internal/web/static, 15 files) → `web/static/`, served byte-for-
  byte; the SvelteKit source + configs → `web/` for future rebuilds.
- **Ported the entire server surface to TS** (`src/server/`), test-
  first against the Go reference's own test cases:
  - `filter.ts` — the Filter→WHERE builder: 10-axis whitelist
    (injection-proof), OR-within/AND-across, axis relaxation,
    doc-level FTS subquery, FTS sanitization + name/headings scopes.
  - `title.ts` — CleanTitle version/patch de-noising, all 13
    reference cases passing verbatim.
  - `core.ts` — facets/candidates/vocab/TOC/section/preview/
    bundlePath with the reference semantics: latest-only, cleaned
    display titles, TOC kind filter, **`#table-` search-only chunks
    excluded from bodies** (the double-render class — my earlier
    reading surface had this bug; now encoded in tests) and **chunk
    overlap deduped** (an improvement over the reference, which
    double-rendered the producer's one-block window overlap).
  - `http.ts` — the nine /api routes with PascalCase wire shapes the
    SPA expects, %2F-encoded doc keys, table/asset routes
    (traversal-guarded), static SPA serving with MIME + app-shell
    fallback, loopback-only ephemeral port.
- **Extension rewritten around the panel**: `vistaAtlas.open` →
  acquire release → contract check → in-process server →
  full-bleed iframe via asExternalUri + portMapping (the predecessor
  extension's exact pattern). Native tree/search/preview surfaces
  removed; twin-link commands route to the navigator; reloadData
  restarts the session.
- vsix now ships the SPA (88 KB, 23 files).

**Smoke results:** 294 unit tests (33 filter/title reference ports,
13 core, 17 http) + gated benchmark; `make check` green; in-host
smoke drives the real thing — navigator opens, SPA shell serves,
facets (75+ apps) and kaajee candidates answer over the verified
release.

**Deferred:**

- SPA deep-link navigation for twin-link payloads (openSection
  currently opens the navigator; targeted navigation needs SPA URL
  state).
- `make web-build` wiring to rebuild `web/static` from the vendored
  Svelte source.
- Whether the now-unused model libs (library/reading/gold/hydrate)
  stay as package exports or get retired — owner's call.

## 2026-07-06

web-build wired: svelte.config.js retargeted to web/static (assets-input remapped to assets/), kit.version.name pinned for deterministic rebuilds (default Date.now() dirtied every rebuild), Makefile web-install/web-build/web-test/web-check, @types/jsdom added (svelte-check was red), SETUP.md rewritten for the Atlas layout. Rebuild verified byte-deterministic; root make check green.
