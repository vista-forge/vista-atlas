import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { type Store, openStore } from '../store/engine.ts';
import { buildFixtureDb } from '../store/fixture.ts';
import {
  escapeFtsQuery,
  facetCounts,
  getDocument,
  joinChunkParts,
  listDocuments,
  listSections,
  searchChunks,
  sectionText,
} from './queries.ts';

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
        chunks: ['Kernel is the VistA infrastructure foundation.'],
      },
      {
        section_id: 'XU/xu_8_0_um/menus',
        slug: 'menus',
        title: 'Menu Manager',
        seq: 1,
        chunks: ['MenuMan governs option navigation and zebra parameters.'],
      },
    ],
  },
  {
    doc_key: 'XU/xu_7_0_um',
    title: 'Kernel User Manual v7',
    app_code: 'XU',
    app_name: 'Kernel',
    doc_type: 'UM',
    section: 'Infrastructure',
    pub_year: '2015',
    is_latest: 0,
    sections: [
      {
        section_id: 'XU/xu_7_0_um/intro',
        slug: 'intro',
        title: 'Introduction',
        seq: 0,
        chunks: ['Older kernel manual mentioning zebra parameters.'],
      },
    ],
  },
  {
    doc_key: 'OR/or_3_0_tm',
    title: 'CPRS Order Entry Technical Manual',
    app_code: 'OR',
    app_name: 'Order Entry',
    doc_type: 'TM',
    section: 'Clinical',
    pub_year: '2019',
    is_latest: 1,
    sections: [
      {
        section_id: 'OR/or_3_0_tm/rpcs',
        slug: 'rpcs',
        title: 'RPC Reference',
        seq: 0,
        chunks: ['ORWPT SELECT returns patient demographics.'],
      },
    ],
  },
];

