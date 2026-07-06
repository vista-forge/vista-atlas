# Vista Atlas

**Browse, search, and read the VA VistA documentation library without leaving
VSCode.** Vista Atlas puts the published VistA documentation corpus — 1,000+
manuals and guides across 100+ VistA applications, drawn from the VA Software
Document Library — into an editor tab: a faceted library, ranked full-text
search, and a section-by-section reading pane, all served locally from a
verified, read-only data release.

Vista Atlas answers *what the documentation says*. Its twin,
[Vista Compass](https://github.com/vista-forge/vista-compass), answers *what
the system measurably is* (routines, call graphs, FileMan files); the two
cross-link so you can jump between a manual and the measured artifact it
describes.

## Who it's for

- **VistA developers** — find the technical manual, developer guide, or
  installation guide for any package; search every manual's body text for a
  routine, RPC, global, option, or parameter name; keep the docs open next to
  the M code they describe.
- **VistA users and analysts** — user manuals, release notes, and
  clinical/administrative guides, filterable by who the software serves and
  who the document is written for, readable without hunting through PDFs.

## Getting started

1. Install the extension (VSCode 1.125 or later).
2. Run **Vista Atlas: Open Navigator** from the Command Palette.
3. First open downloads the documentation data release (~300 MB), verifies it
   against its published sha256 manifest, and installs it into extension
   storage. Every open after that is instant and fully offline.

If you already have a copy of the release on disk, point the
**`vistaAtlas.dataPath`** setting at it and skip the download.

## Features

### Faceted library

Filter the corpus along five axes, alone or in combination:

- **Domain** — functional category (clinical, infrastructure, financial, …)
- **Audience** — who the *document* is written for (clinical staff,
  developers, system administrators, business/fiscal, clinical-admin)
- **Type** — document genre, grouped into families: Manuals & Guides,
  Technical, Admin & Security
- **App user** — who uses the *application* the document covers
- **Namespace** — the VistA package namespace (DI, XU, OR, PSO, …)

Facet values show live document counts, re-computed as you filter (AND across
axes, OR within an axis). Hovering any value shows its definition from the
corpus vocabulary registry — namespace expansions, persona definitions, genre
names. Value lists sort by count or alphabetically; panes collapse and the
filter/results split is draggable.

### Full-text search

Ranked FTS5 search over the entire corpus, combinable with any facet
selection. Three scopes:

- **All** — document names, section headings, and full body text
- **Name** — document titles only
- **Headings** — section headings and table-of-contents entries only

### Reading pane

- Per-document, collapsible **table of contents**
- **Section-at-a-time reading** or a whole-document preview
- Clean rendered markdown: navigation chrome stripped, boilerplate resolved,
  HTML sanitized
- **Extracted tables render inline** — tables the corpus pipeline extracted
  to CSV are fetched and rendered as real tables in place, with their captions
- Every section has a **stable section ID**, so a location can be cited,
  bookmarked, and deep-linked

### Deep links and cross-extension integration

Other tools (including Vista Compass) can land the navigator on an exact
target:

- `vscode://vista-forge.vista-atlas/openDoc?doc_key=…` — open a document
- `vscode://vista-forge.vista-atlas/openSection?section_id=…` — open a
  specific section, with its document and TOC context
- `vscode://vista-forge.vista-atlas/search?query=…` — run a search

The same operations are available as VSCode commands for programmatic use:
`vistaAtlas.openDoc`, `vistaAtlas.openSection`, `vistaAtlas.search`, and
`vistaAtlas.pins` (reports the installed release tag and corpus content hash).

### Verified, local, read-only data

The corpus ships as a pinned, versioned data release: a SQLite index plus the
gold reading surface. The bundle is sha256-verified against its manifest
before installation, opened read-only, and schema-checked before serving.
Everything runs in-process on a loopback port — no external services, no
telemetry, fully offline after the one-time download. Works locally and over
Remote-SSH.

## Commands

| Command | What it does |
|---|---|
| **Vista Atlas: Open Navigator** | Open (or reveal) the navigator in an editor tab |
| **Vista Atlas: Reload Data** | Restart the session and re-verify the data release (use after changing `vistaAtlas.dataPath`) |

## Settings

| Setting | Purpose |
|---|---|
| `vistaAtlas.dataPath` | Path to a local directory containing `index.db` (an extracted release root). Empty: fetch and verify the published release bundle into extension storage. |
| `vistaAtlas.assetsDir` | Optional local directory of figure/image assets, served to the reading pane. |

## Development

```bash
make install   # dependencies + git hooks
make check     # lint + typecheck + tests with coverage + audit
make web-build # rebuild the navigator UI from web/src
npm run vsix   # package the extension
```

See [`node-dev-guide.md`](node-dev-guide.md) for the full development
practices, and `docs/` for design notes.

## License

MIT — see [LICENSE](LICENSE).
