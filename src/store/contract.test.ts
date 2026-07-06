import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { INDEX_DB_VIEWS, checkIndexDb } from './contract.ts';
import { type Store, openStore } from './engine.ts';
import { FIXTURE_META, buildFixtureDb } from './fixture.ts';

const DOC = {
  doc_key: 'XU/xu_8_0_um',
  title: 'Kernel User Manual',
  app_code: 'XU',
  sections: [
    {
      section_id: 'XU/xu_8_0_um/intro',
      slug: 'intro',
      title: 'Introduction',
      chunks: ['Kernel is the VistA infrastructure package.'],
    },
  ],
};

function openFixture(dir: string, name: string, options = {}): Store {
  const path = join(dir, name);
  buildFixtureDb(path, [DOC], options);
  return openStore(path);
}

describe('checkIndexDb', () => {
  let dir: string;
  const opened: Store[] = [];
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'atlas-contract-'));
  });
  after(() => {
    for (const store of opened) {
      store.close();
    }
    rmSync(dir, { recursive: true, force: true });
  });
  const open = (name: string, options = {}): Store => {
    const store = openFixture(dir, name, options);
    opened.push(store);
    return store;
  };

  it('passes a conforming fixture at the expected version + hash', () => {
    const store = open('ok.db');
    const report = checkIndexDb(store, {
      readSchemaVersion: '1.5',
      corpusContentHash: FIXTURE_META.corpus_content_hash,
    });
    assert.deepEqual(report, { ok: true, problems: [] });
  });

  it('accepts a db with a higher MINOR (additive contract)', () => {
    const store = open('minor-up.db', { meta: { read_schema_version: '1.6' } });
    assert.equal(checkIndexDb(store, { readSchemaVersion: '1.5' }).ok, true);
  });

  const versionCases = [
    { name: 'MAJOR above', db: '2.0', problem: /read_schema_version/ },
    { name: 'MAJOR below', db: '0.9', problem: /read_schema_version/ },
    { name: 'MINOR below required', db: '1.4', problem: /read_schema_version/ },
    { name: 'malformed version', db: 'not-semver', problem: /read_schema_version/ },
  ];
  for (const tc of versionCases) {
    it(`rejects ${tc.name} (db=${tc.db})`, () => {
      const store = open(`v-${tc.db}.db`, { meta: { read_schema_version: tc.db } });
      const report = checkIndexDb(store, { readSchemaVersion: '1.5' });
      assert.equal(report.ok, false);
      assert.ok(
        report.problems.some((p) => tc.problem.test(p)),
        `problems mention read_schema_version: ${report.problems.join('; ')}`,
      );
    });
  }

  it('rejects a corpus_content_hash mismatch', () => {
    const store = open('hash.db');
    const report = checkIndexDb(store, {
      readSchemaVersion: '1.5',
      corpusContentHash: 'a'.repeat(64),
    });
    assert.equal(report.ok, false);
    assert.ok(report.problems.some((p) => p.includes('corpus_content_hash')));
  });

  it('reports a missing contract view', () => {
    const store = open('noview.db', { omitViews: ['v_vocab'] });
    const report = checkIndexDb(store, { readSchemaVersion: '1.5' });
    assert.equal(report.ok, false);
    assert.ok(report.problems.some((p) => p.includes('missing view v_vocab')));
  });

  it('reports a view missing a bound column', () => {
    const store = open('nocol.db', {
      viewSql: {
        v_entities: 'CREATE VIEW v_entities AS SELECT entity_id, type FROM entities',
      },
    });
    const report = checkIndexDb(store, { readSchemaVersion: '1.5' });
    assert.equal(report.ok, false);
    assert.ok(
      report.problems.some((p) => p.includes('v_entities') && p.includes('canonical_name')),
    );
  });

  it('reports a missing chunks_fts table', () => {
    const store = open('nofts.db', { omitFts: true });
    const report = checkIndexDb(store, { readSchemaVersion: '1.5' });
    assert.equal(report.ok, false);
    assert.ok(report.problems.some((p) => p.includes('chunks_fts')));
  });

  it('reports absent meta pins', () => {
    const store = open('nometa.db', {
      meta: { read_schema_version: '', corpus_content_hash: '' },
    });
    const report = checkIndexDb(store, {
      readSchemaVersion: '1.5',
      corpusContentHash: 'f'.repeat(64),
    });
    assert.equal(report.ok, false);
    assert.ok(report.problems.length >= 2);
  });

  it('publishes the bound view surface for consumers', () => {
    assert.ok(Object.keys(INDEX_DB_VIEWS).includes('v_documents'));
    assert.ok(INDEX_DB_VIEWS.v_chunks?.includes('text'));
  });
});
