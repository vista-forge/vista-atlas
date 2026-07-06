/**
 * Activation and wiring only: acquire the data release (bundle
 * fetch-verify-extract into globalStorage, or a local dataPath
 * override), open index.db read-only, contract-check it, start the
 * in-process navigator server, and frame it in an editor-tab webview —
 * the vdocs-web experience, carbon-copied (owner direction,
 * 2026-07-05). Everything testable lives in src/server/ and src/store/.
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import * as vscode from 'vscode';
import { getSection } from '../model/queries.js';
import { type RunningNavigator, startNavigator } from '../server/http.js';
import { navigatorLinkQuery, withLinkQuery } from '../server/link.js';
import { installDataRelease } from '../store/bundle.js';
import { checkIndexDb } from '../store/contract.js';
import { type Store, openStore } from '../store/engine.js';
import { loadReleaseRecord } from '../store/release.js';
import { loadTwinLinkContract, parseDeepLink } from '../twinlink.js';
import { panelHtml } from './panelHtml.js';

const VIEW_TYPE = 'vistaAtlas.navigator';
const BUNDLE_ASSET = 'vdocs-data-v1.tar.gz';
const MANIFEST_ASSET = 'vdocs-data-v1.manifest.json';
const READ_SCHEMA_VERSION = '1.5';

interface Session {
  readonly store: Store;
  readonly navigator: RunningNavigator;
  readonly panel: vscode.WebviewPanel;
  /** asExternalUri base the iframe frames — deep-link queries merge onto it. */
  readonly externalUrl: string;
}

/** A twin-link command invocation to land on in the navigator. */
interface LinkIntent {
  readonly command: string;
  readonly payload: unknown;
}
let session: Session | null = null;
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
  // No override: install (or re-verify) the bundle, whose extracted
  // root carries the gold tree the table route serves from.
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

/** Open the db, contract-check it, and start the navigator server. */
async function startSessionServer(
  context: vscode.ExtensionContext,
): Promise<{ store: Store; navigator: RunningNavigator }> {
  const record = loadReleaseRecord(context.asAbsolutePath('contracts/releases/vdocs-data-v1.json'));
  const dbPath = await acquireDbPath(context);
  const store = openStore(dbPath);

  const report = checkIndexDb(store, {
    readSchemaVersion: READ_SCHEMA_VERSION,
    ...(record.content_hash === undefined ? {} : { corpusContentHash: record.content_hash }),
  });
  if (!report.ok) {
    vscode.window.showWarningMessage(
      `Vista Atlas: data contract mismatch — ${report.problems.join('; ')}`,
    );
  }
  const meta = new Map(
    store.all('SELECT key, value FROM meta').map((row) => [String(row.key), String(row.value)]),
  );
  pins = { tag: record.tag, corpus_content_hash: meta.get('corpus_content_hash') ?? '' };

  // Gold consolidated tree (table sidecars) sits next to the installed
  // index.db; a bare-db dataPath simply leaves the table route dark.
  const goldConsolidated = join(dirname(dbPath), 'gold', 'consolidated');
  const assetsDir = expandHome(config().get<string>('assetsDir', ''));
  const navigator = await startNavigator({
    store,
    staticDir: context.asAbsolutePath('web/static'),
    ...(existsSync(goldConsolidated) ? { tablesDir: goldConsolidated } : {}),
    ...(assetsDir !== '' ? { assetsDir } : {}),
  });
  return { store, navigator };
}

/** The deep-link query for an intent, '' when it can't be honored. */
function linkQuery(store: Store, intent: LinkIntent | undefined): string {
  if (intent === undefined) return '';
  return navigatorLinkQuery(
    intent.command,
    intent.payload,
    (sectionId) => getSection(store, sectionId)?.doc_key,
  );
}

/**
 * Open (or reveal) the navigator panel. An intent lands the SPA on its
 * doc/section/search by reloading the iframe with the deep-link query.
 * Returns the server URL and the URL the iframe was framed with (the
 * observable deep-link seam — the in-host smoke asserts on it).
 */
async function openNavigator(
  context: vscode.ExtensionContext,
  intent?: LinkIntent,
): Promise<{ url: string; framedUrl: string }> {
  if (session !== null) {
    const query = linkQuery(session.store, intent);
    const framedUrl = withLinkQuery(session.externalUrl, query);
    if (query !== '') {
      session.panel.webview.html = panelHtml(framedUrl);
    }
    session.panel.reveal(vscode.ViewColumn.Active);
    return { url: session.navigator.url, framedUrl };
  }
  const { store, navigator } = await startSessionServer(context);
  const panel = vscode.window.createWebviewPanel(
    VIEW_TYPE,
    'Vista Atlas',
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      // Make the loopback port reachable from inside the webview, locally
      // and over Remote-SSH.
      portMapping: [{ webviewPort: navigator.port, extensionHostPort: navigator.port }],
    },
  );
  const external = await vscode.env.asExternalUri(vscode.Uri.parse(navigator.url));
  session = { store, navigator, panel, externalUrl: external.toString() };

  panel.onDidDispose(
    () => {
      if (session?.panel === panel) {
        void session.navigator.close();
        session.store.close();
        session = null;
      }
    },
    null,
    context.subscriptions,
  );

  const framedUrl = withLinkQuery(session.externalUrl, linkQuery(store, intent));
  panel.webview.html = panelHtml(framedUrl);
  return { url: navigator.url, framedUrl };
}

async function closeSession(): Promise<void> {
  if (session !== null) {
    const closing = session;
    session = null;
    closing.panel.dispose();
    await closing.navigator.close().catch(() => {});
    closing.store.close();
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const contract = loadTwinLinkContract(context.asAbsolutePath('contracts/twin-link.v1.json'));
  context.subscriptions.push(
    vscode.commands.registerCommand('vistaAtlas.open', () => openNavigator(context)),
    vscode.commands.registerCommand('vistaAtlas.reloadData', async () => {
      await closeSession();
      await openNavigator(context);
    }),
    // Twin-link contract v1 surface: each command opens the navigator and,
    // when the payload resolves, lands the SPA on it via the deep-link
    // query (an unresolvable payload degrades to a plain open).
    vscode.commands.registerCommand('vistaAtlas.search', (payload?: unknown) =>
      openNavigator(context, { command: 'vistaAtlas.search', payload }),
    ),
    vscode.commands.registerCommand('vistaAtlas.openDoc', (payload?: unknown) =>
      openNavigator(context, { command: 'vistaAtlas.openDoc', payload }),
    ),
    vscode.commands.registerCommand('vistaAtlas.openSection', (payload?: unknown) =>
      openNavigator(context, { command: 'vistaAtlas.openSection', payload }),
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
}

export function deactivate(): void {
  void closeSession();
}
