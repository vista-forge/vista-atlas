import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { type Store, openStore } from '../store/engine.ts';
import { buildFixtureDb } from '../store/fixture.ts';
import {
  bundlePath,
  candidates,
  docTOC,
  facetCounts,
  preview,
  sectionText,
  vocab,
} from './core.ts';

const DOCS = [
  {
    doc_key: 'XU/xu_8_0_um',
    title: 'Kernel Version 8.0 User Manual',
    app_code: 'XU',
    app_name: 'Kernel',
    doc_type: 'UM',
    doc_label: 'User Manual',
    section: 'INF',
    app_user: 'technical',
    pub_year: '2019',
    bundle_path: 'XU/xu_um',
    sections: [
      {
        section_id: 'XU/xu_8_0_um/contents',
        slug: 'contents',
        title: 'Contents',
        kind: 'hollow',
        seq: 0,
        chunks: [],
      },
      {
        section_id: 'XU/xu_8_0_um/ch1',
        slug: 'ch1',
        title: 'Chapter One',
        kind: 'container',
        level: 1,
        seq: 1,
        chunks: [],
      },
      {
        section_id: 'XU/xu_8_0_um/intro',
        slug: 'intro',
        title: 'Introduction',
        kind: 'ok',
        level: 2,
        seq: 2,
        chunks: ['Kernel intro. [↑ Back to Contents](#contents)', 'Second part text.'],
        tableChunks: ['FIELD VALUE flattened searchable table body zebra'],
      },
      {
        section_id: 'XU/xu_8_0_um/empty',
        slug: 'empty',
        title: '',
        kind: 'ok',
        seq: 3,
        chunks: ['Untitled section body.'],
      },
    ],
  },
  {
    doc_key: 'OR/or_3_0_tm',
    title: 'CPRS Order Entry Technical Manual (OR*3.0*100)',
    app_code: 'OR',
    app_name: 'Order Entry',
    doc_type: 'TM',
    doc_label: 'Technical Manual',
    section: 'CLI',
    app_user: 'developer',
    pub_year: '2020',
    product_abbr: 'CPRS',
    product_full: 'Computerized Patient Record System',
    sections: [
      {
        section_id: 'OR/or_3_0_tm/rpcs',
        slug: 'rpcs',
        title: 'RPC Reference',
        kind: 'ok',
        seq: 0,
        chunks: ['ORWPT SELECT returns patient demographics.'],
      },
    ],
  },
  {
    doc_key: 'XU/xu_7_0_um',
    title: 'Kernel v7 User Manual',
    app_code: 'XU',
    app_name: 'Kernel',
    doc_type: 'UM',
    section: 'INF',
    is_latest: 0, // superseded — must be invisible everywhere
    sections: [
      {
        section_id: 'XU/xu_7_0_um/intro',
        slug: 'intro',
        title: 'Old Intro',
        kind: 'ok',
        seq: 0,
        chunks: ['Old kernel body.'],
      },
    ],
  },
];

const VOCAB = [
  { kind: 'persona', code: 'technical', label: 'Technical', description: 'IT operations staff' },
  { kind: 'section', code: 'INF', label: 'Infrastructure', description: 'VistA infrastructure' },
  {
    kind: 'function_category',
    code: 'Clinical care',
    label: 'Clinical care',
    description: 'Direct patient care',
  },
];

