/**
 * Virtual-document plumbing for the interim reading surface: sections
 * render through VSCode's own markdown preview. Content shaping lives
 * in src/model/reading.ts.
 */

import * as vscode from 'vscode';
import { readingUriParts, sectionIdFromQuery, sectionMarkdown } from '../model/reading.js';
import type { Store } from '../store/engine.js';

export const READING_SCHEME = 'vista-atlas';

export function readingUri(sectionId: string): vscode.Uri {
  const parts = readingUriParts(sectionId);
  return vscode.Uri.from({ scheme: READING_SCHEME, path: parts.path, query: parts.query });
}

export class ReadingContentProvider implements vscode.TextDocumentContentProvider {
  constructor(private readonly store: () => Store | undefined) {}

  provideTextDocumentContent(uri: vscode.Uri): string {
    const sectionId = sectionIdFromQuery(uri.query);
    if (sectionId === undefined) {
      return 'Vista Atlas: malformed section link.';
    }
    const store = this.store();
    if (store === undefined) {
      return 'Vista Atlas: data release not loaded yet.';
    }
    return sectionMarkdown(store, sectionId) ?? `Vista Atlas: unknown section ${sectionId}.`;
  }
}
