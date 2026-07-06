import { strict as assert } from 'node:assert';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { loadProducerManifest, parseProducerManifest } from './manifest.ts';

const VALID = {
  artifact: 'vdocs-data',
  tag: 'data-v1',
  read_schema_version: '1.5',
  corpus_content_hash: 'a'.repeat(64),
  files: {
    'index.db': { bytes: 1000, sha256: 'b'.repeat(64) },
    'CORPUS.md': { bytes: 10, sha256: 'c'.repeat(64) },
  },
};

describe('parseProducerManifest', () => {
  it('parses a valid manifest', () => {
    const manifest = parseProducerManifest(VALID);
    assert.equal(manifest.tag, 'data-v1');
    assert.equal(manifest.read_schema_version, '1.5');
    assert.equal(manifest.files['index.db']?.bytes, 1000);
  });

  const bad = [
    { name: 'not an object', input: 'nope', message: /not an object/ },
    { name: 'missing artifact', input: { ...VALID, artifact: undefined }, message: /artifact/ },
    { name: 'missing tag', input: { ...VALID, tag: '' }, message: /tag/ },
    {
      name: 'malformed read_schema_version',
      input: { ...VALID, read_schema_version: 'v1' },
      message: /read_schema_version/,
    },
    {
      name: 'malformed corpus hash',
      input: { ...VALID, corpus_content_hash: 'xyz' },
      message: /corpus_content_hash/,
    },
    { name: 'empty files', input: { ...VALID, files: {} }, message: /files/ },
    {
      name: 'file entry missing sha',
      input: { ...VALID, files: { 'index.db': { bytes: 1 } } },
      message: /sha256/,
    },
  ];
  for (const tc of bad) {
    it(`rejects ${tc.name}`, () => {
      assert.throws(() => parseProducerManifest(tc.input), tc.message);
    });
  }
});

// The real producer manifest in the local release staging copy, when present.
const REAL_MANIFEST = join(
  process.env.VDOCS_DATA_HOME ?? join(process.env.HOME ?? '', 'data/vdocs'),
  'dist/vdocs-data-v1.manifest.json',
);

describe('the real vdocs-data-v1 producer manifest', () => {
  it('parses and pins index.db', { skip: !existsSync(REAL_MANIFEST) }, () => {
    const manifest = loadProducerManifest(REAL_MANIFEST);
    assert.equal(manifest.artifact, 'vdocs-data');
    assert.equal(manifest.read_schema_version, '1.5');
    assert.ok((manifest.files['index.db']?.bytes ?? 0) > 100_000_000);
  });
});
