/**
 * In-host smoke suite (run by @vscode/test-electron inside the real
 * VSCode): activates the extension against the real data release,
 * opens the navigator, and drives its HTTP surface end-to-end — the
 * same checks a human would make loading the SPA. The visual
 * walkthrough stays a human check.
 */

import { strict as assert } from 'node:assert';
import * as vscode from 'vscode';

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension('vista-forge.vista-atlas');
  assert.ok(extension, 'extension present');
  await extension.activate();

  const opened = (await vscode.commands.executeCommand('vistaAtlas.open')) as { url: string };
  assert.ok(opened?.url?.startsWith('http://127.0.0.1:'), `navigator url: ${opened?.url}`);

  // The SPA shell is served…
  const home = await fetch(opened.url);
  assert.equal(home.status, 200);
  assert.ok((await home.text()).includes('vdocs — VistA document navigator'), 'SPA shell served');

  // …and the API answers over the real release.
  const meta = (await (await fetch(`${opened.url}/api/meta`)).json()) as {
    read_schema_version: string;
  };
  assert.equal(meta.read_schema_version, '1.5');

  const facets = (await (await fetch(`${opened.url}/api/facets?axis=app_code`)).json()) as {
    Value: string;
  }[];
  assert.ok(facets.length > 50, `app facet populated (${facets.length})`);

  const docs = (await (await fetch(`${opened.url}/api/candidates?q=kaajee`)).json()) as {
    DocKey: string;
  }[];
  assert.ok(docs.length > 0, 'FTS candidates answer');

  const pins = (await vscode.commands.executeCommand('vistaAtlas.pins')) as {
    tag: string;
    corpus_content_hash: string;
  };
  assert.equal(pins.tag, 'data-v1');
  assert.equal(pins.corpus_content_hash.length, 64);
}
