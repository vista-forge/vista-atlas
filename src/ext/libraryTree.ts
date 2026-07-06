/**
 * The VistA Docs library sidebar — a thin vscode adapter over the
 * tested model layer. All data shaping lives in src/model/library.ts;
 * this file only builds TreeItems.
 */

import * as vscode from 'vscode';
import { type LibraryNode, childrenOf } from '../model/library.js';
import type { Store } from '../store/engine.js';

function item(node: LibraryNode): vscode.TreeItem {
  switch (node.kind) {
    case 'facet': {
      const it = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Collapsed);
      it.iconPath = new vscode.ThemeIcon('filter');
      return it;
    }
    case 'facetValue': {
      const it = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Collapsed);
      it.description = String(node.count);
      it.iconPath = new vscode.ThemeIcon('folder-library');
      return it;
    }
    case 'document': {
      const it = new vscode.TreeItem(node.doc.title, vscode.TreeItemCollapsibleState.Collapsed);
      it.description =
        node.doc.is_latest === 1 ? node.doc.doc_key : `${node.doc.doc_key} · superseded`;
      it.tooltip = `${node.doc.app_name} · ${node.doc.doc_type} · ${node.doc.pub_year}`;
      it.iconPath = new vscode.ThemeIcon('book');
      return it;
    }
    case 'section': {
      const it = new vscode.TreeItem(node.section.title, vscode.TreeItemCollapsibleState.None);
      it.iconPath = new vscode.ThemeIcon(node.section.kind === 'container' ? 'folder' : 'note');
      it.command = {
        command: 'vistaAtlas.openSection',
        title: 'Open Section',
        arguments: [{ section_id: node.section.section_id }],
      };
      return it;
    }
  }
}

export class LibraryTreeProvider implements vscode.TreeDataProvider<LibraryNode> {
  private readonly changeEmitter = new vscode.EventEmitter<LibraryNode | undefined>();
  readonly onDidChangeTreeData = this.changeEmitter.event;

  constructor(
    private readonly store: () => Store | undefined,
    private readonly docLimit: () => number,
  ) {}

  refresh(): void {
    this.changeEmitter.fire(undefined);
  }

  getTreeItem(node: LibraryNode): vscode.TreeItem {
    return item(node);
  }

  getChildren(node?: LibraryNode): LibraryNode[] {
    const store = this.store();
    return store === undefined ? [] : childrenOf(store, node, this.docLimit());
  }
}
