/**
 * Activation and wiring only (the twin discipline): acquire the data
 * release via the store layer (bundle fetch-verify-extract into
 * globalStorage, or a local dataPath override), open index.db
 * read-only, contract-check it, and register the library tree, the
 * reading provider, the search command, and the twin-link command +
 * URI surface. Everything testable lives in src/model/ and src/store/.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { searchChunks } from '../model/queries.js';
import { installDataRelease } from '../store/bundle.js';
import { checkIndexDb } from '../store/contract.js';
import { type Store, openStore } from '../store/engine.js';
import { loadReleaseRecord } from '../store/release.js';
import { loadTwinLinkContract, parseDeepLink } from '../twinlink.js';
import { LibraryTreeProvider } from './libraryTree.js';
import { READING_SCHEME, ReadingContentProvider, readingUri } from './reading.js';

const BUNDLE_ASSET = 'vdocs-data-v1.tar.gz';
const MANIFEST_ASSET = 'vdocs-data-v1.manifest.json';
const READ_SCHEMA_VERSION = '1.5';

let store: Store | undefined;
let pins: { tag: string; corpus_content_hash: string } = { tag: '', corpus_content_hash: '' };

function config(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('vistaAtlas');
}

function expandHome(path: string): string {
  return path.startsWith('~/') ? join(homedir(), path.slice(2)) : path;
}

async function acquireDbPath(context: vscode.ExtensionContext): Promise<string> {
  const override = expandHome(config().get<string>('dataPath', ''));
  if (override !== '') {
    return override.endsWith('.db') ? override : join(override, 'index.db');
  }
  const record = loadReleaseRecord(context.asAbsolutePath('contracts/releases/vdocs-data-v1.json'));
  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Vista Atlas: verifying the vdocs data release…',
    },
    () =>
      installDataRelease({
        record,
        bundleAsset: BUNDLE_ASSET,
        manifestAsset: MANIFEST_ASSET,
        destDir: context.globalStorageUri.fsPath,
      }),
  );
  if (result.status === 'installed') {
    vscode.window.showInformationMessage(
      `Vista Atlas: fetched, verified, and installed ${BUNDLE_ASSET} (${record.tag}).`,
    );
  }
  return result.indexDb;
}

async function openData(
  context: vscode.ExtensionContext,
  view: vscode.TreeView<unknown>,
): Promise<void> {
  const record = loadReleaseRecord(context.asAbsolutePath('contracts/releases/vdocs-data-v1.json'));
  const dbPath = await acquireDbPath(context);
  store?.close();
  store = openStore(dbPath);

  const report = checkIndexDb(store, {
    readSchemaVersion: READ_SCHEMA_VERSION,
    ...(record.content_hash === undefined ? {} : { corpusContentHash: record.content_hash }),
  });
  const meta = new Map(
    store.all('SELECT key, value FROM meta').map((row) => [String(row.key), String(row.value)]),
  );
  const hash = meta.get('corpus_content_hash') ?? '';
  pins = { tag: record.tag, corpus_content_hash: hash };
  view.description = `${record.tag} · ${hash.slice(0, 8)}`;
  if (!report.ok) {
    vscode.window.showWarningMessage(
      `Vista Atlas: data contract mismatch — ${report.problems.join('; ')}`,
    );
  }
}

async function openSection(sectionId: string): Promise<void> {
  await vscode.commands.executeCommand('markdown.showPreview', readingUri(sectionId));
}

async function runSearch(query: string | undefined): Promise<void> {
  const active = store;
  if (active === undefined) {
    return;
  }
  const text =
    query ??
    (await vscode.window.showInputBox({
      prompt: 'Search the VA documentation corpus (FTS5)',
      placeHolder: 'e.g. kaajee, ^DIC, menu manager',
    }));
  if (text === undefined || text.trim() === '') {
    return;
  }
  const hits = searchChunks(active, text, { limit: 30 });
  if (hits.length === 0) {
    vscode.window.showInformationMessage(`Vista Atlas: no hits for "${text}".`);
    return;
  }
  const picked = await vscode.window.showQuickPick(
    hits.map((hit) => ({
      label: hit.doc_title,
      description: hit.title,
      detail: hit.snippet.replaceAll('«', '').replaceAll('»', ''),
      sectionId: hit.section_id,
    })),
    { matchOnDescription: true, matchOnDetail: true, title: `Results for "${text}"` },
  );
  if (picked !== undefined) {
    await openSection(picked.sectionId);
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const provider = new LibraryTreeProvider(
    () => store,
    () => config().get<number>('docLimit', 500),
  );
  const view = vscode.window.createTreeView('vistaAtlasLibrary', { treeDataProvider: provider });
  context.subscriptions.push(view);

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      READING_SCHEME,
      new ReadingContentProvider(() => store),
    ),
  );

  const contract = loadTwinLinkContract(context.asAbsolutePath('contracts/twin-link.v1.json'));
  context.subscriptions.push(
    vscode.commands.registerCommand('vistaAtlas.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('vistaAtlas.reloadData', async () => {
      await openData(context, view);
      provider.refresh();
    }),
    vscode.commands.registerCommand('vistaAtlas.search', (payload?: { query?: string }) =>
      runSearch(payload?.query),
    ),
    vscode.commands.registerCommand(
      'vistaAtlas.openSection',
      (payload?: { section_id?: string }) => {
        if (payload?.section_id !== undefined) {
          return openSection(payload.section_id);
        }
        return undefined;
      },
    ),
    vscode.commands.registerCommand(
      'vistaAtlas.openDoc',
      async (payload?: { doc_key?: string }) => {
        const active = store;
        if (active === undefined || payload?.doc_key === undefined) {
          return;
        }
        const { listSections } = await import('../model/queries.js');
        const sections = listSections(active, payload.doc_key);
        const first = sections.find((s) => s.searchable === 1) ?? sections[0];
        if (first !== undefined) {
          await openSection(first.section_id);
        }
      },
    ),
    vscode.commands.registerCommand('vistaAtlas.pins', () => pins),
    vscode.window.registerUriHandler({
      handleUri: async (uri) => {
        try {
          const link = parseDeepLink(contract, uri.toString());
          await vscode.commands.executeCommand(link.command, link.payload);
        } catch (err) {
          vscode.window.showWarningMessage(`Vista Atlas: bad deep link — ${String(err)}`);
        }
      },
    }),
  );

  await openData(context, view);
}

export function deactivate(): void {
  store?.close();
  store = undefined;
}
