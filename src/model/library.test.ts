import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { type Store, openStore } from '../store/engine.ts';
import { buildFixtureDb } from '../store/fixture.ts';
import { childrenOf, facetDimensions } from './library.ts';

const DOCS = [
  {
    doc_key: 'XU/xu_8_0_um',
    title: 'Kernel User Manual',
    app_code: 'XU',
    app_name: 'Kernel',
    doc_type: 'UM',
    section: 'Infrastructure',
    pub_year: '2019',
    is_latest: 1,
    sections: [
      {
        section_id: 'XU/xu_8_0_um/intro',
        slug: 'intro',
        title: 'Introduction',
        seq: 0,
        chunks: ['Kernel intro.'],
      },
      {
        section_id: 'XU/xu_8_0_um/menus',
        slug: 'menus',
        title: 'Menus',
        seq: 1,
        chunks: ['Menus body.'],
      },
    ],
  },
  {
    doc_key: 'OR/or_3_0_tm',
    title: 'CPRS Technical Manual',
    app_code: 'OR',
    app_name: 'Order Entry',
    doc_type: 'TM',
    section: 'Clinical',
    pub_year: '2020',
    is_latest: 1,
    sections: [
      {
        section_id: 'OR/or_3_0_tm/rpcs',
        slug: 'rpcs',
        title: 'RPCs',
        seq: 0,
        chunks: ['RPC list.'],
      },
    ],
  },
];

const VOCAB = [
  { kind: 'doc_type', code: 'UM', label: 'User Manual', description: '' },
  { kind: 'doc_type', code: 'TM', label: 'Technical Manual', description: '' },
];

describe('library tree model', () => {
  let dir: string;
  let store: Store;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'atlas-library-'));
    const path = join(dir, 'fixture.db');
    buildFixtureDb(path, DOCS, { vocab: VOCAB });
    store = openStore(path);
  });
  after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('offers the four facet dimensions at the root', () => {
    const roots = childrenOf(store, undefined);
    assert.deepEqual(
      roots.map((n) => (n.kind === 'facet' ? n.facet : n.kind)),
      ['app_code', 'section', 'doc_type', 'pub_year'],
    );
    assert.deepEqual(
      facetDimensions().map((d) => d.label),
      ['Application', 'Section', 'Document type', 'Year'],
    );
  });

  it('lists facet values with counts under a dimension', () => {
    const [appFacet] = childrenOf(store, undefined);
    assert.ok(appFacet && appFacet.kind === 'facet');
    const values = childrenOf(store, appFacet);
    assert.deepEqual(
      values.map((n) => (n.kind === 'facetValue' ? { v: n.value, c: n.count } : n.kind)),
      [
        { v: 'OR', c: 1 },
        { v: 'XU', c: 1 },
      ],
    );
  });

  it('labels doc_type values from the published vocab', () => {
    const docType = childrenOf(store, undefined).find(
      (n) => n.kind === 'facet' && n.facet === 'doc_type',
    );
    assert.ok(docType);
    const labels = childrenOf(store, docType).map((n) =>
      n.kind === 'facetValue' ? n.label : n.kind,
    );
    assert.deepEqual(labels.sort(), ['Technical Manual (TM)', 'User Manual (UM)']);
  });

  it('lists documents under a facet value', () => {
    const docs = childrenOf(store, {
      kind: 'facetValue',
      facet: 'app_code',
      value: 'XU',
      label: 'XU',
      count: 1,
    });
    assert.deepEqual(
      docs.map((n) => (n.kind === 'document' ? n.doc.doc_key : n.kind)),
      ['XU/xu_8_0_um'],
    );
  });

  it('lists sections in order under a document', () => {
    const [doc] = childrenOf(store, {
      kind: 'facetValue',
      facet: 'app_code',
      value: 'XU',
      label: 'XU',
      count: 1,
    });
    assert.ok(doc && doc.kind === 'document');
    const sections = childrenOf(store, doc);
    assert.deepEqual(
      sections.map((n) => (n.kind === 'section' ? n.section.slug : n.kind)),
      ['intro', 'menus'],
    );
  });

  it('a section node has no children', () => {
    const node = {
      kind: 'section' as const,
      section: {
        section_id: 'XU/xu_8_0_um/intro',
        doc_key: 'XU/xu_8_0_um',
        slug: 'intro',
        title: 'Introduction',
        level: 1,
        toc_level: 1,
        kind: 'ok',
        searchable: 1,
        section_path: 'p',
        seq: 0,
      },
    };
    assert.deepEqual(childrenOf(store, node), []);
  });
});
