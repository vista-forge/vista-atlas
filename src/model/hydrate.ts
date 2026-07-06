/**
 * Pure hydration transforms over gold markdown — the reading pane's
 * engine, written as functions of (text, loader) so every predecessor
 * bug class is unit-testable without a webview:
 *
 * - table placeholders `_[Table N (extracted to CSV)](tables/…csv)_`
 *   hydrate into pipe tables, preserving blockquote nesting (the
 *   mis-nested-placeholder bug silently collapsed these upstream);
 * - CAS image refs `![alt](<sha256>.<ext>)` rewrite through a
 *   resolver, degrading to a visible note — never a broken image;
 * - `_shared/boilerplate` links inline as attributed quotes;
 * - nav chrome (`[↑ Back to Contents](#contents)`) strips.
 *
 * Nothing here ever drops content it does not understand: an
 * unmatched or unresolvable construct passes through visibly.
 */

const CHROME_LINE = '[↑ Back to Contents](#contents)';

/** Split a gold body.md into its YAML identity block and the body. */
export function splitFrontmatter(text: string): { frontmatter: string; body: string } {
  if (!text.startsWith('---\n')) {
    return { frontmatter: '', body: text };
  }
  const end = text.indexOf('\n---\n', 3);
  if (end === -1) {
    return { frontmatter: '', body: text };
  }
  return { frontmatter: text.slice(4, end), body: text.slice(end + 5) };
}

/** Remove standalone back-to-contents lines (P-vdocs 2 consumer workaround). */
export function stripNavChrome(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if ((lines[i] as string).trim() === CHROME_LINE) {
      const prevBlank = out.length === 0 || (out[out.length - 1] as string).trim() === '';
      if (prevBlank && lines[i + 1]?.trim() === '') {
        i += 1; // swallow the now-duplicate blank line
      }
      continue;
    }
    out.push(lines[i] as string);
  }
  return out.join('\n');
}

const CAS_IMAGE = /!\[([^\]]*)\]\(([0-9a-f]{64}\.[A-Za-z0-9]+)\)/g;

/**
 * Rewrite content-addressed image references through a resolver
 * (webview URI, file path, …). Unresolvable assets become a visible
 * note rather than a broken image (rich-assets are excluded from
 * data-v1 — Track P-vdocs 3).
 */
export function rewriteImages(
  md: string,
  resolve: (assetName: string) => string | undefined,
): string {
  return md.replace(CAS_IMAGE, (_whole, alt: string, name: string) => {
    const uri = resolve(name);
    return uri === undefined ? `*[figure unavailable: ${name.slice(0, 8)}…]*` : `![${alt}](${uri})`;
  });
}

/** Minimal CSV parser (quoted fields, "" escapes, CRLF) for the table sidecars. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let started = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] as string;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
      started = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
      started = true;
    } else if (ch === '\n') {
      if (started || field !== '') {
        row.push(field);
        rows.push(row);
      }
      row = [];
      field = '';
      started = false;
    } else if (ch !== '\r') {
      field += ch;
      started = true;
    }
  }
  if (started || field !== '') {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Render CSV text as a GFM pipe table, capped at maxRows data rows. */
export function csvToMarkdownTable(csv: string, maxRows = 50): string {
  const rows = parseCsv(csv);
  const header = rows[0];
  if (header === undefined) {
    return '';
  }
  const esc = (cell: string): string =>
    cell.replaceAll('|', '\\|').replaceAll('\r', '').replaceAll('\n', '<br>');
  const line = (cells: readonly string[]): string => `| ${cells.map(esc).join(' | ')} |`;
  const data = rows.slice(1);
  const shown = data.slice(0, maxRows);
  const parts = [line(header), `| ${header.map(() => '---').join(' | ')} |`, ...shown.map(line)];
  if (data.length > shown.length) {
    const extra = data.length - shown.length;
    parts.push(`_… ${extra} more row${extra === 1 ? '' : 's'} in the CSV sidecar_`);
  }
  return parts.join('\n');
}

/** Apply a per-line expansion; undefined leaves the line untouched. */
function mapLines(md: string, expand: (line: string) => string[] | undefined): string {
  return md
    .split('\n')
    .flatMap((line) => expand(line) ?? [line])
    .join('\n');
}

const blockquotePrefix = (line: string): string => /^(?:>\s?)+/.exec(line)?.[0] ?? '';

const TABLE_PLACEHOLDER = /_\[(Table[^\]]*?)\s*\(extracted to CSV\)\]\((tables\/[^)]+\.csv)\)_/;

/**
 * Hydrate extracted-table placeholders into pipe tables. The
 * placeholder text becomes the caption in place; the grid follows on
 * its own lines, carrying any blockquote prefix so nesting survives.
 * A missing sidecar leaves the visible link untouched.
 */
export function hydrateTables(
  md: string,
  loadCsv: (relPath: string) => string | undefined,
  maxRows?: number,
): string {
  return mapLines(md, (line) => {
    const match = TABLE_PLACEHOLDER.exec(line);
    if (match === null) {
      return undefined;
    }
    const [whole, label, rel] = match as unknown as [string, string, string];
    const csv = loadCsv(rel);
    if (csv === undefined) {
      return undefined;
    }
    const table = csvToMarkdownTable(csv, maxRows);
    if (table === '') {
      return undefined;
    }
    const prefix = blockquotePrefix(line);
    return [
      line.replace(whole, `**${label.trim()}**`),
      prefix.trimEnd(),
      ...table.split('\n').map((row) => `${prefix}${row}`),
    ];
  });
}

const BOILERPLATE_LINK = /_\[([^\]]*?)\s*—\s*shared boilerplate\]\((_shared\/[^)]+\.md)\)_/;

/**
 * Inline `_shared/boilerplate` links as attributed quotes. An
 * unavailable target leaves the visible link untouched (never a dead
 * dropped reference — the predecessor's dead-link class).
 */
export function hydrateBoilerplate(
  md: string,
  loadShared: (relPath: string) => string | undefined,
): string {
  return mapLines(md, (line) => {
    const match = BOILERPLATE_LINK.exec(line);
    if (match === null) {
      return undefined;
    }
    const [whole, , rel] = match as unknown as [string, string, string];
    const content = loadShared(rel);
    if (content === undefined) {
      return undefined;
    }
    const quote = content.split('\n').map((text) => `> ${text}`.trimEnd());
    const rest = line.replace(whole, '').trim();
    return [...(rest === '' ? [] : [rest]), ...quote, '>', `> — _(shared boilerplate: ${rel})_`];
  });
}
