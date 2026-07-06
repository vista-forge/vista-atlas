/**
 * Install the vdocs data release from its bundle carrier. Unlike the
 * vista-meta release (standalone db asset), index.db + the gold tree
 * ship inside one tar.gz, so install is a chain:
 *
 *   release record ──pins──▶ manifest asset ──pins──▶ extracted files
 *                └──pins──▶ bundle asset ──extracts──▶ staging ──rename──▶ dest
 *
 * Every hop verifies before the next runs; a failed hop leaves no
 * partial install behind (staged extract, atomic rename — the
 * ensureAsset pattern, widened to a tree).
 */

import { rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { ensureAsset } from './fetch.js';
import { type ProducerManifest, loadProducerManifest } from './manifest.js';
import type { ReleaseRecord } from './release.js';
import { verifyFile } from './verify.js';

export interface InstallOptions {
  readonly record: ReleaseRecord;
  /** Bundle asset filename, as pinned in the record (…​.tar.gz). */
  readonly bundleAsset: string;
  /** Producer-manifest asset filename, as pinned in the record. */
  readonly manifestAsset: string;
  /** Directory the release installs into (globalStorage in production). */
  readonly destDir: string;
  /** Injectable for tests; defaults to global fetch. */
  readonly fetchImpl?: typeof fetch;
}

export interface InstallResult {
  /** Extracted bundle root, destDir/<bundle name minus .tar.gz>. */
  readonly root: string;
  /** Path of the installed index.db. */
  readonly indexDb: string;
  readonly manifest: ProducerManifest;
  readonly status: 'already-verified' | 'installed';
}

/** Where a manifest-pinned name lives inside the extracted bundle. */
function bundlePath(root: string, name: string): string {
  return name === 'index.db' ? join(root, 'index.db') : join(root, 'gold', name);
}

async function allPinsVerify(root: string, manifest: ProducerManifest): Promise<boolean> {
  for (const [name, expected] of Object.entries(manifest.files)) {
    const result = await verifyFile(bundlePath(root, name), expected);
    if (!result.ok) {
      return false;
    }
  }
  return true;
}

/**
 * Make sure the release is installed, verified, under destDir.
 * Present + all manifest pins verified → no bundle download.
 */
export async function installDataRelease(options: InstallOptions): Promise<InstallResult> {
  const { record, bundleAsset, manifestAsset, destDir } = options;
  const fetchOptions = options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl };

  const manifestFile = await ensureAsset({
    record,
    name: manifestAsset,
    destDir,
    ...fetchOptions,
  });
  const manifest = loadProducerManifest(manifestFile.path);
  if (record.content_hash !== undefined && manifest.corpus_content_hash !== record.content_hash) {
    throw new Error(
      `install: manifest corpus_content_hash ${manifest.corpus_content_hash} does not match the pinned record ${record.content_hash}`,
    );
  }

  const rootName = bundleAsset.replace(/\.tar\.gz$/, '');
  const root = join(destDir, rootName);
  const indexDb = join(root, 'index.db');

  if (await allPinsVerify(root, manifest)) {
    return { root, indexDb, manifest, status: 'already-verified' };
  }

  const bundleFile = await ensureAsset({ record, name: bundleAsset, destDir, ...fetchOptions });
  const staging = join(destDir, `.staging-${rootName}`);
  await rm(staging, { recursive: true, force: true });
  try {
    const { extractTarGz } = await import('./tar.js');
    await extractTarGz(bundleFile.path, staging);
    const stagedRoot = join(staging, rootName);
    for (const [name, expected] of Object.entries(manifest.files)) {
      const result = await verifyFile(bundlePath(stagedRoot, name), expected);
      if (!result.ok) {
        throw new Error(`install: extracted ${name} failed verification — ${result.reason}`);
      }
    }
    await rm(root, { recursive: true, force: true });
    await rename(stagedRoot, root);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return { root, indexDb, manifest, status: 'installed' };
}
