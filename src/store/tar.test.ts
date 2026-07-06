import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { extractTarGz } from './tar.ts';
import { buildTarGz } from './tarfixture.ts';

describe('extractTarGz', () => {
  let dir: string;
  let n = 0;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'atlas-tar-'));
  });
  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  /** Write a fixture archive and give the extraction its own dest dir. */
  const setup = (archive: Buffer): { archivePath: string; dest: string } => {
    n += 1;
    const archivePath = join(dir, `a${n}.tar.gz`);
    writeFileSync(archivePath, archive);
    return { archivePath, dest: join(dir, `out${n}`) };
  };

  it('extracts regular files, creating parent directories', async () => {
    // The producer bundle has no directory entries — parents must be implied.
    const { archivePath, dest } = setup(
      buildTarGz([
        { name: 'root/index.db', data: 'db-bytes' },
        { name: 'root/gold/CORPUS.md', data: '# corpus' },
      ]),
    );
    const entries = await extractTarGz(archivePath, dest);
    assert.deepEqual(
      entries.map((e) => ({ path: e.path, bytes: e.bytes })),
      [
        { path: 'root/index.db', bytes: 8 },
        { path: 'root/gold/CORPUS.md', bytes: 8 },
      ],
    );
    assert.equal(readFileSync(join(dest, 'root/gold/CORPUS.md'), 'utf8'), '# corpus');
  });

  it('handles content that is not a multiple of the block size', async () => {
    const text = 'x'.repeat(513);
    const { archivePath, dest } = setup(buildTarGz([{ name: 'big.txt', data: text }]));
    await extractTarGz(archivePath, dest);
    assert.equal(readFileSync(join(dest, 'big.txt'), 'utf8'), text);
  });

  it('joins the ustar prefix field onto the name', async () => {
    const prefix = 'root/gold/documents/some-very-long-application-directory';
    const { archivePath, dest } = setup(buildTarGz([{ name: 'manual.md', prefix, data: 'body' }]));
    const entries = await extractTarGz(archivePath, dest);
    assert.equal(entries[0]?.path, `${prefix}/manual.md`);
    assert.ok(existsSync(join(dest, prefix, 'manual.md')));
  });

  it('honors a PAX path override', async () => {
    const long = `root/gold/${'d'.repeat(120)}/file.md`;
    const { archivePath, dest } = setup(
      buildTarGz([{ name: 'root/gold/truncated.md', pax: { path: long }, data: 'pax body' }]),
    );
    const entries = await extractTarGz(archivePath, dest);
    assert.equal(entries[0]?.path, long);
    assert.equal(readFileSync(join(dest, long), 'utf8'), 'pax body');
  });

  it('creates directory entries without reporting them as files', async () => {
    const { archivePath, dest } = setup(
      buildTarGz([
        { name: 'root/sub/', type: '5' },
        { name: 'root/sub/file.txt', data: 'hi' },
      ]),
    );
    const entries = await extractTarGz(archivePath, dest);
    assert.deepEqual(
      entries.map((e) => e.path),
      ['root/sub/file.txt'],
    );
  });

  it('applies a filter without touching excluded files', async () => {
    const { archivePath, dest } = setup(
      buildTarGz([
        { name: 'root/keep.txt', data: 'keep' },
        { name: 'root/skip.txt', data: 'skip' },
      ]),
    );
    const entries = await extractTarGz(archivePath, dest, {
      filter: (path) => path.endsWith('keep.txt'),
    });
    assert.deepEqual(
      entries.map((e) => e.path),
      ['root/keep.txt'],
    );
    assert.ok(!existsSync(join(dest, 'root/skip.txt')));
  });

  const hostile = [
    { name: 'path traversal', entry: { name: '../evil.txt', data: 'x' }, message: /unsafe/ },
    {
      name: 'embedded traversal',
      entry: { name: 'root/../../evil.txt', data: 'x' },
      message: /unsafe/,
    },
    { name: 'absolute path', entry: { name: '/etc/evil', data: 'x' }, message: /unsafe/ },
    {
      name: 'PAX traversal override',
      entry: { name: 'root/ok.txt', pax: { path: '../evil.txt' }, data: 'x' },
      message: /unsafe/,
    },
    { name: 'symlink entry', entry: { name: 'root/link', type: '2' }, message: /unsupported/ },
    { name: 'hardlink entry', entry: { name: 'root/link', type: '1' }, message: /unsupported/ },
    {
      name: 'corrupt header checksum',
      entry: { name: 'root/x.txt', data: 'x', badChecksum: true },
      message: /checksum/,
    },
  ];
  for (const tc of hostile) {
    it(`rejects ${tc.name}`, async () => {
      const { archivePath, dest } = setup(buildTarGz([tc.entry]));
      await assert.rejects(extractTarGz(archivePath, dest), tc.message);
    });
  }

  it('returns [] for an empty archive', async () => {
    const { archivePath, dest } = setup(buildTarGz([]));
    assert.deepEqual(await extractTarGz(archivePath, dest), []);
  });

  it('rejects a truncated archive (no end-of-archive marker)', async () => {
    const whole = buildTarGz([{ name: 'root/a.txt', data: 'abc' }]);
    const { gunzipSync, gzipSync } = await import('node:zlib');
    const raw = gunzipSync(whole);
    const truncated = gzipSync(raw.subarray(0, 512)); // header, no content
    const { archivePath, dest } = setup(truncated);
    await assert.rejects(extractTarGz(archivePath, dest), /truncated/);
  });
});
