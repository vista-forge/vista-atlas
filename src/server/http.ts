/**
 * The in-process navigator server: the same HTTP surface vdocs-web's
 * Go binary served (internal/api/server.go — code reference
 * authorized by owner, 2026-07-05), over the node:sqlite Store, plus
 * static serving of the vendored SPA. The SPA cannot tell the
 * difference; the extension frames http://127.0.0.1:<port> in a
 * webview iframe exactly as the predecessor extension did.
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import type { Store } from '../store/engine.js';
import {
  bundlePath,
  candidates,
  docTOC,
  facetCounts,
  preview,
  sectionText,
  vocab,
} from './core.js';
import type { Filter } from './filter.js';

export interface NavigatorOptions {
  readonly store: Store;
  /** Directory of the vendored SPA build (web/static); optional in tests. */
  readonly staticDir?: string;
  /** Gold consolidated root for /api/table (…/gold/consolidated). */
  readonly tablesDir?: string;
  /** Content-addressed image store for /api/asset. */
  readonly assetsDir?: string;
}

/** Mirrors the vendored read contract this build targets. */
const META = {
  read_schema_version: '1.5',
  capabilities: [
    'fts5',
    'pub_year',
    'entity_mentions',
    'persona_facets',
    'product_facets',
    'vocab_table',
  ],
};

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const unsafeName = (name: string): boolean =>
  name === '' || name.includes('/') || name.includes('\\') || name.startsWith('.');

function sendJSON(res: ServerResponse, value: unknown): void {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(value));
}

function sendError(res: ServerResponse, status: number, message: string): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(message);
}

function sendFile(res: ServerResponse, path: string): void {
  if (!existsSync(path) || !statSync(path).isFile()) {
    sendError(res, 404, 'not found');
    return;
  }
  res.setHeader('Content-Type', MIME[extname(path).toLowerCase()] ?? 'application/octet-stream');
  createReadStream(path).pipe(res);
}

/**
 * The query string → Filter, per the reference: every param except
 * the reserved ones (axis, q, scope) is a selection on that documents
 * axis (unknown axes are ignored by the whitelist downstream).
 */
function filterFromQuery(params: URLSearchParams): Filter {
  const sel: Record<string, string[]> = {};
  for (const key of new Set(params.keys())) {
    if (key === 'axis' || key === 'q' || key === 'scope') {
      continue;
    }
    sel[key] = params.getAll(key);
  }
  return { sel, fts: params.get('q') ?? '', ftsScope: params.get('scope') ?? '' };
}

/** Split a raw pathname into decoded segments (%2F stays inside a segment). */
function segments(pathname: string): string[] {
  return pathname
    .split('/')
    .filter((s) => s !== '')
    .map((s) => decodeURIComponent(s));
}

function handleApi(
  options: NavigatorOptions,
  seg: readonly string[],
  params: URLSearchParams,
  res: ServerResponse,
): void {
  const { store } = options;
  const [, route] = seg; // seg[0] === 'api'
  if (route === 'meta') {
    sendJSON(res, META);
    return;
  }
  if (route === 'vocab') {
    sendJSON(res, vocab(store));
    return;
  }
  if (route === 'facets') {
    const axis = params.get('axis') ?? '';
    if (axis === '') {
      sendError(res, 400, 'missing axis');
      return;
    }
    sendJSON(res, facetCounts(store, axis, filterFromQuery(params)));
    return;
  }
  if (route === 'candidates') {
    sendJSON(res, candidates(store, filterFromQuery(params)));
    return;
  }
  if (route === 'doc' && seg.length === 4 && seg[3] === 'toc') {
    sendJSON(res, docTOC(store, seg[2] as string));
    return;
  }
  if (route === 'section' && seg.length === 3) {
    sendJSON(res, { text: sectionText(store, seg[2] as string) });
    return;
  }
  if (route === 'preview' && seg.length === 3) {
    sendJSON(res, { text: preview(store, seg[2] as string) });
    return;
  }
  if (route === 'asset' && seg.length === 3) {
    const name = seg[2] as string;
    if (options.assetsDir === undefined || unsafeName(name)) {
      sendError(res, 404, 'not found');
      return;
    }
    sendFile(res, join(options.assetsDir, name));
    return;
  }
  if (route === 'table' && seg.length === 4) {
    const docKey = seg[2] as string;
    const name = seg[3] as string;
    if (options.tablesDir === undefined || unsafeName(name) || extname(name) !== '.csv') {
      sendError(res, 404, 'not found');
      return;
    }
    const bp = bundlePath(store, docKey);
    if (bp === '' || bp.includes('..')) {
      sendError(res, 404, 'not found');
      return;
    }
    sendFile(res, join(options.tablesDir, bp, 'tables', name));
    return;
  }
  sendError(res, 404, 'not found');
}

function handleStatic(
  staticDir: string | undefined,
  seg: readonly string[],
  res: ServerResponse,
): void {
  if (staticDir === undefined) {
    sendError(res, 404, 'not found');
    return;
  }
  if (seg.some((s) => s === '..' || s.includes('/') || s.includes('\\'))) {
    sendError(res, 404, 'not found');
    return;
  }
  const rel = seg.join('/');
  const index = join(staticDir, 'index.html');
  if (rel === '') {
    sendFile(res, index);
    return;
  }
  const path = normalize(join(staticDir, rel));
  if (!path.startsWith(staticDir)) {
    sendError(res, 404, 'not found');
    return;
  }
  if (existsSync(path) && statSync(path).isFile()) {
    sendFile(res, path);
    return;
  }
  // SPA fallback: extension-less unknown paths land on the app shell.
  if (extname(rel) === '') {
    sendFile(res, index);
    return;
  }
  sendError(res, 404, 'not found');
}

/** Build the request handler (exposed for tests; startNavigator wires it). */
export function navigatorHandler(
  options: NavigatorOptions,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const seg = segments(url.pathname);
      if (seg[0] === 'api') {
        handleApi(options, seg, url.searchParams, res);
      } else {
        handleStatic(options.staticDir, seg, res);
      }
    } catch (err) {
      sendError(res, 500, err instanceof Error ? err.message : String(err));
    }
  };
}

export interface RunningNavigator {
  readonly server: Server;
  readonly port: number;
  readonly url: string;
  close(): Promise<void>;
}

/** Start the navigator on a loopback ephemeral port (or a given one). */
export function startNavigator(
  options: NavigatorOptions & { readonly port?: number },
): Promise<RunningNavigator> {
  const server = createServer(navigatorHandler(options));
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr === null || typeof addr !== 'object') {
        reject(new Error('navigator: could not determine bound port'));
        return;
      }
      const { port } = addr;
      resolve({
        server,
        port,
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((done, fail) => server.close((err) => (err ? fail(err) : done()))),
      });
    });
  });
}
