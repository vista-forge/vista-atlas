/**
 * Contract check for the vdocs index.db (proposal §3.2): before any
 * feature reads the db, verify its self-declared meta pins against the
 * pinned release and the read-contract ADR's version rule, and that
 * every view/column Atlas binds to actually exists. The bound surface
 * below is the vendored consumer contract — the `v_*` views +
 * `chunks_fts` of read_schema_version 1.5, nothing else (never base
 * tables, never the live lake).
 */

import type { Store } from './engine.js';

export interface IndexContractExpectation {
  /** read_schema_version Atlas was written against, e.g. "1.5". */
  readonly readSchemaVersion: string;
  /** Producer corpus hash (meta.corpus_content_hash), when pinned. */
  readonly corpusContentHash?: string;
  /** View → required columns; defaults to the bound surface. */
  readonly requiredViews?: Readonly<Record<string, readonly string[]>>;
}

export interface ContractReport {
  readonly ok: boolean;
  readonly problems: readonly string[];
}

/** The view surface Atlas binds to, with the columns it reads. */
export const INDEX_DB_VIEWS: Readonly<Record<string, readonly string[]>> = {
  v_documents: [
    'doc_key',
    'title',
    'app_code',
    'app_name',
    'doc_type',
    'section',
    'version',
    'patch_id',
    'group_key',
    'is_latest',
    'pub_year',
    'source_url',
    'word_count',
    'section_count',
  ],
  v_sections: [
    'section_id',
    'doc_key',
    'slug',
    'title',
    'level',
    'toc_level',
    'is_latest',
    'kind',
    'searchable',
    'section_path',
    'seq',
  ],
  v_chunks: ['chunk_id', 'section_id', 'doc_key', 'part', 'text'],
  v_vocab: ['kind', 'code', 'label', 'description'],
  v_entities: ['entity_id', 'type', 'canonical_name', 'mention_count'],
  v_entity_mentions: ['entity_id', 'doc_key', 'section_id'],
};

/** The FTS5 table the contract documents alongside the views. */
export const INDEX_DB_FTS = {
  table: 'chunks_fts',
  columns: ['chunk_id', 'section_id', 'doc_key', 'title', 'doc_title', 'section_path', 'body'],
} as const;

function parseVersion(text: string): { major: number; minor: number } | undefined {
  const match = /^(\d+)\.(\d+)$/.exec(text);
  if (!match?.[1] || !match[2]) {
    return undefined;
  }
  return { major: Number(match[1]), minor: Number(match[2]) };
}

/** Check an opened index.db against the pinned expectation. */
export function checkIndexDb(store: Store, expected: IndexContractExpectation): ContractReport {
  const problems: string[] = [];

  const meta = new Map<string, string>();
  for (const row of store.all('SELECT key, value FROM meta')) {
    meta.set(String(row.key), String(row.value));
  }

  const required = parseVersion(expected.readSchemaVersion);
  if (required === undefined) {
    problems.push(`expected read_schema_version is malformed: ${expected.readSchemaVersion}`);
  } else {
    const declared = meta.get('read_schema_version') ?? '';
    const actual = parseVersion(declared);
    if (actual === undefined) {
      problems.push(`meta.read_schema_version: malformed or absent: ${declared || '(absent)'}`);
    } else if (actual.major !== required.major || actual.minor < required.minor) {
      // ADR 0001: MAJOR must match exactly; MINOR is additive, so the db
      // may be newer than the consumer but never older.
      problems.push(
        `meta.read_schema_version: db declares ${declared}, Atlas requires ${expected.readSchemaVersion} (same MAJOR, MINOR >=)`,
      );
    }
  }

  if (expected.corpusContentHash !== undefined) {
    const declared = meta.get('corpus_content_hash');
    if (declared !== expected.corpusContentHash) {
      problems.push(
        `meta.corpus_content_hash: expected ${expected.corpusContentHash}, got ${declared || '(absent)'}`,
      );
    }
  }

  const names = (type: 'table' | 'view'): Set<string> =>
    new Set(
      store
        .all('SELECT name FROM sqlite_master WHERE type = ?', type)
        .map((row) => String(row.name)),
    );
  const views = names('view');
  const tables = names('table');

  const columnsOf = (relation: string): Set<string> =>
    new Set(
      store.all(`PRAGMA table_info(${JSON.stringify(relation)})`).map((row) => String(row.name)),
    );

  for (const [view, columns] of Object.entries(expected.requiredViews ?? INDEX_DB_VIEWS)) {
    if (!views.has(view)) {
      problems.push(`missing view ${view}`);
      continue;
    }
    const actualColumns = columnsOf(view);
    for (const column of columns) {
      if (!actualColumns.has(column)) {
        problems.push(`view ${view}: missing column ${column}`);
      }
    }
  }

  if (!tables.has(INDEX_DB_FTS.table)) {
    problems.push(`missing table ${INDEX_DB_FTS.table}`);
  } else {
    const actualColumns = columnsOf(INDEX_DB_FTS.table);
    for (const column of INDEX_DB_FTS.columns) {
      if (!actualColumns.has(column)) {
        problems.push(`table ${INDEX_DB_FTS.table}: missing column ${column}`);
      }
    }
  }

  return { ok: problems.length === 0, problems };
}
