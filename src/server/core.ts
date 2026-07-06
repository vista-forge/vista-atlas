/**
 * The query core behind the navigator API — a faithful TS port of
 * vdocs-web's internal/index/index.go (code reference authorized by
 * owner, 2026-07-05) over the node:sqlite Store. Field names are
 * PascalCase because they ARE the wire format the vendored SPA
 * expects (it mirrored the Go structs). One deliberate improvement
 * over the reference: section/preview reconstruction dedupes the
 * producer's one-block chunk overlap instead of double-rendering it.
 */

import type { SqlValue, Store } from '../store/engine.js';
import { type Filter, isDocAxis, where } from './filter.js';
import { cleanTitle } from './title.js';

export interface DocWire {
  readonly DocKey: string;
  readonly AppCode: string;
  readonly DocType: string;
  readonly PkgNS: string;
  readonly Section: string;
  readonly Title: string;
  readonly DocLabel: string;
  readonly AppUser: string;
  readonly DocUser: string;
}

export interface FacetValueWire {
  readonly Value: string;
  readonly Count: number;
}

export interface SectionWire {
  readonly ID: string;
  readonly Title: string;
  readonly Level: number;
}

export interface VocabWire {
  readonly AppName: Record<string, string>;
  readonly Namespace: Record<string, string>;
  readonly DocType: Record<string, string>;
  readonly Product: Record<string, string>;
  readonly Persona: Record<string, string>;
  readonly Section: Record<string, string>;
  readonly Domain: Record<string, string>;
}

const str = (v: SqlValue | undefined): string => String(v ?? '');
const num = (v: SqlValue | undefined): number => Number(v ?? 0);

/**
 * value→count for one documents-table axis, with that axis relaxed
 * but every other active filter applied. Zero-hit values are absent.
 * Ordered by count desc, then value.
 */
export function facetCounts(store: Store, axis: string, filter: Filter): FacetValueWire[] {
  if (!isDocAxis(axis)) {
    throw new Error(`unknown facet axis ${JSON.stringify(axis)}`);
  }
  const { clause, args } = where(filter, axis);
  return store
    .all(
      `SELECT ${axis} AS v, COUNT(*) AS n FROM v_documents
       WHERE ${clause} AND ${axis} <> '' AND ${axis} IS NOT NULL
       GROUP BY ${axis} ORDER BY COUNT(*) DESC, ${axis}`,
      ...args,
    )
    .map((row) => ({ Value: str(row.v), Count: num(row.n) }));
}

const DOC_COLS =
  'doc_key, app_code, doc_type, pkg_ns, section, title, doc_label, app_user, doc_user';

/** The documents matching the full filter, ordered by title. */
export function candidates(store: Store, filter: Filter): DocWire[] {
  const { clause, args } = where(filter);
  return store
    .all(`SELECT ${DOC_COLS} FROM v_documents WHERE ${clause} ORDER BY title`, ...args)
    .map((row) => ({
      DocKey: str(row.doc_key),
      AppCode: str(row.app_code),
      DocType: str(row.doc_type),
      PkgNS: str(row.pkg_ns),
      Section: str(row.section),
      Title: cleanTitle(str(row.title), str(row.app_code)),
      DocLabel: str(row.doc_label),
      AppUser: str(row.app_user),
      DocUser: str(row.doc_user),
    }));
}

function scanPairs(store: Store, sql: string, into: Record<string, string>): void {
  for (const row of store.all(sql)) {
    into[str(row.k)] = str(row.v);
  }
}

