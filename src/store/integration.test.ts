import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { facetCounts, getDocument, searchChunks, sectionText } from '../model/queries.ts';
import { checkIndexDb } from './contract.ts';
import { openStore } from './engine.ts';
import { loadReleaseRecord } from './release.ts';
import { verifyFile } from './verify.ts';

// Integration: the real published data-v1 artifacts, when the local
// release staging copy has them (skipped elsewhere, e.g. CI). This is
// the published-release path — never the live lake (project rule): the
// staging copies are verified against the committed release record
// before a single query runs.
const DIST = join(
  process.env.VDOCS_DATA_HOME ?? join(process.env.HOME ?? '', 'data/vdocs'),
  'dist',
);
const REAL_DB = join(DIST, 'index.db');
const REAL_MANIFEST = join(DIST, 'vdocs-data-v1.manifest.json');
const RECORD = new URL('../../contracts/releases/vdocs-data-v1.json', import.meta.url).pathname;

describe('the real vdocs data-v1 release', () => {
  it(
    'verifies, satisfies the contract, and answers the MVP queries',
    { skip: !(existsSync(REAL_DB) && existsSync(REAL_MANIFEST)) },
    async () => {
      const record = loadReleaseRecord(RECORD);

      // The local producer manifest must BE the pinned release asset…
      const manifestOk = await verifyFile(
        REAL_MANIFEST,
        record.files['vdocs-data-v1.manifest.json'] ?? { bytes: -1, sha256: '0'.repeat(64) },
      );
      assert.ok(
        manifestOk.ok,
        `manifest verification: ${'reason' in manifestOk ? manifestOk.reason : 'ok'}`,
      );

      // …and the manifest's own per-file pins then verify the db.
      const manifest = JSON.parse(readFileSync(REAL_MANIFEST, 'utf8')) as {
        read_schema_version: string;
        corpus_content_hash: string;
        files: Record<string, { bytes: number; sha256: string }>;
      };
      const dbPin = manifest.files['index.db'];
      assert.ok(dbPin, 'manifest pins index.db');
      const dbOk = await verifyFile(REAL_DB, dbPin);
      assert.ok(dbOk.ok, `index.db verification: ${'reason' in dbOk ? dbOk.reason : 'ok'}`);
      assert.equal(manifest.corpus_content_hash, record.content_hash);

      const store = openStore(REAL_DB);
      try {
        const report = checkIndexDb(store, {
          readSchemaVersion: '1.5',
          corpusContentHash: record.content_hash ?? '',
        });
        assert.deepEqual(report.problems, []);
        assert.equal(report.ok, true);

        // The P0 spike queries, reproduced through the query layer.
        const hits = searchChunks(store, 'kaajee', { limit: 5 });
        assert.ok(hits.length > 0, 'FTS search finds kaajee');
        const first = hits[0];
        assert.ok(first);
        assert.ok(getDocument(store, first.doc_key), 'hit resolves to a document');
        const body = sectionText(store, first.section_id);
        assert.ok(body !== undefined && body.length > 0, 'hit section reconstructs');

        const apps = facetCounts(store, 'app_code');
        assert.ok(apps.length > 50, `app facet is populated (${apps.length})`);
      } finally {
        store.close();
      }
    },
  );
});
