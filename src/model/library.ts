/**
 * Library-tree data shaping (proposal §4 "Library view": faceted
 * browse with counts). Plain data nodes only — the vscode TreeItem
 * mapping lives in ext/libraryTree.ts, so every level here is
 * unit-testable against a fixture db.
 */

import type { Store } from '../store/engine.js';
import {
  type DocumentFacet,
  type DocumentSummary,
  type SectionRow,
  facetCounts,
  listDocuments,
  listSections,
  vocabLabels,
} from './queries.js';

export type LibraryNode =
  | { readonly kind: 'facet'; readonly facet: DocumentFacet; readonly label: string }
  | {
      readonly kind: 'facetValue';
      readonly facet: DocumentFacet;
      readonly value: string;
      readonly label: string;
      readonly count: number;
    }
  | { readonly kind: 'document'; readonly doc: DocumentSummary }
  | { readonly kind: 'section'; readonly section: SectionRow };

const DIMENSIONS: readonly { facet: DocumentFacet; label: string }[] = [
  { facet: 'app_code', label: 'Application' },
  { facet: 'section', label: 'Section' },
  { facet: 'doc_type', label: 'Document type' },
  { facet: 'pub_year', label: 'Year' },
];

/** The vocab kind that labels a facet's codes, when one is published. */
const FACET_VOCAB: Partial<Record<DocumentFacet, string>> = {
  doc_type: 'doc_type',
  section: 'section',
};

export function facetDimensions(): readonly { facet: DocumentFacet; label: string }[] {
  return DIMENSIONS;
}

function facetValueNodes(store: Store, facet: DocumentFacet): LibraryNode[] {
  const vocabKind = FACET_VOCAB[facet];
  const labels =
    vocabKind === undefined ? new Map<string, string>() : vocabLabels(store, vocabKind);
  return facetCounts(store, facet)
    .map((entry) => ({
      kind: 'facetValue' as const,
      facet,
      value: entry.value,
      label:
        labels.get(entry.value) === undefined
          ? entry.value
          : `${labels.get(entry.value)} (${entry.value})`,
      count: entry.count,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Children of a library node (undefined = root). Documents under a
 * facet value are capped at `limit` (the UI's page size).
 */
export function childrenOf(
  store: Store,
  node: LibraryNode | undefined,
  limit = 500,
): LibraryNode[] {
  if (node === undefined) {
    return DIMENSIONS.map((d) => ({ kind: 'facet', facet: d.facet, label: d.label }));
  }
  switch (node.kind) {
    case 'facet':
      return facetValueNodes(store, node.facet);
    case 'facetValue':
      return listDocuments(store, { [node.facet]: node.value }, { limit }).map((doc) => ({
        kind: 'document',
        doc,
      }));
    case 'document':
      return listSections(store, node.doc.doc_key).map((section) => ({ kind: 'section', section }));
    case 'section':
      return [];
  }
}
