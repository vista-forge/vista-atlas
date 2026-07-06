/**
 * Dependency-free tar.gz extraction — just enough of the format for
 * the producer bundle (Python tarfile, PAX default: regular files,
 * ustar prefix splits, PAX `path` overrides; no links, no device
 * nodes) and hardened against hostile archives: absolute paths and
 * `..` segments are rejected, unsupported entry types are errors, and
 * every header checksum is verified.
 */

import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { createGunzip } from 'node:zlib';

const BLOCK = 512;

export interface TarEntry {
  /** Archive-relative path (safety-checked). */
  readonly path: string;
  readonly bytes: number;
}

export interface ExtractOptions {
  /** Extract only entries the predicate accepts (all, by default). */
  readonly filter?: (path: string) => boolean;
}

/** Pull-based reader over an async byte stream. */
class ByteReader {
  private chunks: Buffer[] = [];
  private buffered = 0;
  private readonly iterator: AsyncIterator<Buffer>;

  constructor(iterable: AsyncIterable<Buffer>) {
    this.iterator = iterable[Symbol.asyncIterator]();
  }

  /** Read exactly n bytes, or undefined at a clean end-of-stream. */
  async read(n: number): Promise<Buffer | undefined> {
    while (this.buffered < n) {
      const { value, done } = await this.iterator.next();
      if (done === true) {
        return undefined;
      }
      this.chunks.push(value);
      this.buffered += value.length;
    }
    const whole =
      this.chunks.length === 1 ? (this.chunks[0] as Buffer) : Buffer.concat(this.chunks);
    this.chunks = whole.length === n ? [] : [whole.subarray(n)];
    this.buffered = whole.length - n;
    return whole.subarray(0, n);
  }
}

const cstr = (block: Buffer, start: number, length: number): string => {
  const slice = block.subarray(start, start + length);
  const end = slice.indexOf(0);
  return slice.toString('ascii', 0, end === -1 ? length : end);
};

const octal = (block: Buffer, start: number, length: number): number => {
  const text = cstr(block, start, length).trim();
  return text === '' ? 0 : Number.parseInt(text, 8);
};

function verifyChecksum(header: Buffer): void {
  const declared = octal(header, 148, 8);
  let sum = 0;
  for (let i = 0; i < BLOCK; i += 1) {
    sum += i >= 148 && i < 156 ? 0x20 : (header[i] as number);
  }
  if (sum !== declared) {
    throw new Error(`tar: header checksum mismatch (expected ${declared}, got ${sum})`);
  }
}

function assertSafe(path: string): void {
  if (path === '' || isAbsolute(path) || path.split('/').some((s) => s === '..')) {
    throw new Error(`tar: unsafe entry path: ${path}`);
  }
}

/** Parse PAX extended-header records ("<len> key=value\n"…). */
function paxRecords(content: Buffer): Map<string, string> {
  const records = new Map<string, string>();
  const text = content.toString('utf8');
  let at = 0;
  while (at < text.length) {
    const space = text.indexOf(' ', at);
    const length = Number(text.slice(at, space));
    if (!Number.isInteger(length) || length <= 0) {
      throw new Error('tar: malformed PAX record');
    }
    const record = text.slice(space + 1, at + length - 1); // strip trailing \n
    const eq = record.indexOf('=');
    records.set(record.slice(0, eq), record.slice(eq + 1));
    at += length;
  }
  return records;
}

/**
 * Extract archivePath (a .tar.gz) into destDir. Returns the extracted
 * file entries in archive order. Filtered-out entries are skipped but
 * still consumed; directory entries are created, not reported.
 */
export async function extractTarGz(
  archivePath: string,
  destDir: string,
  options: ExtractOptions = {},
): Promise<TarEntry[]> {
  const reader = new ByteReader(createReadStream(archivePath).pipe(createGunzip()));
  const entries: TarEntry[] = [];
  let paxPath: string | undefined;

  for (;;) {
    const header = await reader.read(BLOCK);
    if (header === undefined) {
      throw new Error('tar: truncated archive (missing end-of-archive marker)');
    }
    if (header.every((byte) => byte === 0)) {
      return entries; // end-of-archive (second zero block may follow; done)
    }
    verifyChecksum(header);

    const size = octal(header, 124, 12);
    const type = String.fromCharCode(header[156] as number) || '0';
    const padded = Math.ceil(size / BLOCK) * BLOCK;
    const block = size === 0 ? Buffer.alloc(0) : await reader.read(padded);
    if (block === undefined) {
      throw new Error('tar: truncated archive (entry content cut short)');
    }
    const content = block.subarray(0, size);

    if (type === 'x') {
      paxPath = paxRecords(content).get('path') ?? paxPath;
      continue;
    }
    if (type === 'g') {
      continue; // global PAX header: nothing we honor
    }
    if (type === 'L') {
      paxPath = content.toString('utf8').replace(/\0+$/, '');
      continue;
    }

    const prefix = cstr(header, 345, 155);
    const name = cstr(header, 0, 100);
    const path = paxPath ?? (prefix === '' ? name : `${prefix}/${name}`);
    paxPath = undefined;
    assertSafe(path);

    if (type === '5') {
      await mkdir(join(destDir, path), { recursive: true });
      continue;
    }
    if (type !== '0' && type !== '\0') {
      throw new Error(`tar: unsupported entry type '${type}' for ${path}`);
    }
    if (options.filter !== undefined && !options.filter(path)) {
      continue;
    }
    const target = join(destDir, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
    entries.push({ path, bytes: size });
  }
}
