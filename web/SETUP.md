# Atlas front-end — the vendored vdocs-web SPA (SvelteKit, pinned, repo-owned)

The **SvelteKit** SPA (Svelte 5) vendored from vdocs-web (owner direction 2026-07-05), building to
static assets in `./static/`, which the extension's in-process navigator serves
(`src/server/http.ts`) — this repo's analog of vdocs-web's `go:embed`. **Node is build-time only**
for the SPA — the vsix ships the built output, never this source tree. Follows the house Node
standard (npm; see `~/.claude/CLAUDE.md`), with one justified deviation: SvelteKit uses **Vite**
(not `tsc`) and its own check, since it's an app, not a publishable library.

## What's pinned (reproducible on any machine)

| Layer | Pinned by |
|---|---|
| Node version | `../.node-version` (`22`) + `engines.node` in `package.json` (read by nvm via direnv) |
| Every dependency (exact) | the committed **`package-lock.json`** |
| Build output | committed in `./static/` so the extension + vsix need **no** SvelteKit toolchain |
| Build determinism | `kit.version.name` pinned in `svelte.config.js` (default is `Date.now()`, which dirties every rebuild) |

## Work on it

```bash
make web-install              # npm ci — exact tree from package-lock.json (run from repo root)
make web-test                 # node:test over web/src/lib/*.test.ts
make web-check                # svelte-kit sync + svelte-check
```

There is no wired dev-server loop yet: `npm run dev` (in `web/`) proxies `/api` to `:8765`
(`vite.config.ts`), a vdocs-web inheritance — the Atlas navigator binds an ephemeral loopback port
instead. For UI iteration, rebuild + reload the extension, or point the proxy at a running
navigator's printed port.

## Build (when the UI changes)

```bash
make web-build                # vite build → web/static (adapter-static SPA)
git add web/                  # commit BOTH the source and the built output
```

The built output is committed on purpose: it keeps the extension + `npm run vsix` working without a
SvelteKit toolchain (CI, fresh checkout). Regenerate it with `make web-build` whenever `web/src`
changes — the build is deterministic, so an unchanged source tree rebuilds byte-identically.

## Layout

- `web/src/routes/+page.svelte` — the faceted browser (Svelte 5 runes).
- `web/src/lib/api.ts` — typed client for `/api/facets`, `/api/candidates`, `/api/meta`.
- `web/src/routes/+layout.ts` — `ssr=false`, `prerender=false` (pure SPA; data is runtime).
- `web/svelte.config.js` — `adapter-static` → `./static`, SPA `fallback: index.html`; the
  SvelteKit *assets-input* dir is remapped to `assets/` (unused) because `static/` is the output here.
- `web/vite.config.ts` — dev proxy `/api` (vdocs-web inheritance, see above).

Git-ignored: `web/node_modules/`, `web/.svelte-kit/`. Committed: `package.json`, `package-lock.json`,
the `src/` + config, and the built `./static/`.
