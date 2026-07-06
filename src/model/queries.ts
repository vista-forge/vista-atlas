/**
 * Atlas query layer — every read the extension makes, expressed against
 * the bound contract surface only (`v_*` views + `chunks_fts`; see
 * store/contract.ts). Facets, document lists, TOC, section bodies, and
 * ranked FTS5 search with the proposal's scopes (name/headings/all).
 */

import type { SqlRow, SqlValue, Store } from '../store/engine.js';

export interface DocumentFilters {
  readonly app_code?: string;
  readonly section?: string;
  readonly doc_type?: string;
  readonly pub_year?: string;
  /** Restrict to the latest version of each document group. */
  readonly latestOnly?: boolean;
}

export interface DocumentSummary {
  readonly doc_key: string;
  readonly title: string;
  readonly app_code: string;
  readonly app_name: string;
  readonly doc_type: string;
  readonly section: string;
  readonly pub_year: string;
  readonly is_latest: number;
}

export interface DocumentDetail extends DocumentSummary {
  readonly version: string;
  readonly patch_id: string | null;
  readonly group_key: string;
  readonly source_url: string;
  readonly word_count: number;
  readonly section_count: number;
}

export interface SectionRow {
  readonly section_id: string;
  readonly doc_key: string;
  readonly slug: string;
  readonly title: string;
  readonly level: number;
  readonly toc_level: number;
  readonly kind: string;
  readonly searchable: number;
  readonly section_path: string;
  readonly seq: number;
}

export type SearchScope = 'all' | 'name' | 'headings';

export interface SearchOptions {
  readonly scope?: SearchScope;
  readonly filters?: DocumentFilters;
  readonly limit?: number;
}

export interface SearchHit {
  readonly chunk_id: string;
  readonly section_id: string;
  readonly doc_key: string;
  readonly title: string;
  readonly doc_title: string;
  readonly section_path: string;
  readonly snippet: string;
  readonly rank: number;
}

export interface Page {
  readonly limit?: number;
  readonly offset?: number;
}

const DOCUMENT_FACETS = ['app_code', 'section', 'doc_type', 'pub_year'] as const;
export type DocumentFacet = (typeof DOCUMENT_FACETS)[number];

const str = (v: SqlValue | undefined): string => String(v ?? '');
const num = (v: SqlValue | undefined): number => Number(v ?? 0);

function docWhere(filters: DocumentFilters, alias = ''): { sql: string; params: SqlValue[] } {
  const prefix = alias === '' ? '' : `${alias}.`;
  const clauses: string[] = [];
  const params: SqlValue[] = [];
  for (const key of DOCUMENT_FACETS) {
    const value = filters[key];
    if (value !== undefined) {
      clauses.push(`${prefix}${key} = ?`);
      params.push(value);
    }
  }
  if (filters.latestOnly === true) {
    clauses.push(`${prefix}is_latest = 1`);
  }
  return { sql: clauses.length === 0 ? '' : ` WHERE ${clauses.join(' AND ')}`, params };
}

function toSummary(row: SqlRow): DocumentSummary {
  return {
    doc_key: str(row.doc_key),
    title: str(row.title),
    app_code: str(row.app_code),
    app_name: str(row.app_name),
    doc_type: str(row.doc_type),
    section: str(row.section),
    pub_year: str(row.pub_year),
    is_latest: num(row.is_latest),
  };
}

/** List documents matching the filters, ordered by title. */
export function listDocuments(
  store: Store,
  filters: DocumentFilters = {},
  page: Page = {},
): DocumentSummary[] {
  const where = docWhere(filters);
  return store
    .all(
      `SELECT doc_key, title, app_code, app_name, doc_type, section, pub_year, is_latest
       FROM v_documents${where.sql}
       ORDER BY title, doc_key
       LIMIT ? OFFSET ?`,
      ...where.params,
      page.limit ?? -1,
      page.offset ?? 0,
    )
    .map(toSummary);
}

/** Count documents per facet value; other filters apply, the facet's own does not. */
export function facetCounts(
  store: Store,
  facet: DocumentFacet,
  filters: DocumentFilters = {},
): { value: string; count: number }[] {
  if (!DOCUMENT_FACETS.includes(facet)) {
    throw new Error(`unknown facet: ${String(facet)}`);
  }
  const where = docWhere({ ...filters, [facet]: undefined });
  return store
    .all(
      `SELECT ${facet} AS value, COUNT(*) AS count
       FROM v_documents${where.sql === '' ? ' WHERE ' : `${where.sql} AND `}${facet} IS NOT NULL
       GROUP BY ${facet}
       ORDER BY count DESC, value`,
      ...where.params,
    )
    .map((row) => ({ value: str(row.value), count: num(row.count) }));
}

/** Fetch one document with its detail columns, or undefined. */
export function getDocument(store: Store, docKey: string): DocumentDetail | undefined {
  const row = store.get(
    `SELECT doc_key, title, app_code, app_name, doc_type, section, pub_year, is_latest,
            version, patch_id, group_key, source_url, word_count, section_count
     FROM v_documents WHERE doc_key = ?`,
    docKey,
  );
  if (row === undefined) {
    return undefined;
  }
  return {
    ...toSummary(row),
    version: str(row.version),
    patch_id: row.patch_id === null ? null : str(row.patch_id),
    group_key: str(row.group_key),
    source_url: str(row.source_url),
    word_count: num(row.word_count),
    section_count: num(row.section_count),
  };
}

