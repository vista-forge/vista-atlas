import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Static SPA build → ./static, served by the extension's in-process navigator
// (src/server/http.ts) — vista-atlas's analog of vdocs-web's go:embed. Because
// `static` is the OUTPUT here, the SvelteKit assets-input dir is remapped to
// `assets/` (may not exist; there are no source static assets today).
// fallback:index.html makes it a client-routed SPA; data comes from the runtime /api.
export default {
  preprocess: vitePreprocess(),
  kit: {
    // Deterministic builds: the default version name is Date.now(), which
    // cascades into chunk hashes and makes every rebuild dirty the committed
    // output. Version polling is meaningless for a local in-extension SPA.
    version: { name: 'vista-atlas' },
    files: { assets: 'assets' },
    adapter: adapter({
      pages: 'static',
      assets: 'static',
      fallback: 'index.html',
      precompress: false,
    }),
  },
};
