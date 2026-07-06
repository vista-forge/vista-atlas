/**
 * Test-support builder for a minimal, contract-conforming index.db.
 * Mirrors the published read-contract surface (v_* views over base
 * tables + the chunks_fts FTS5 table + the meta pins) so unit tests
 * run against the same shapes the real release ships — never against
 * the live lake (project rule).
 */

import { DatabaseSync } from 'node:sqlite';

export interface FixtureSection {
  readonly section_id: string;
  readonly slug: string;
  readonly title: string;
  readonly level?: number;
  readonly toc_level?: number;
  readonly kind?: string;
  readonly searchable?: number;
  readonly section_path?: string;
  readonly seq?: number;
  /** Chunk texts in part order. */
  readonly chunks: readonly string[];
  /** Search-only flattened table chunks (chunk_id `<section_id>#table-NN.csv`). */
  readonly tableChunks?: readonly string[];
}

export interface FixtureDoc {
  readonly doc_key: string;
  readonly title: string;
  readonly app_code: string;
  readonly app_name?: string;
  readonly doc_type?: string;
  readonly doc_label?: string;
  readonly section?: string;
  readonly pkg_ns?: string;
  readonly app_user?: string;
  readonly doc_user?: string;
  readonly software_class?: string;
  readonly function_category?: string;
  readonly product_abbr?: string;
  readonly product_full?: string;
  readonly version?: string;
  readonly patch_id?: string;
  readonly group_key?: string;
  readonly is_latest?: number;
  readonly pub_year?: string;
  readonly source_url?: string;
  readonly bundle_path?: string;
  readonly sections: readonly FixtureSection[];
}

export interface FixtureOptions {
  /** meta rows; defaults carry read_schema_version 1.5 + a fixture hash. */
  readonly meta?: Readonly<Record<string, string>>;
  readonly vocab?: readonly {
    kind: string;
    code: string;
    label: string;
    description: string;
  }[];
  readonly entities?: readonly {
    entity_id: string;
    type: string;
    canonical_name: string;
    mention_count: number;
  }[];
  readonly mentions?: readonly { entity_id: string; doc_key: string; section_id: string }[];
  /** View names to leave out (drift tests). */
  readonly omitViews?: readonly string[];
  /** Replacement view DDL by name (column-drift tests). */
  readonly viewSql?: Readonly<Record<string, string>>;
  /** Leave out the chunks_fts table entirely. */
  readonly omitFts?: boolean;
}

export const FIXTURE_META: Readonly<Record<string, string>> = {
  read_schema_version: '1.5',
  corpus_content_hash: 'f'.repeat(64),
  corpus_doc_count: '0',
};

const VIEW_DDL: Readonly<Record<string, string>> = {
  v_documents: 'CREATE VIEW v_documents AS SELECT * FROM documents',
  v_sections: 'CREATE VIEW v_sections AS SELECT * FROM doc_sections',
  v_chunks: 'CREATE VIEW v_chunks AS SELECT chunk_id, section_id, doc_key, part, text FROM chunks',
  v_vocab: 'CREATE VIEW v_vocab AS SELECT * FROM vocab',
  v_entities: 'CREATE VIEW v_entities AS SELECT * FROM entities',
  v_entity_mentions: 'CREATE VIEW v_entity_mentions AS SELECT * FROM entity_mentions',
};

