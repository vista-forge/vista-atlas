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
