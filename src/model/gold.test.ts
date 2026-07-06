import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { makeGoldLoaders } from './gold.ts';

describe('makeGoldLoaders', () => {
  let goldRoot: string;
  before(() => {
    goldRoot = mkdtempSync(join(tmpdir(), 'atlas-gold-'));
    mkdirSync(join(goldRoot, 'consolidated/XU/xu_bundle/tables'), { recursive: true });
    writeFileSync(join(goldRoot, 'consolidated/XU/xu_bundle/tables/table-01.csv'), 'a,b\n1,2\n');
    mkdirSync(join(goldRoot, '_shared/boilerplate'), { recursive: true });
    writeFileSync(join(goldRoot, '_shared/boilerplate/bp-1.md'), 'Shared text.');
  });
  after(() => {
    rmSync(goldRoot, { recursive: true, force: true });
  });

  it('loads a doc-bundle file through bundle_path', () => {
    const loaders = makeGoldLoaders(goldRoot);
    assert.equal(loaders.loadDocFile('XU/xu_bundle', 'tables/table-01.csv'), 'a,b\n1,2\n');
  });

  it('loads a shared boilerplate file', () => {
    const loaders = makeGoldLoaders(goldRoot);
    assert.equal(loaders.loadShared('_shared/boilerplate/bp-1.md'), 'Shared text.');
  });

  it('returns undefined for missing files', () => {
    const loaders = makeGoldLoaders(goldRoot);
    assert.equal(loaders.loadDocFile('XU/xu_bundle', 'tables/nope.csv'), undefined);
    assert.equal(loaders.loadShared('_shared/boilerplate/nope.md'), undefined);
  });

  const hostile = [
    ['XU/xu_bundle', '../../../_shared/boilerplate/bp-1.md'],
    ['../..', 'tables/table-01.csv'],
    ['XU/xu_bundle', '/etc/passwd'],
  ] as const;
  for (const [bundle, rel] of hostile) {
    it(`refuses traversal (${bundle} :: ${rel})`, () => {
      const loaders = makeGoldLoaders(goldRoot);
      assert.equal(loaders.loadDocFile(bundle, rel), undefined);
    });
  }

  it('refuses shared paths outside _shared', () => {
    const loaders = makeGoldLoaders(goldRoot);
    assert.equal(loaders.loadShared('consolidated/XU/xu_bundle/tables/table-01.csv'), undefined);
    assert.equal(loaders.loadShared('../outside.md'), undefined);
  });
});
