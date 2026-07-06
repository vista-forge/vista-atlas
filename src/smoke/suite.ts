/**
 * In-host smoke suite (run by @vscode/test-electron inside the real
 * VSCode): activates the extension against the real data release and
 * drives the reading + search surfaces end-to-end. The visual library
 * walkthrough stays a human check.
 */

import { strict as assert } from 'node:assert';
import * as vscode from 'vscode';

// A stable real section (ACKQ audiometry manual, purpose section).
const KNOWN_SECTION = 'ACKQ/ackq3_0_p12tm/purpose';

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension('vista-forge.vista-atlas');
  assert.ok(extension, 'extension present');
  await extension.activate();

  // The reading surface: the virtual markdown document for a real
  // section must render title + body + citation line.
  const uri = vscode.Uri.from({
    scheme: 'vista-atlas',
    path: `/${KNOWN_SECTION}.md`,
    query: `section=${encodeURIComponent(KNOWN_SECTION)}`,
  });
  const doc = await vscode.workspace.openTextDocument(uri);
  const text = doc.getText();
  assert.ok(text.length > 200, `section renders (${text.length} chars)`);
  assert.ok(text.includes(`vdocs://section/${KNOWN_SECTION}`), 'citation line present');

  // The contract command surface responds.
  await vscode.commands.executeCommand('vistaAtlas.openSection', {
    section_id: KNOWN_SECTION,
  });
  const pins = (await vscode.commands.executeCommand('vistaAtlas.pins')) as {
    tag: string;
    corpus_content_hash: string;
  };
  assert.equal(pins.tag, 'data-v1');
  assert.equal(pins.corpus_content_hash.length, 64);
}
