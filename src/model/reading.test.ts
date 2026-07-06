import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { type Store, openStore } from '../store/engine.ts';
import { buildFixtureDb } from '../store/fixture.ts';
import { readingUriParts, sectionIdFromQuery, sectionMarkdown } from './reading.ts';

const SHA = 'c'.repeat(64);
const DOC = {
  doc_key: 'XU/xu_8_0_um',
  title: 'Kernel User Manual',
  app_code: 'XU',
  bundle_path: 'XU/xu_bundle',
  sections: [
    {
      section_id: 'XU/xu_8_0_um/intro',
      slug: 'intro',
      title: 'Introduction',
      section_path: 'Kernel User Manual > Introduction',
      chunks: ['Kernel is the infrastructure.'],
    },
    {
      section_id: 'XU/xu_8_0_um/rich',
      slug: 'rich',
      title: 'Rich Section',
      section_path: 'Kernel User Manual > Rich Section',
      chunks: [
        [
          'Intro prose.',
          '',
          '[↑ Back to Contents](#contents)',
          '',
          '_[Table 1 (extracted to CSV)](tables/table-01.csv)_',
          '',
          `![](${SHA}.png)`,
          '',
          '_[Audience — shared boilerplate](_shared/boilerplate/bp-1.md)_',
        ].join('\n'),
      ],
    },
  ],
};

describe('sectionMarkdown', () => {
  let dir: string;
  let store: Store;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'atlas-reading-'));
    const path = join(dir, 'fixture.db');
    buildFixtureDb(path, [DOC]);
    store = openStore(path);
  });
  after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('renders a titled markdown page with provenance footer', () => {
    const markdown = sectionMarkdown(store, 'XU/xu_8_0_um/intro');
    assert.ok(markdown);
    assert.ok(markdown.startsWith('# Introduction\n'));
    assert.ok(markdown.includes('Kernel is the infrastructure.'));
    // Citation discipline (proposal §3.5): the section carries its own id.
    assert.ok(markdown.includes('vdocs://section/XU/xu_8_0_um/intro'));
  });

  it('returns undefined for an unknown section', () => {
    assert.equal(sectionMarkdown(store, 'nope'), undefined);
  });

  it('always strips nav chrome and degrades CAS images visibly', () => {
    const markdown = sectionMarkdown(store, 'XU/xu_8_0_um/rich');
    assert.ok(markdown);
    assert.ok(!markdown.includes('[↑ Back to Contents](#contents)'), 'chrome stripped');
    assert.ok(markdown.includes('figure unavailable'), 'image degrades to a note');
    assert.ok(markdown.includes('tables/table-01.csv'), 'table link kept without a loader');
  });

  it('hydrates tables and boilerplate through doc-scoped loaders', () => {
    const markdown = sectionMarkdown(store, 'XU/xu_8_0_um/rich', {
      loadDocFile: (bundlePath, rel) =>
        bundlePath === 'XU/xu_bundle' && rel === 'tables/table-01.csv'
          ? 'Field,Meaning\nNAME,label\n'
          : undefined,
      loadShared: (rel) =>
        rel === '_shared/boilerplate/bp-1.md' ? 'Shared audience text.' : undefined,
      resolveAsset: (name) => `atlas-asset:/${name}`,
    });
    assert.ok(markdown);
    assert.ok(markdown.includes('| Field | Meaning |'), 'table hydrated');
    assert.ok(markdown.includes('> Shared audience text.'), 'boilerplate inlined');
    assert.ok(markdown.includes(`atlas-asset:/${SHA}.png`), 'image resolved');
  });
});

describe('readingUriParts', () => {
  it('builds a preview-friendly virtual path and query from a section id', () => {
    const parts = readingUriParts('XU/xu_8_0_um/intro');
    assert.equal(parts.path, '/XU/xu_8_0_um/intro.md');
    assert.equal(parts.query, 'section=XU%2Fxu_8_0_um%2Fintro');
  });

  it('recovers the section id from the query', () => {
    const parts = readingUriParts('XU/xu_8_0_um/intro');
    assert.equal(sectionIdFromQuery(parts.query), 'XU/xu_8_0_um/intro');
  });

  it('returns undefined for a query without a section', () => {
    assert.equal(sectionIdFromQuery('other=1'), undefined);
  });
});
