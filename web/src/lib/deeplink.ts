// Deep-link grammar: the SPA's initial navigation state, read once from the
// page URL's query string. This is how the extension's twin-link commands
// (vistaAtlas.openDoc / openSection / search) target the navigator — it
// reloads the iframe with these params (Atlas addition; vdocs-web had no URL
// state). Facet axes use the same repeatable-param grammar as /api/candidates.

import type { Selection } from './api';

/** The facet axes accepted from the URL — exactly the axes the page
 *  displays (so a deep-linked filter is always visible and clearable).
 *  NOTE: the API's `section` axis is deliberately excluded — `section`
 *  is this grammar's section-ID param. */
export const LINK_AXES = [
  'function_category',
  'app_user',
  'doc_type',
  'doc_user',
  'pkg_ns',
] as const;

export type LinkScope = 'all' | 'name' | 'headings';

export interface DeepLinkState {
  /** Facet selection: axis → values (OR within, AND across). */
  sel: Selection;
  /** Full-text query for the search box. */
  q: string;
  /** FTS scope; invalid/absent → 'all'. */
  scope: LinkScope;
  /** DocKey to open ('%2F'-encoded in the URL, decoded here). */
  doc: string | null;
  /** Section ID to open within the doc. */
  section: string | null;
}

/** Parse a location.search string into the initial navigation state.
 *  Unknown params and empty values are dropped, never errors. */
export function parseDeepLink(search: string): DeepLinkState {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const sel: Selection = {};
  for (const axis of LINK_AXES) {
    const vals = p.getAll(axis).filter((v) => v !== '');
    if (vals.length) sel[axis] = vals;
  }
  const scopeRaw = p.get('scope');
  const scope: LinkScope = scopeRaw === 'name' || scopeRaw === 'headings' ? scopeRaw : 'all';
  return {
    sel,
    q: p.get('q') ?? '',
    scope,
    doc: p.get('doc') || null,
    section: p.get('section') || null,
  };
}