describe('server core (index.go port)', () => {
  let dir: string;
  let store: Store;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'atlas-core-'));
    const path = join(dir, 'fixture.db');
    buildFixtureDb(path, DOCS, { vocab: VOCAB });
    store = openStore(path);
  });
  after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  describe('facetCounts', () => {
    it('counts with the axis relaxed, latest-only', () => {
      assert.deepEqual(facetCounts(store, 'app_code', { sel: {} }), [
        { Value: 'OR', Count: 1 },
        { Value: 'XU', Count: 1 },
      ]);
    });

    it('applies other axes while relaxing the counted one', () => {
      assert.deepEqual(
        facetCounts(store, 'doc_type', { sel: { doc_type: ['TM'], app_user: ['developer'] } }),
        [{ Value: 'TM', Count: 1 }],
      );
    });

    it('throws for an unknown axis', () => {
      assert.throws(() => facetCounts(store, 'doc_key', { sel: {} }), /unknown facet axis/);
    });
  });

  describe('candidates', () => {
    it('lists latest docs ordered by title, with cleaned display titles', () => {
      const docs = candidates(store, { sel: {} });
      assert.deepEqual(
        docs.map((d) => d.DocKey),
        ['OR/or_3_0_tm', 'XU/xu_8_0_um'],
      );
      assert.equal(docs[0]?.Title, 'CPRS Order Entry Technical Manual');
      assert.equal(docs[1]?.Title, 'Kernel User Manual');
      assert.equal(docs[0]?.DocLabel, 'Technical Manual');
      assert.equal(docs[0]?.PkgNS, 'OR');
    });

    it('filters by doc-level FTS (a doc matches if any chunk matches)', () => {
      assert.deepEqual(
        candidates(store, { sel: {}, fts: 'ORWPT' }).map((d) => d.DocKey),
        ['OR/or_3_0_tm'],
      );
    });

    it('search-only table chunks still make their doc findable', () => {
      // The flattened table text is searchable even though it never renders.
      assert.deepEqual(
        candidates(store, { sel: {}, fts: 'zebra' }).map((d) => d.DocKey),
        ['XU/xu_8_0_um'],
      );
    });
  });

  describe('vocab', () => {
    it('assembles abbreviation maps + v_vocab definitions', () => {
      const v = vocab(store);
      assert.equal(v.AppName.XU, 'Kernel');
      assert.equal(v.Namespace.OR, 'Order Entry');
      assert.equal(v.DocType.UM, 'User Manual');
      assert.equal(v.Product.CPRS, 'Computerized Patient Record System');
      assert.equal(v.Persona.technical, 'IT operations staff');
      assert.equal(v.Section.INF, 'VistA infrastructure');
      assert.equal(v.Domain['Clinical care'], 'Direct patient care');
    });
  });

  describe('docTOC', () => {
    it('lists ok+container sections with titles, in seq order', () => {
      assert.deepEqual(docTOC(store, 'XU/xu_8_0_um'), [
        { ID: 'XU/xu_8_0_um/ch1', Title: 'Chapter One', Level: 1 },
        { ID: 'XU/xu_8_0_um/intro', Title: 'Introduction', Level: 2 },
      ]);
    });
  });

  describe('sectionText', () => {
    it('joins parts, strips chrome, and excludes search-only table chunks', () => {
      const text = sectionText(store, 'XU/xu_8_0_um/intro');
      assert.equal(text, 'Kernel intro.\n\nSecond part text.');
      assert.ok(!text.includes('flattened searchable'), 'no #table- chunk in the body');
      assert.ok(!text.includes('Back to Contents'));
    });

    it('drops the producer one-block overlap between parts', () => {
      // split_oversized carries the last block of a window into the next;
      // the reference joined naively — this port dedupes.
      const path = join(dir, 'overlap.db');
      buildFixtureDb(path, [
        {
          doc_key: 'D/d',
          title: 'D',
          app_code: 'D',
          sections: [
            {
              section_id: 'D/d/s',
              slug: 's',
              title: 'S',
              chunks: ['block A\n\nblock B', 'block B\n\nblock C'],
            },
          ],
        },
      ]);
      const s = openStore(path);
      try {
        assert.equal(sectionText(s, 'D/d/s'), 'block A\n\nblock B\n\nblock C');
      } finally {
        s.close();
      }
    });

    it('returns empty for a chunkless container section', () => {
      assert.equal(sectionText(store, 'XU/xu_8_0_um/ch1'), '');
    });
  });

  describe('preview', () => {
    it('reconstructs the latest doc body in section order, chrome-free', () => {
      const text = preview(store, 'XU/xu_8_0_um');
      assert.ok(text.startsWith('Kernel intro.'));
      assert.ok(text.includes('Untitled section body.'));
      assert.ok(!text.includes('flattened searchable'));
      assert.ok(!text.includes('Back to Contents'));
    });
  });

  describe('bundlePath', () => {
    it('returns the gold anchor relpath, empty for unknown docs', () => {
      assert.equal(bundlePath(store, 'XU/xu_8_0_um'), 'XU/xu_um');
      assert.equal(bundlePath(store, 'nope'), '');
    });
  });
});
