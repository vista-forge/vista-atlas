/**
 * The producer's standalone release manifest (vdocs `write_bundle` /
 * `release_notes` sidecar) — the sha-pinned asset that carries the
 * per-file pins for the bundle's contents. The release record pins the
 * manifest; the manifest pins what the bundle extracts to. Parse it
 * defensively: it is fetched, not committed.
 */

import { readFileSync } from 'node:fs';
import type { ExpectedFile } from './verify.ts';

export interface ProducerManifest {
  readonly artifact: string;
  readonly tag: string;
  /** The read contract version the db self-declares, e.g. "1.5". */
  readonly read_schema_version: string;
  readonly corpus_content_hash: string;
  /** Per-file pins for the bundle's verifiable contents. */
  readonly files: Readonly<Record<string, ExpectedFile>>;
}

function fail(detail: string): never {
  throw new Error(`producer manifest: ${detail}`);
}

/** Validate an untrusted value into a ProducerManifest, or throw. */
export function parseProducerManifest(input: unknown): ProducerManifest {
  if (typeof input !== 'object' || input === null) {
    fail('not an object');
  }
  const manifest = input as Record<string, unknown>;
  if (typeof manifest.artifact !== 'string' || manifest.artifact.length === 0) {
    fail('missing artifact');
  }
  if (typeof manifest.tag !== 'string' || manifest.tag.length === 0) {
    fail('missing tag');
  }
  if (
    typeof manifest.read_schema_version !== 'string' ||
    !/^\d+\.\d+$/.test(manifest.read_schema_version)
  ) {
    fail(`malformed read_schema_version: ${String(manifest.read_schema_version)}`);
  }
  if (
    typeof manifest.corpus_content_hash !== 'string' ||
    !/^[0-9a-f]{64}$/.test(manifest.corpus_content_hash)
  ) {
    fail('malformed corpus_content_hash');
  }
  if (typeof manifest.files !== 'object' || manifest.files === null) {
    fail('missing files');
  }
  const files: Record<string, ExpectedFile> = {};
  for (const [name, entry] of Object.entries(manifest.files)) {
    if (typeof entry !== 'object' || entry === null) {
      fail(`file ${name}: not an object`);
    }
    const { bytes, sha256 } = entry as Record<string, unknown>;
    if (typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes < 0) {
      fail(`file ${name}: bytes must be a non-negative integer`);
    }
    if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) {
      fail(`file ${name}: sha256 must be 64 lowercase hex chars`);
    }
    files[name] = { bytes, sha256 };
  }
  if (Object.keys(files).length === 0) {
    fail('files is empty');
  }
  return {
    artifact: manifest.artifact,
    tag: manifest.tag,
    read_schema_version: manifest.read_schema_version,
    corpus_content_hash: manifest.corpus_content_hash,
    files,
  };
}

/** Read and validate a producer manifest file. */
export function loadProducerManifest(path: string): ProducerManifest {
  return parseProducerManifest(JSON.parse(readFileSync(path, 'utf8')));
}
