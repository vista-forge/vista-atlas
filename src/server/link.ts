/**
 * Twin-link payload → SPA deep-link query string. The counterpart of the
 * SPA's web/src/lib/deeplink.ts grammar (?doc / ?section / ?q + displayed
 * facet axes): the extension reloads the navigator iframe with this query
 * so a cross-extension command lands on the right doc/section/search.
 * Anything unresolvable degrades to '' — a plain open, never an error.
 */

/** The facet axes the SPA displays (and therefore accepts from a link). */
const LINK_AXES = new Set(['function_category', 'app_user', 'doc_type', 'doc_user', 'pkg_ns']);

function asRecord(payload: unknown): Record<string, unknown> | undefined {
  return typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>)
    : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** filters: axis → value | value[] (twin-link `filters` object) → params. */
function appendFilters(params: URLSearchParams, filters: unknown): void {
  const record = asRecord(filters);
  if (record === undefined) return;
  for (const [axis, raw] of Object.entries(record)) {
    if (!LINK_AXES.has(axis)) continue;
    const values = Array.isArray(raw) ? raw : [raw];
    for (const v of values) {
      const s = str(v);
      if (s !== undefined) params.append(axis, s);
    }
  }
}

/**
 * Build the navigator query string for a twin-link command payload.
 * `resolveSectionDoc` maps a section_id to its doc_key (the SPA needs the
 * doc for TOC context and ignores a section without one).
 */
export function navigatorLinkQuery(
  command: string,
  payload: unknown,
  resolveSectionDoc: (sectionId: string) => string | undefined,
): string {
  const record = asRecord(payload);
  const params = new URLSearchParams();

  if (command === 'vistaAtlas.openDoc') {
    const docKey = str(record?.doc_key);
    if (docKey === undefined) return '';
    params.set('doc', docKey);
  } else if (command === 'vistaAtlas.openSection') {
    const sectionId = str(record?.section_id);
    const docKey = sectionId === undefined ? undefined : resolveSectionDoc(sectionId);
    if (sectionId === undefined || docKey === undefined) return '';
    params.set('doc', docKey);
    params.set('section', sectionId);
  } else if (command === 'vistaAtlas.search') {
    const query = str(record?.query);
    if (query === undefined) return '';
    params.set('q', query);
    appendFilters(params, record?.filters);
  } else {
    return '';
  }
  return `?${params.toString()}`;
}

/**
 * Merge a '?…' deep-link query onto a base URL, preserving any params the
 * base already carries (vscode.env.asExternalUri can add tunnel tokens).
 */
export function withLinkQuery(baseUrl: string, query: string): string {
  if (query === '') return baseUrl;
  const url = new URL(baseUrl);
  for (const [k, v] of new URLSearchParams(query.slice(1))) {
    url.searchParams.append(k, v);
  }
  return url.toString();
}
