import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { installDataRelease } from './bundle.ts';
import type { ReleaseRecord } from './release.ts';
import { buildTarGz } from './tarfixture.ts';

const sha = (data: Buffer | string): string => createHash('sha256').update(data).digest('hex');

const HASH = 'a'.repeat(64); // corpus_content_hash

function fixtureRelease(options: { corruptInnerPin?: boolean; recordHash?: string } = {}): {
  record: ReleaseRecord;
  fetchImpl: typeof fetch;
  requested: string[];
} {
  const bundle = buildTarGz([
    { name: 'data-t1/index.db', data: 'index-db-bytes' },
    { name: 'data-t1/gold/CORPUS.md', data: '# corpus\n' },
  ]);
  const manifest = Buffer.from(
    JSON.stringify({
      artifact: 'vdocs-data',
      tag: 't1',
      read_schema_version: '1.5',
      corpus_content_hash: HASH,
      files: {
        'index.db': { bytes: 14, sha256: sha('index-db-bytes') },
        'CORPUS.md': {
          bytes: 9,
          sha256: options.corruptInnerPin === true ? 'd'.repeat(64) : sha('# corpus\n'),
        },
      },
    }),
  );
  const record: ReleaseRecord = {
    repo: 'o/r',
    tag: 't1',
    content_hash: options.recordHash ?? HASH,
    files: {
      'data-t1.tar.gz': { bytes: bundle.length, sha256: sha(bundle) },
      'data-t1.manifest.json': { bytes: manifest.length, sha256: sha(manifest) },
    },
  };
  const requested: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    requested.push(String(url));
    const body = String(url).endsWith('.tar.gz') ? bundle : manifest;
    return new Response(new Uint8Array(body));
  }) as typeof fetch;
  return { record, fetchImpl, requested };
}

describe('installDataRelease', () => {
  let dir: string;
  let n = 0;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'atlas-bundle-'));
  });
  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const dest = (): string => {
    n += 1;
    return join(dir, `dest${n}`);
  };

  it('fetches, extracts, verifies, and reports the installed paths', async () => {
    const { record, fetchImpl } = fixtureRelease();
    const destDir = dest();
    const result = await installDataRelease({
      record,
      bundleAsset: 'data-t1.tar.gz',
      manifestAsset: 'data-t1.manifest.json',
      destDir,
      fetchImpl,
    });
    assert.equal(result.status, 'installed');
    assert.equal(result.indexDb, join(destDir, 'data-t1/index.db'));
    assert.equal(readFileSync(result.indexDb, 'utf8'), 'index-db-bytes');
    assert.equal(readFileSync(join(destDir, 'data-t1/gold/CORPUS.md'), 'utf8'), '# corpus\n');
    assert.equal(result.manifest.read_schema_version, '1.5');
  });

  it('is idempotent: a verified install makes no bundle request', async () => {
    const { record, fetchImpl } = fixtureRelease();
    const destDir = dest();
    const options = {
      record,
      bundleAsset: 'data-t1.tar.gz',
      manifestAsset: 'data-t1.manifest.json',
      destDir,
    };
    await installDataRelease({ ...options, fetchImpl });
    const second = fixtureRelease();
    const result = await installDataRelease({ ...options, fetchImpl: second.fetchImpl });
    assert.equal(result.status, 'already-verified');
    assert.ok(
      !second.requested.some((url) => url.endsWith('.tar.gz')),
      `bundle re-downloaded: ${second.requested.join(', ')}`,
    );
  });

  it('rejects a record/manifest corpus-hash drift and installs nothing', async () => {
    const { record, fetchImpl } = fixtureRelease({ recordHash: 'e'.repeat(64) });
    const destDir = dest();
    await assert.rejects(
      installDataRelease({
        record,
        bundleAsset: 'data-t1.tar.gz',
        manifestAsset: 'data-t1.manifest.json',
        destDir,
        fetchImpl,
      }),
      /corpus_content_hash/,
    );
    assert.ok(!existsSync(join(destDir, 'data-t1')));
  });

  it('rejects an extracted file failing its manifest pin and installs nothing', async () => {
    const { record, fetchImpl } = fixtureRelease({ corruptInnerPin: true });
    const destDir = dest();
    await assert.rejects(
      installDataRelease({
        record,
        bundleAsset: 'data-t1.tar.gz',
        manifestAsset: 'data-t1.manifest.json',
        destDir,
        fetchImpl,
      }),
      /CORPUS\.md/,
    );
    assert.ok(!existsSync(join(destDir, 'data-t1')));
  });
});
