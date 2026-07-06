// Render gold-corpus markdown (the {"text": …} from /api/preview and /api/section)
// to HTML for the reading pane. GFM is on, so pipe tables, fenced code, and task
// lists render. Output is sanitized with DOMPurify at the call site before {@html}.
import { marked, type Tokens } from 'marked';

// Repoint an image reference at the asset route. Gold bodies reference each figure by its
// content-addressed `<sha>.<ext>` filename; the Go server serves those bytes at /api/asset/<name>
// (from the lake's documents/assets store). A bare/relative ref would otherwise 404 against the SPA.
// External (http/data) and already-routed srcs are left alone.
function routeAsset(src: string): string {
  if (!src || /^(https?:|data:|#|\/api\/asset\/)/i.test(src)) return src;
  const name = src.split(/[/\\]/).pop() ?? '';
  return name ? `/api/asset/${encodeURIComponent(name)}` : src;
}

// Repoint every <img> in the rendered HTML. Pandoc emits a figure either as a markdown image
// (handled by the renderer below, which leaves the href bare) OR — when it carries sizing/style —
// as a raw <img> HTML tag that marked passes through verbatim. This single pass routes BOTH, so
// raw-HTML figures (icons, in-cell images, the cover seal) resolve too, not just markdown ones.
const IMG_SRC = /(<img\b[^>]*?\bsrc\s*=\s*")([^"]*)"/gi;
function rewriteImageSrcs(html: string): string {
  return html.replace(IMG_SRC, (_m, pre, src) => `${pre}${routeAsset(src)}"`);
}

// Turn each extracted-table link into a placeholder the reading pane hydrates with the fetched CSV
// rendered as a table (the producer lifts large tables to these sidecars, §6.4; the link alone is a
// dead end in the pane). The gold link is a standalone, usually italic paragraph
// (`_[Table N (extracted to CSV)](tables/table-NN.csv)_`), so marked emits `<p>(<em>)?<a…>…</a>(</em>)?</p>`.
// We consume that whole wrapper and emit a clean block-level `<div>` — a block placeholder left inside
// the `<em>`/`<p>` would be invalid nesting the browser reparents, breaking the injected table.
const TABLE_LINK = /<p>(?:<em>)?<a href="tables\/(table-\d+\.csv)">(.*?)<\/a>(?:<\/em>)?<\/p>/gi;
function markTableLinks(html: string): string {
  return html.replace(
    TABLE_LINK,
    (_m, name, caption) => `<div class="csv-table" data-csv="${name}">${caption}</div>`,
  );
}

// renderInline renders a single markdown fragment without the block <p> wrapper — for table cells,
// whose emphasis/code (e.g. **EN^DIK**) should render like the rest of the body.
export function renderInline(md: string): string {
  return marked.parseInline(md, { async: false }) as string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

marked.use({
  gfm: true,
  breaks: false,
  renderer: {
    // Render each markdown figure as a <figure> for standardized centered placement, with the gold
    // body's alt text (falling back to the image title) as a <figcaption> centered underneath. The
    // href is left bare here; rewriteImageSrcs routes it (and any raw-HTML <img>) afterward.
    // DOMPurify (call site) keeps <figure>/<figcaption> and re-sanitizes; we escape to emit valid HTML.
    image(token: Tokens.Image): string {
      const text = (token.text ?? '').trim();
      const titleAttr = token.title ? ` title="${escapeAttr(token.title)}"` : '';
      const img =
        `<img src="${escapeAttr(token.href)}" alt="${escapeAttr(text)}"` +
        `${titleAttr} loading="lazy">`;
      const caption = text || (token.title ?? '').trim();
      return caption
        ? `<figure>${img}<figcaption>${escapeHtml(caption)}</figcaption></figure>`
        : `<figure>${img}</figure>`;
    },
  },
});

// Synchronous: we register no async extensions, so marked.parse returns a string.
export function renderMarkdown(md: string): string {
  if (!md) return '';
  return markTableLinks(rewriteImageSrcs(marked.parse(md, { async: false }) as string));
}