const toSection = (row: SqlRow): SectionRow => ({
  section_id: str(row.section_id),
  doc_key: str(row.doc_key),
  slug: str(row.slug),
  title: str(row.title),
  level: num(row.level),
  toc_level: num(row.toc_level),
  kind: str(row.kind),
  searchable: num(row.searchable),
  section_path: str(row.section_path),
  seq: num(row.seq),
});

/** Fetch one section by id, or undefined. */
export function getSection(store: Store, sectionId: string): SectionRow | undefined {
  const row = store.get(
    `SELECT section_id, doc_key, slug, title, level, toc_level, kind, searchable,
            section_path, seq
     FROM v_sections WHERE section_id = ?`,
    sectionId,
  );
  return row === undefined ? undefined : toSection(row);
}

/** code → label for a published vocabulary kind (doc_type, section, …). */
export function vocabLabels(store: Store, kind: string): Map<string, string> {
  return new Map(
    store
      .all('SELECT code, label FROM v_vocab WHERE kind = ?', kind)
      .map((row) => [str(row.code), str(row.label)]),
  );
}

/** The document's sections in reading (seq) order — the TOC. */
export function listSections(store: Store, docKey: string): SectionRow[] {
  return store
    .all(
      `SELECT section_id, doc_key, slug, title, level, toc_level, kind, searchable,
              section_path, seq
       FROM v_sections WHERE doc_key = ? ORDER BY seq`,
      docKey,
    )
    .map(toSection);
}

/**
 * Rejoin a section's chunk parts into its body text, inverting the
 * producer's split grammar (vdocs index_pure.split_oversized): windows
 * are "\n\n"-joined blocks and the last block of each window repeats as
 * the first block of the next, so a leading block the accumulated text
 * already ends with is the carried overlap — drop it. A boundary with
 * no such overlap is a hard split (an oversized single block cut by
 * lines/chars); join it with "\n", never dropping content. Naive
 * concatenation would silently duplicate the overlap block — the
 * predecessor bug class this module encodes test-first.
 */
export function joinChunkParts(parts: readonly string[]): string {
  let out = parts[0] ?? '';
  for (const part of parts.slice(1)) {
    const boundary = part.indexOf('\n\n');
    const firstBlock = boundary === -1 ? part : part.slice(0, boundary);
    if (firstBlock.length > 0 && (out === firstBlock || out.endsWith(`\n\n${firstBlock}`))) {
      out += part.slice(firstBlock.length);
    } else {
      out += `\n${part}`;
    }
  }
  return out;
}

/** A section's full text from its chunks, or undefined if unknown. */
export function sectionText(store: Store, sectionId: string): string | undefined {
  const parts = store
    .all('SELECT text FROM v_chunks WHERE section_id = ? ORDER BY part', sectionId)
    .map((row) => str(row.text));
  return parts.length === 0 ? undefined : joinChunkParts(parts);
}

/** Quote each whitespace-separated term so FTS5 metacharacters are literal. */
export function escapeFtsQuery(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .filter((term) => term.length > 0)
    .map((term) => `"${term.replaceAll('"', '""')}"`)
    .join(' ');
}

const SCOPE_COLUMNS: Readonly<Record<SearchScope, string>> = {
  all: '',
  name: '{doc_title} : ',
  headings: '{title section_path} : ',
};

/** Ranked FTS5 search over chunks, scoped per the proposal (name/headings/all). */
export function searchChunks(store: Store, raw: string, options: SearchOptions = {}): SearchHit[] {
  const escaped = escapeFtsQuery(raw);
  if (escaped === '') {
    return [];
  }
  const match = `${SCOPE_COLUMNS[options.scope ?? 'all']}(${escaped})`;
  const filters = options.filters ?? {};
  const where = docWhere(filters, 'd');
  const join = where.sql === '' ? '' : ' JOIN v_documents d ON d.doc_key = chunks_fts.doc_key';
  const rows = store.all(
    `SELECT chunks_fts.chunk_id, chunks_fts.section_id, chunks_fts.doc_key,
            chunks_fts.title, chunks_fts.doc_title, chunks_fts.section_path,
            snippet(chunks_fts, -1, '«', '»', '…', 12) AS snippet,
            bm25(chunks_fts) AS rank
     FROM chunks_fts${join}
     WHERE chunks_fts MATCH ?${where.sql === '' ? '' : ` AND ${where.sql.slice(' WHERE '.length)}`}
     ORDER BY rank
     LIMIT ?`,
    match,
    ...where.params,
    options.limit ?? 50,
  );
  return rows.map((row) => ({
    chunk_id: str(row.chunk_id),
    section_id: str(row.section_id),
    doc_key: str(row.doc_key),
    title: str(row.title),
    doc_title: str(row.doc_title),
    section_path: str(row.section_path),
    snippet: str(row.snippet),
    rank: num(row.rank),
  }));
}
