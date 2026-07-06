/**
 * The Filter→WHERE builder — a faithful TS port of vdocs-web's
 * internal/index/filter.go (code reference authorized by owner,
 * 2026-07-05), so the navigator SPA gets byte-identical query
 * semantics from the in-process server. Pure (no I/O).
 */

import type { SqlValue } from '../store/engine.js';

/**
 * The documents-table columns exposed as facet axes, in the fixed
 * predicate order (deterministic SQL). A value is interpolated into
 * SQL only if it appears in this whitelist — never from caller keys —
 * so an axis name can never carry an injection.
 */
export const DOC_AXES = [
  'doc_type',
  'app_code',
  'pkg_ns',
  'section',
  'app_user',
  'doc_user',
  'software_class',
  'function_category',
  'product_abbr',
  'pub_year',
] as const;

export type DocAxis = (typeof DOC_AXES)[number];

const DOC_AXIS_SET: ReadonlySet<string> = new Set(DOC_AXES);

/** Whether name is a whitelisted documents-table facet axis. */
export function isDocAxis(name: string): name is DocAxis {
  return DOC_AXIS_SET.has(name);
}

/**
 * The current faceted query. sel maps a doc axis to its selected
 * values (OR within the axis, AND across axes); entity is a set of
 * selected entity_ids (a doc matches if it mentions any); fts is an
 * optional full-text query; ftsScope optionally restricts it to a
 * subset of the chunks_fts columns.
 */
export interface Filter {
  readonly sel: Readonly<Record<string, readonly string[]>>;
  readonly entity?: readonly string[];
  readonly fts?: string;
  readonly ftsScope?: string;
}

const placeholders = (n: number): string => Array.from({ length: n }, () => '?').join(', ');

/**
 * Build the documents-table predicate for every active axis EXCEPT
 * those in omit (relax an axis to count its values). omit may name
 * doc axes, "entity", or "fts". The implicit always-on gold filter is
 * is_latest = 1.
 */
export function where(
  filter: Filter,
  omit: string | readonly string[] = '',
): { clause: string; args: SqlValue[] } {
  const omitted = new Set(typeof omit === 'string' ? [omit] : omit);
  const clauses = ['is_latest = 1'];
  const args: SqlValue[] = [];
  for (const axis of DOC_AXES) {
    const vals = filter.sel[axis];
    if (omitted.has(axis) || vals === undefined || vals.length === 0) {
      continue;
    }
    clauses.push(`${axis} IN (${placeholders(vals.length)})`);
    args.push(...vals);
  }
  const entity = filter.entity ?? [];
  if (!omitted.has('entity') && entity.length > 0) {
    clauses.push(
      `doc_key IN (SELECT doc_key FROM v_entity_mentions WHERE entity_id IN (${placeholders(entity.length)}))`,
    );
    args.push(...entity);
  }
  if (!omitted.has('fts') && (filter.fts ?? '').trim() !== '') {
    clauses.push('doc_key IN (SELECT doc_key FROM chunks_fts WHERE chunks_fts MATCH ?)');
    args.push(ftsMatch(filter.fts ?? '', filter.ftsScope ?? ''));
  }
  return { clause: clauses.join(' AND '), args };
}

/**
 * Search-scope → chunks_fts column restriction. Empty/unrecognized
 * scope means all indexed columns. A fixed whitelist, never caller
 * text, so a scope can never carry an FTS/SQL injection.
 */
const FTS_SCOPE_COLS: Readonly<Record<string, string>> = {
  name: 'doc_title',
  headings: 'title section_path',
};

/** The FTS5 MATCH expression for q under an optional column scope. */
export function ftsMatch(q: string, scope: string): string {
  const m = ftsSanitize(q);
  if (m === '') {
    return '';
  }
  const cols = FTS_SCOPE_COLS[scope];
  return cols === undefined ? m : `{${cols}}:(${m})`;
}

/**
 * Free user text → safe FTS5 MATCH expression: each whitespace token
 * double-quoted (punctuation can't read as FTS syntax), embedded
 * quotes doubled, space-joined (implicit AND).
 */
export function ftsSanitize(q: string): string {
  return q
    .trim()
    .split(/\s+/)
    .filter((tok) => tok.length > 0)
    .map((tok) => `"${tok.replaceAll('"', '""')}"`)
    .join(' ');
}
