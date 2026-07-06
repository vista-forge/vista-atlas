/**
 * Test-support builder for tar.gz archives — hand-assembled 512-byte
 * headers so tests control every dialect case the producer bundle can
 * contain (ustar prefix split, PAX path override) plus the hostile
 * cases a safe extractor must reject (traversal, absolute paths,
 * links, corrupt checksums).
 */

import { gzipSync } from 'node:zlib';

export interface TarFixtureEntry {
  readonly name: string;
  readonly data?: string | Buffer;
  /** ustar typeflag; default '0' (regular file). */
  readonly type?: string;
  /** ustar prefix field (long-path split). */
  readonly prefix?: string;
  /** Emit a PAX extended header with these records before the entry. */
  readonly pax?: Readonly<Record<string, string>>;
  /** Deliberately corrupt the header checksum. */
  readonly badChecksum?: boolean;
}

const BLOCK = 512;

function octal(value: number, width: number): Buffer {
  const text = `${value.toString(8).padStart(width - 1, '0')}\0`;
  return Buffer.from(text, 'ascii');
}

function header(entry: {
  name: string;
  size: number;
  type: string;
  prefix?: string;
  badChecksum?: boolean;
}): Buffer {
  const block = Buffer.alloc(BLOCK);
  block.write(entry.name, 0, 100, 'ascii');
  octal(0o644, 8).copy(block, 100); // mode
  octal(0, 8).copy(block, 108); // uid
  octal(0, 8).copy(block, 116); // gid
  octal(entry.size, 12).copy(block, 124);
  octal(0, 12).copy(block, 136); // mtime
  block.fill(' ', 148, 156); // chksum placeholder
  block.write(entry.type, 156, 1, 'ascii');
  block.write('ustar', 257, 'ascii'); // magic
  block.write('00', 263, 'ascii'); // version
  if (entry.prefix !== undefined) {
    block.write(entry.prefix, 345, 155, 'ascii');
  }
  let sum = 0;
  for (const byte of block) {
    sum += byte;
  }
  if (entry.badChecksum === true) {
    sum += 1;
  }
  block.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return block;
}

function padded(data: Buffer): Buffer {
  const rest = data.length % BLOCK;
  return rest === 0 ? data : Buffer.concat([data, Buffer.alloc(BLOCK - rest)]);
}

function paxContent(records: Readonly<Record<string, string>>): Buffer {
  let out = '';
  for (const [key, value] of Object.entries(records)) {
    // "%d %s=%s\n" where %d counts the whole record including itself.
    const body = ` ${key}=${value}\n`;
    let length = body.length + 1;
    while (`${length}${body}`.length !== length) {
      length = `${length}${body}`.length;
    }
    out += `${length}${body}`;
  }
  return Buffer.from(out, 'utf8');
}

/** Assemble a gzipped tar from the given entries (+ end-of-archive blocks). */
export function buildTarGz(entries: readonly TarFixtureEntry[]): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    if (entry.pax !== undefined) {
      const content = paxContent(entry.pax);
      blocks.push(
        header({ name: 'PaxHeaders.0/pax', size: content.length, type: 'x' }),
        padded(content),
      );
    }
    const data =
      entry.data === undefined
        ? Buffer.alloc(0)
        : typeof entry.data === 'string'
          ? Buffer.from(entry.data, 'utf8')
          : entry.data;
    const heading: Parameters<typeof header>[0] = {
      name: entry.name,
      size: data.length,
      type: entry.type ?? '0',
    };
    if (entry.prefix !== undefined) {
      heading.prefix = entry.prefix;
    }
    if (entry.badChecksum !== undefined) {
      heading.badChecksum = entry.badChecksum;
    }
    blocks.push(header(heading));
    if (data.length > 0) {
      blocks.push(padded(data));
    }
  }
  blocks.push(Buffer.alloc(BLOCK * 2)); // end-of-archive
  return gzipSync(Buffer.concat(blocks));
}
