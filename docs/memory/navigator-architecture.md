---
name: navigator-architecture
description: The carbon-copy architecture — vendored vdocs-web SPA + in-process TS port of its server; clean-room rule amended
metadata:
  type: project
---

- **Owner redirect (2026-07-05):** Atlas IS the vdocs-web experience in an
  editor tab — the faceted-search SPA in a full-bleed webview iframe. The
  original clean-room rule was **rescinded for vdocs-web** (recorded in
  `CLAUDE.md`): its code is an authorized reference. Native VSCode surfaces
  (tree views, quick-picks, markdown previews) are the wrong direction for
  this repo's UX — don't rebuild them.
- **Architecture:** `web/static/` = vdocs-web's built SPA, served verbatim;
  `src/server/` = 1:1 TS port of its Go query/API layer (filter.go →
  filter.ts, title.go → title.ts, index.go → core.ts, server.go → http.ts)
  over the node:sqlite store; the extension starts the server in-process on
  a loopback ephemeral port and frames `asExternalUri(url)` with panel
  `portMapping` (works over Remote-SSH). No Go sidecar.
- **Keep the port faithful:** the SPA depends on PascalCase wire fields
  (mirrors of the Go structs), `%2F`-encoded doc keys as single path
  segments, `{text}` bodies, and `/api/asset` + `/api/table` for figures/CSV
  grids. Any server change must keep `web/src/lib/api.ts` (vendored) happy.
- **Two reference bugs are now regression-locked in `src/server/core.ts`
  tests:** `#table-` search-only chunks must never enter reconstructed
  bodies (double-render), and the producer's one-block chunk overlap is
  deduped (the Go reference double-rendered it — our one deliberate
  improvement).
- **UI changes** happen in the vendored Svelte source (`web/src/`), then
  `make web-build` into `web/static/` (wired 2026-07-06) — never hand-edit the
  built assets. The build is **deterministic** (`kit.version.name` pinned in
  `svelte.config.js` — the SvelteKit default is `Date.now()`, which dirties
  every rebuild); an unchanged tree rebuilds byte-identically, so a dirty
  `web/static` after web-build means the source really changed. `static/` is
  the *output* here, so the SvelteKit assets-*input* dir is remapped to
  `assets/` in `svelte.config.js` — don't put source static files in
  `web/static/`.
- **Deep-link grammar (Atlas addition, 2026-07-06):** the SPA reads initial
  state from URL params — `?doc=<DocKey>`, `?section=<section_id>`, `?q=` +
  `?scope=`, plus the five *displayed* facet axes (`web/src/lib/deeplink.ts`
  ⟷ `src/server/link.ts`, kept aligned by their tests). Two invariants: the
  `section` param deliberately shadows the API's undisplayed `section` facet
  axis, and the SPA **ignores `?section` without `?doc`** — the extension
  resolves section→doc via `getSection` before building the URL and reloads
  the iframe (`withLinkQuery` preserves asExternalUri tunnel tokens). The
  observable seam is the `framedUrl` the commands return; the in-host smoke
  asserts on it.
