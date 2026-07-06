# Vista Atlas

**A VSCode extension over the vdocs gold-corpus data release — what the VA
documentation *says*.** The de-novo successor of vdocs-web (and, with its twin, of the deleted vista-info-hub), twinned with
[vista-compass](https://github.com/vista-forge/vista-compass) (what the system
measurably *is*); the two cross-link through the vdocs↔vista-meta entity bridge.

> **Status: working extension (2026-07-05).** The governing design is the proposal
> [`vista-atlas-and-compass-de-novo.md`](https://github.com/rafael5/vista-meta/blob/main/docs/proposals/vista-atlas-and-compass-de-novo.md)
> (in vista-meta's docs). P0 done — **`node:sqlite`** in the extension host
> (VSCode ≥ 1.125, Node 24), zero native dependencies. P1 shared store consumed
> (byte-identical with vista-compass's, pending vista-store extraction). P2 in
> flight and substantially landed: pinned data-v1 release with bundle
> fetch-verify-extract, faceted library tree, scoped FTS5 search, and a
> hydrating reading surface (tables from CSV sidecars, chrome stripped, CAS
> images degrade visibly) — in-host smoke and a 10-doc benchmark sweep pass
> against the real release; `npm run vsix` builds an installable package.
> Open: webview polish, vsix release publication, the human side-by-side vs
> vdocs-web — see [`docs/p2-atlas-mvp-tracker.md`](docs/p2-atlas-mvp-tracker.md).

## What it will do

- **Library view** — faceted browse (app / section / doc-type / persona / year)
  over the published corpus (1,000+ VA manuals).
- **Search** — FTS5 ranked, pre-cited hits (stable `section_id`, gold body path).
- **Reading pane** — section-at-a-time rendering with extracted-table and figure
  hydration, boilerplate resolution, revision history.
- **Entity pages** — "every doc mentioning X", wired to `vista-compass` for the
  measured counterpart via the entity bridge.

## Data

Consumes the **vdocs `data-vN` release** (index.db + gold reading surface),
fetched and sha256-verified against its standalone manifest — never a live lake,
never the producer repo. Read access binds to the `read_schema_version`'d `v_*`
views only.

## Place in the org

Non-waterline repo: a read-only navigator over published releases — it never
touches an M engine, so it declares no `m`/`v` layer and sits outside the
waterline gates (like `clikit`). Producer: [vdocs](https://github.com/rafael5/vdocs).

## Dev

House node template: `make install` · `make check` (lint + typecheck +
coverage + audit) · see [`node-dev-guide.md`](node-dev-guide.md).
