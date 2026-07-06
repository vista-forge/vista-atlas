# Vista Atlas

**The VA VistA documentation library, inside VSCode — the documentation half
of a two-extension pair.** Vista Atlas shows what the documentation *says*:
1,000+ manuals and guides across 100+ VistA applications, drawn from the VA
Software Document Library, as a faceted library, ranked full-text search,
and a section-by-section reading pane in an editor tab. Its sibling
extension, [**Vista Compass**](https://github.com/vista-forge/vista-compass),
shows what the system *measurably is* — routines, call graphs, globals,
FileMan files, RPCs — and the two cross-link: hover a routine or global in
Compass and jump straight to the manuals that document it; find a fact in a
manual and land back on the measured artifact it describes. All of it is
served locally from a verified, read-only data release — fully offline after
one download.

Atlas answers in one search what normally takes an afternoon on the VDL:

> Search `XWB REMOTE` → every manual that mentions it, ranked, filtered to
> *Technical · developers*, opened at the exact section — with a stable
> section ID you can cite, bookmark, or deep-link.

## Why a VistA developer needs this

VistA's documentation exists — decades of technical manuals, developer
guides, and installation guides — but it lives as a thousand separate PDFs
and Word documents on a VA website, **unsearchable as a whole and
disconnected from the code it describes**. In practice that means decisions
get made from memory and folklore instead of the manual that already answers
the question. Atlas closes the gap:

- **You cannot full-text search the VDL.** The official library is a
  catalog of per-document downloads; answering "which manual mentions this
  RPC / global / parameter?" means downloading and opening documents one by
  one. Atlas gives ranked FTS over every manual's body text, in one query.
- **The docs live nowhere near the code.** Reading a routine in one window
  and its technical manual in a PDF viewer in another is how context gets
  dropped. Atlas puts the manual in an editor tab beside the `.m` file —
  and, with Vista Compass installed, one click apart from it.
- **You cannot tell which document you need.** A hundred applications, each
  with user manuals, technical manuals, release notes, install guides —
  Atlas's five facet axes (domain, audience, type, app user, namespace) cut
  the corpus to the documents written for your question, with live counts
  and vocabulary definitions on hover.
- **Findings need citable locations.** "It's somewhere in the Kernel manual"
  doesn't survive a code review. Every section in Atlas has a stable section
  ID — citable, bookmarkable, deep-linkable, and the same ID the vdocs MCP
  servers and AI agents emit, so human and machine answers point at the
  same place.
- **Analysts and users need the same library.** User manuals, release
  notes, and clinical/administrative guides are filterable by who the
  software serves and who the document is written for — readable without
  hunting through PDFs.

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

Fully optional — every twin feature degrades gracefully when Vista Compass
is absent. Other tools (including Compass) can land the navigator on an
exact target:

- `vscode://vista-forge.vista-atlas/openDoc?doc_key=…` — open a document
- `vscode://vista-forge.vista-atlas/openSection?section_id=…` — open a
  specific section, with its document and TOC context
- `vscode://vista-forge.vista-atlas/search?query=…` — run a search

The same operations are available as VSCode commands for programmatic use:
`vistaAtlas.openDoc`, `vistaAtlas.openSection`, `vistaAtlas.search`, and
`vistaAtlas.pins` (reports the installed release tag and corpus content
hash — the release-pair handshake Vista Compass checks on startup).

## Commands

| Command | What it does |
|---|---|
| **Vista Atlas: Open Navigator** | Open (or reveal) the navigator in an editor tab |
| **Vista Atlas: Reload Data** | Restart the session and re-verify the data release (use after changing `vistaAtlas.dataPath`) |

## Getting started

1. Install the extension (VSCode 1.125 or later).
2. Run **Vista Atlas: Open Navigator** from the Command Palette. First open
   downloads the documentation data release (~300 MB), verifies it against
   its published sha256 manifest, and installs it into extension storage.
   Every open after that is instant and fully offline.
3. Install [Vista Compass](https://github.com/vista-forge/vista-compass) to
   light up the code cross-links.

If you already have a copy of the release on disk, point the
**`vistaAtlas.dataPath`** setting at it and skip the download.

## Settings

| Setting | Purpose |
|---|---|
| `vistaAtlas.dataPath` | Path to a local directory containing `index.db` (an extracted release root). Empty: fetch and verify the published release bundle into extension storage. |
| `vistaAtlas.assetsDir` | Optional local directory of figure/image assets, served to the reading pane. |

## The data

The corpus ships as a pinned, versioned data release: a SQLite index plus the
gold reading surface. The bundle is sha256-verified against its manifest
before installation, opened read-only, and schema-checked before serving.
Everything runs in-process on a loopback port — no external services, no
telemetry, fully offline after the one-time download. Works locally and over
Remote-SSH.

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
