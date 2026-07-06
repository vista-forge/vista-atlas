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

  // Twin-link deep-link routing: a real section resolves to its doc and the
  // iframe reloads with the SPA deep-link query; the shell still serves.
  const docKey = docs[0]?.DocKey ?? '';
  const toc = (await (
    await fetch(`${opened.url}/api/doc/${encodeURIComponent(docKey)}/toc`)
  ).json()) as { ID: string }[];
  const sectionId = toc[0]?.ID ?? '';
  assert.ok(sectionId !== '', `toc populated for ${docKey}`);
  const linked = (await vscode.commands.executeCommand('vistaAtlas.openSection', {
    section_id: sectionId,
  })) as { framedUrl: string };
  assert.ok(
    linked.framedUrl.includes(`doc=${encodeURIComponent(docKey)}`) &&
      linked.framedUrl.includes(`section=${encodeURIComponent(sectionId)}`),
    `deep-link framed: ${linked.framedUrl}`,
  );
  const framed = await fetch(linked.framedUrl.replace(/^https?:\/\/[^/]+/, opened.url));
  assert.equal(framed.status, 200, 'shell serves under a deep-link query');

  const searched = (await vscode.commands.executeCommand('vistaAtlas.search', {
    query: 'kaajee',
    filters: { doc_type: ['TM'] },
  })) as { framedUrl: string };
  assert.ok(
    searched.framedUrl.includes('q=kaajee') && searched.framedUrl.includes('doc_type=TM'),
    `search framed: ${searched.framedUrl}`,
  );

  // An unresolvable payload degrades to a plain open, never an error.
  const plain = (await vscode.commands.executeCommand('vistaAtlas.openSection', {
    section_id: 'no-such-section',
  })) as { framedUrl: string };
  assert.ok(!plain.framedUrl.includes('section='), `plain open: ${plain.framedUrl}`);
}
