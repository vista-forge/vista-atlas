import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Static SPA build → ../internal/web/static, which the Go binary embeds (go:embed).
// fallback:index.html makes it a client-routed SPA; data comes from the runtime /api.
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: '../internal/web/static',
      assets: '../internal/web/static',
      fallback: 'index.html',
      precompress: false,
    }),
  },
};