/** Build a fixture index.db at path; returns nothing, open it with openStore. */
export function buildFixtureDb(
  path: string,
  docs: readonly FixtureDoc[],
  options: FixtureOptions = {},
): void {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE documents (
      doc_key TEXT PRIMARY KEY, title TEXT, app_code TEXT, app_name TEXT,
      doc_type TEXT, doc_label TEXT, section TEXT, pkg_ns TEXT,
      app_user TEXT, doc_user TEXT, software_class TEXT, function_category TEXT,
      product_abbr TEXT, product_full TEXT,
      version TEXT, patch_id TEXT, group_key TEXT,
      is_latest INTEGER, pub_year TEXT, source_url TEXT, bundle_path TEXT,
      word_count INTEGER, section_count INTEGER
    );
    CREATE TABLE doc_sections (
      section_id TEXT PRIMARY KEY, doc_key TEXT, slug TEXT, title TEXT,
      level INTEGER, toc_level INTEGER, is_latest INTEGER, kind TEXT,
      searchable INTEGER, section_path TEXT, seq INTEGER
    );
    CREATE TABLE chunks (
      chunk_id TEXT PRIMARY KEY, section_id TEXT, doc_key TEXT,
      part INTEGER, text TEXT
    );
    CREATE TABLE vocab (kind TEXT, code TEXT, label TEXT, description TEXT);
    CREATE TABLE entities (
      entity_id TEXT PRIMARY KEY, type TEXT, canonical_name TEXT, mention_count INTEGER
    );
    CREATE TABLE entity_mentions (entity_id TEXT, doc_key TEXT, section_id TEXT);
  `);
  if (options.omitFts !== true) {
    db.exec(`
      CREATE VIRTUAL TABLE chunks_fts USING fts5(
        chunk_id UNINDEXED, section_id UNINDEXED, doc_key UNINDEXED,
        title, doc_title, section_path, body
      );
    `);
  }
  for (const [name, ddl] of Object.entries(VIEW_DDL)) {
    if (options.omitViews?.includes(name)) {
      continue;
    }
    db.exec(options.viewSql?.[name] ?? ddl);
  }

  const meta = { ...FIXTURE_META, ...options.meta };
  const putMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(meta)) {
    putMeta.run(key, value);
  }

  const putDoc = db.prepare(
    `INSERT INTO documents (doc_key, title, app_code, app_name, doc_type, doc_label,
       section, pkg_ns, app_user, doc_user, software_class, function_category,
       product_abbr, product_full,
       version, patch_id, group_key, is_latest, pub_year, source_url, bundle_path,
       word_count, section_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const putSection = db.prepare(
    `INSERT INTO doc_sections (section_id, doc_key, slug, title, level, toc_level,
       is_latest, kind, searchable, section_path, seq)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const putChunk = db.prepare(
    'INSERT INTO chunks (chunk_id, section_id, doc_key, part, text) VALUES (?, ?, ?, ?, ?)',
  );
  const putFts =
    options.omitFts === true
      ? undefined
      : db.prepare(
          `INSERT INTO chunks_fts (chunk_id, section_id, doc_key, title, doc_title,
             section_path, body)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        );

  for (const doc of docs) {
    const words = doc.sections.flatMap((s) => s.chunks).join(' ');
    putDoc.run(
      doc.doc_key,
      doc.title,
      doc.app_code,
      doc.app_name ?? doc.app_code,
      doc.doc_type ?? 'UM',
      doc.doc_label ?? 'User Manual',
      doc.section ?? 'Clinical',
      doc.pkg_ns ?? doc.app_code,
      doc.app_user ?? 'clinical',
      doc.doc_user ?? 'clinical',
      doc.software_class ?? 'I',
      doc.function_category ?? 'Clinical care',
      doc.product_abbr ?? '',
      doc.product_full ?? '',
      doc.version ?? '1.0',
      doc.patch_id ?? null,
      doc.group_key ?? doc.doc_key,
      doc.is_latest ?? 1,
      doc.pub_year ?? '2020',
      doc.source_url ?? `https://example.test/${doc.doc_key}`,
      doc.bundle_path ?? null,
      words.split(/\s+/).length,
      doc.sections.length,
    );
    for (const [index, section] of doc.sections.entries()) {
      putSection.run(
        section.section_id,
        doc.doc_key,
        section.slug,
        section.title,
        section.level ?? 1,
        section.toc_level ?? 1,
        doc.is_latest ?? 1,
        section.kind ?? 'ok',
        section.searchable ?? 1,
        section.section_path ?? `${doc.title} > ${section.title}`,
        section.seq ?? index,
      );
      for (const [part, text] of section.chunks.entries()) {
        const chunkId = part === 0 ? section.section_id : `${section.section_id}#${part}`;
        putChunk.run(chunkId, section.section_id, doc.doc_key, part, text);
        putFts?.run(
          chunkId,
          section.section_id,
          doc.doc_key,
          section.title,
          doc.title,
          section.section_path ?? `${doc.title} > ${section.title}`,
          text,
        );
      }
      for (const [i, text] of (section.tableChunks ?? []).entries()) {
        const n = String(i + 1).padStart(2, '0');
        const chunkId = `${section.section_id}#table-${n}.csv`;
        putChunk.run(chunkId, section.section_id, doc.doc_key, section.chunks.length + i, text);
        putFts?.run(
          chunkId,
          section.section_id,
          doc.doc_key,
          section.title,
          doc.title,
          section.section_path ?? `${doc.title} > ${section.title}`,
          text,
        );
      }
    }
  }

  const putVocab = db.prepare(
    'INSERT INTO vocab (kind, code, label, description) VALUES (?, ?, ?, ?)',
  );
  for (const row of options.vocab ?? []) {
    putVocab.run(row.kind, row.code, row.label, row.description);
  }
  const putEntity = db.prepare(
    'INSERT INTO entities (entity_id, type, canonical_name, mention_count) VALUES (?, ?, ?, ?)',
  );
  for (const row of options.entities ?? []) {
    putEntity.run(row.entity_id, row.type, row.canonical_name, row.mention_count);
  }
  const putMention = db.prepare(
    'INSERT INTO entity_mentions (entity_id, doc_key, section_id) VALUES (?, ?, ?)',
  );
  for (const row of options.mentions ?? []) {
    putMention.run(row.entity_id, row.doc_key, row.section_id);
  }
  db.close();
}
