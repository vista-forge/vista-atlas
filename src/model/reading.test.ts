import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { type Store, openStore } from '../store/engine.ts';
import { buildFixtureDb } from '../store/fixture.ts';
import { readingUriParts, sectionIdFromQuery, sectionMarkdown } from './reading.ts';

const DOC = {
  doc_key: 'XU/xu_8_0_um',
  title: 'Kernel User Manual',
  app_code: 'XU',
  sections: [
    {
      section_id: 'XU/xu_8_0_um/intro',
      slug: 'intro',
      title: 'Introduction',
      section_path: 'Kernel User Manual > Introduction',
      chunks: ['Kernel is the infrastructure.'],
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
