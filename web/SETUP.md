# vdocs-web front-end — SvelteKit (pinned, repo-owned, portable)

A **SvelteKit** SPA (Svelte 5) that builds to static assets in `../internal/web/static/`, which the
Go binary embeds (`go:embed all:static`). **Node is build-time only** — the shipped binary has no
Node runtime dependency. Follows the house Node standard (npm; see `~/.claude/CLAUDE.md`), with one
justified deviation: SvelteKit uses **Vite** (not `tsc`) and its own check/lint, since it's an app,
not a publishable library.

## What's pinned (reproducible on any machine)

| Layer | Pinned by |
|---|---|
| Node version | `../.node-version` (`22`) + `engines.node` in `package.json` (read by nvm via direnv) |
| Every dependency (exact) | the committed **`package-lock.json`** (`save-exact=true` in `.npmrc`) |
| Build output | committed in `../internal/web/static/` so `go build` needs **no** Node |

## Work on it

```bash
nvm use                       # ../.node-version → Node 22 (or direnv auto-activates it)
make web-install              # npm ci — exact tree from package-lock.json
make run                      # (separate shell) start the Go API on :8765
make web-dev                  # vite dev w/ HMR, proxies /api → :8765 → http://localhost:5173
```

## Build + embed (when the UI changes)

```bash
make web-build                # vite build → ../internal/web/static (adapter-static SPA)
make build                    # go build embeds the refreshed static output
git add web/ internal/web/static   # commit BOTH the source and the built output
```

The built output is committed on purpose: it keeps `go build` / `make install` working without a
Node toolchain (CI, fresh checkout). Regenerate it with `make web-build` whenever `web/src` changes.

## Layout

- `web/src/routes/+page.svelte` — the faceted browser (Svelte 5 runes).
- `web/src/lib/api.ts` — typed client for `/api/facets`, `/api/candidates`, `/api/meta`.
- `web/src/routes/+layout.ts` — `ssr=false`, `prerender=false` (pure SPA; data is runtime).
- `web/svelte.config.js` — `adapter-static` → `../internal/web/static`, SPA `fallback: index.html`.
- `web/vite.config.ts` — dev proxy `/api` → the Go server.

Git-ignored: `web/node_modules/`, `web/.svelte-kit/`. Committed: `package.json`, `package-lock.json`,
the `src/` + config, and the built `internal/web/static/`.