/** The corpus's display vocabulary (abbreviation maps + v_vocab definitions). */
export function vocab(store: Store): VocabWire {
  const v: VocabWire = {
    AppName: {},
    Namespace: {},
    DocType: {},
    Product: {},
    Persona: {},
    Section: {},
    Domain: {},
  };
  scanPairs(
    store,
    "SELECT DISTINCT app_code AS k, app_name AS v FROM v_documents WHERE app_name <> ''",
    v.AppName,
  );
  scanPairs(
    store,
    "SELECT DISTINCT doc_type AS k, doc_label AS v FROM v_documents WHERE doc_label <> ''",
    v.DocType,
  );
  scanPairs(
    store,
    "SELECT DISTINCT product_abbr AS k, product_full AS v FROM v_documents WHERE product_abbr <> ''",
    v.Product,
  );
  Object.assign(v.Namespace, v.AppName);
  const byKind: readonly [string, Record<string, string>][] = [
    ['persona', v.Persona],
    ['section', v.Section],
    ['function_category', v.Domain],
  ];
  for (const [kind, into] of byKind) {
    scanPairs(
      store,
      `SELECT code AS k, description AS v FROM v_vocab WHERE kind = '${kind}'`,
      into,
    );
  }
  return v;
}

/**
 * A document's table of contents: its real heading sections (kind
 * 'ok' = content, 'container' = grouping) in document order.
 * 'hollow'/'stub' rows — printed-TOC links and empty placeholders —
 * are excluded as chrome.
 */
export function docTOC(store: Store, docKey: string): SectionWire[] {
  return store
    .all(
      `SELECT section_id, title, COALESCE(level, 0) AS level FROM v_sections
       WHERE doc_key = ? AND is_latest = 1 AND title <> ''
       AND kind IN ('ok', 'container')
       ORDER BY seq`,
      docKey,
    )
    .map((row) => ({ ID: str(row.section_id), Title: str(row.title), Level: num(row.level) }));
}

// Excludes the index stage's search-only flattened table chunks
// (chunk_id `<section_id>#table-NN.csv`) from body reconstruction:
// they exist so extracted tables stay searchable, and including them
// double-renders every table (once as the hydrated placeholder grid,
// once as a malformed raw block).
const NOT_TABLE_CHUNK = "AND chunk_id NOT LIKE '%#table-%'";

const BACK_TO_CONTENTS = /\[↑ Back to Contents\]\([^)]*\)/g;

const stripChrome = (text: string): string => text.replace(BACK_TO_CONTENTS, '').trim();

/**
 * Join chrome-stripped chunk parts with "\n\n", dropping a leading
 * block the accumulated text already ends with — the producer's
 * one-block window overlap (split_oversized), which the reference
 * implementation double-rendered.
 */
function joinParts(parts: readonly string[]): string {
  let out = '';
  for (const part of parts) {
    if (out === '') {
      out = part;
      continue;
    }
    const boundary = part.indexOf('\n\n');
    const firstBlock = boundary === -1 ? part : part.slice(0, boundary);
    if (firstBlock.length > 0 && (out === firstBlock || out.endsWith(`\n\n${firstBlock}`))) {
      const rest = part.slice(firstBlock.length);
      out += rest.startsWith('\n\n') ? rest : '';
    } else {
      out += `\n\n${part}`;
    }
  }
  return out;
}

/** One section's body: chunks joined by part, nav chrome stripped. */
export function sectionText(store: Store, sectionId: string): string {
  const parts = store
    .all(
      `SELECT text FROM v_chunks WHERE section_id = ? ${NOT_TABLE_CHUNK} ORDER BY part`,
      sectionId,
    )
    .map((row) => stripChrome(str(row.text)))
    .filter((text) => text !== '');
  return joinParts(parts);
}

/**
 * A document's whole body from index.db alone: its latest sections'
 * chunks in document order, nav chrome stripped.
 */
export function preview(store: Store, docKey: string): string {
  const parts = store
    .all(
      `SELECT c.text FROM v_chunks c
       JOIN v_sections ds ON ds.section_id = c.section_id
       WHERE c.doc_key = ? AND ds.is_latest = 1 ${NOT_TABLE_CHUNK}
       ORDER BY ds.seq, c.part`,
      docKey,
    )
    .map((row) => stripChrome(str(row.text)))
    .filter((text) => text !== '');
  return joinParts(parts);
}

/** The doc's de-versioned gold anchor relpath; empty for unknown docs. */
export function bundlePath(store: Store, docKey: string): string {
  const row = store.get('SELECT bundle_path FROM v_documents WHERE doc_key = ?', docKey);
  return row === undefined ? '' : str(row.bundle_path);
}