describe('queries', () => {
  let dir: string;
  let store: Store;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'atlas-queries-'));
    const path = join(dir, 'fixture.db');
    buildFixtureDb(path, DOCS);
    store = openStore(path);
  });
  after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  describe('listDocuments', () => {
    it('returns every document ordered by title', () => {
      const docs = listDocuments(store);
      assert.deepEqual(
        docs.map((d) => d.doc_key),
        ['OR/or_3_0_tm', 'XU/xu_8_0_um', 'XU/xu_7_0_um'],
      );
    });

    const filterCases = [
      { name: 'app_code', filters: { app_code: 'OR' }, expect: ['OR/or_3_0_tm'] },
      { name: 'doc_type', filters: { doc_type: 'UM' }, expect: ['XU/xu_8_0_um', 'XU/xu_7_0_um'] },
      { name: 'pub_year', filters: { pub_year: '2015' }, expect: ['XU/xu_7_0_um'] },
      { name: 'section', filters: { section: 'Clinical' }, expect: ['OR/or_3_0_tm'] },
      {
        name: 'latestOnly',
        filters: { latestOnly: true },
        expect: ['OR/or_3_0_tm', 'XU/xu_8_0_um'],
      },
      {
        name: 'combined',
        filters: { app_code: 'XU', latestOnly: true },
        expect: ['XU/xu_8_0_um'],
      },
    ];
    for (const tc of filterCases) {
      it(`filters by ${tc.name}`, () => {
        assert.deepEqual(
          listDocuments(store, tc.filters).map((d) => d.doc_key),
          tc.expect,
        );
      });
    }

    it('honors limit and offset', () => {
      const page = listDocuments(store, {}, { limit: 1, offset: 1 });
      assert.deepEqual(
        page.map((d) => d.doc_key),
        ['XU/xu_8_0_um'],
      );
    });
  });

  describe('facetCounts', () => {
    it('counts values for a facet', () => {
      assert.deepEqual(facetCounts(store, 'app_code'), [
        { value: 'XU', count: 2 },
        { value: 'OR', count: 1 },
      ]);
    });

    it('applies other filters but not the facet its own', () => {
      assert.deepEqual(facetCounts(store, 'app_code', { app_code: 'OR', doc_type: 'UM' }), [
        { value: 'XU', count: 2 },
      ]);
    });

    it('rejects an unknown facet', () => {
      assert.throws(
        () => facetCounts(store, 'source_url' as unknown as Parameters<typeof facetCounts>[2]),
        /facet/,
      );
    });
  });

  describe('getDocument / listSections', () => {
    it('returns one document with detail columns', () => {
      const doc = getDocument(store, 'XU/xu_8_0_um');
      assert.equal(doc?.title, 'Kernel User Manual');
      assert.equal(doc?.section_count, 2);
      assert.ok(doc?.source_url);
    });

    it('returns undefined for a missing key', () => {
      assert.equal(getDocument(store, 'nope'), undefined);
    });

    it('lists sections in seq order', () => {
      assert.deepEqual(
        listSections(store, 'XU/xu_8_0_um').map((s) => s.slug),
        ['intro', 'menus'],
      );
    });
  });

  describe('joinChunkParts (producer one-block-overlap grammar)', () => {
    it('returns a single part unchanged', () => {
      assert.equal(joinChunkParts(['only part']), 'only part');
    });

    it('drops the carried overlap block on a structural boundary', () => {
      // Producer: windows are "\n\n"-joined blocks; the last block of a
      // window repeats as the first block of the next.
      const original = ['block A', 'block B', 'block C', 'block D'];
      const parts = [
        `${original[0]}\n\n${original[1]}`,
        `${original[1]}\n\n${original[2]}\n\n${original[3]}`,
      ];
      assert.equal(joinChunkParts(parts), original.join('\n\n'));
    });

    it('does not duplicate a single-block window carried whole', () => {
      const parts = ['block A\n\nblock B', 'block B'];
      assert.equal(joinChunkParts(parts), 'block A\n\nblock B');
    });

    it('joins hard-split parts (no overlap) without dropping text', () => {
      const parts = ['giant table row 1', 'giant table row 2'];
      assert.equal(joinChunkParts(parts), 'giant table row 1\ngiant table row 2');
    });

    it('reconstructs a mixed structural + hard boundary sequence', () => {
      const parts = ['A\n\nB', 'B\n\nC', 'no-overlap tail'];
      assert.equal(joinChunkParts(parts), 'A\n\nB\n\nC\nno-overlap tail');
    });
  });

  describe('sectionText', () => {
    it('returns the section body from its chunks', () => {
      assert.equal(
        sectionText(store, 'XU/xu_8_0_um/intro'),
        'Kernel is the VistA infrastructure foundation.',
      );
    });

    it('returns undefined for an unknown section', () => {
      assert.equal(sectionText(store, 'nope'), undefined);
    });
  });

  describe('searchChunks', () => {
    it('finds ranked hits with citation-ready ids and a snippet', () => {
      const hits = searchChunks(store, 'zebra');
      assert.equal(hits.length, 2);
      const first = hits[0];
      assert.ok(first);
      assert.ok(first.doc_key.startsWith('XU/'));
      assert.ok(first.section_id.length > 0);
      assert.ok(first.snippet.includes('zebra'));
      assert.equal(typeof first.rank, 'number');
    });

    it('restricts scope=name to document titles', () => {
      assert.equal(searchChunks(store, 'zebra', { scope: 'name' }).length, 0);
      assert.ok(searchChunks(store, 'CPRS', { scope: 'name' }).length > 0);
    });

    it('restricts scope=headings to section titles and paths', () => {
      const hits = searchChunks(store, 'menu', { scope: 'headings' });
      assert.deepEqual(
        hits.map((h) => h.section_id),
        ['XU/xu_8_0_um/menus'],
      );
    });

    it('applies document filters (latestOnly + app_code)', () => {
      const hits = searchChunks(store, 'zebra', { filters: { latestOnly: true } });
      assert.deepEqual(
        hits.map((h) => h.doc_key),
        ['XU/xu_8_0_um'],
      );
      assert.equal(searchChunks(store, 'zebra', { filters: { app_code: 'OR' } }).length, 0);
    });

    it('honors the limit option', () => {
      assert.equal(searchChunks(store, 'zebra', { limit: 1 }).length, 1);
    });

    it('survives FTS metacharacters in the query', () => {
      for (const q of ['zebra"', 'a AND (b', 'x NEAR/3 y', '^DIC(']) {
        assert.doesNotThrow(() => searchChunks(store, q));
      }
    });

    it('returns no hits for an empty query', () => {
      assert.deepEqual(searchChunks(store, '   '), []);
    });
  });

  describe('escapeFtsQuery', () => {
    const cases = [
      { raw: 'kernel menu', escaped: '"kernel" "menu"' },
      { raw: '^DIC(', escaped: '"^DIC("' },
      { raw: 'say "hi"', escaped: '"say" """hi"""' },
      { raw: '  ', escaped: '' },
    ];
    for (const tc of cases) {
      it(`escapes ${JSON.stringify(tc.raw)}`, () => {
        assert.equal(escapeFtsQuery(tc.raw), tc.escaped);
      });
    }
  });
});
