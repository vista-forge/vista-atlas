# Vista Atlas

**A VSCode extension over the vdocs gold-corpus data release — what the VA
documentation *says*.** The de-novo successor of vdocs-web (and, with its twin, of the deleted vista-info-hub), twinned with
[vista-compass](https://github.com/vista-forge/vista-compass) (what the system
measurably *is*); the two cross-link through the vdocs↔vista-meta entity bridge.

> **Status: the vdocs-web carbon copy, working (2026-07-05).** The governing
> design is the proposal
> [`vista-atlas-and-compass-de-novo.md`](https://github.com/rafael5/vista-meta/blob/main/docs/proposals/vista-atlas-and-compass-de-novo.md)
> (in vista-meta's docs), **course-corrected by the owner**: Atlas is the
> vdocs-web experience in an editor tab — the full faceted-search SPA
> (vendored verbatim in `web/static/`) served by an in-process `node:http` +
> **`node:sqlite`** server (`src/server/`, a 1:1 TS port of vdocs-web's Go
> query/API layer) and framed full-bleed in a webview panel
> (**Vista Atlas: Open Navigator**). Data: the pinned data-v1 release, bundle
> fetch-verify-extract into global storage. In-host smoke drives the real
> thing; `npm run vsix` packages it (88 KB). Open: SPA deep-link navigation
> for twin-link payloads, vsix release publication — see
> [`docs/p2-atlas-mvp-tracker.md`](docs/p2-atlas-mvp-tracker.md).

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
