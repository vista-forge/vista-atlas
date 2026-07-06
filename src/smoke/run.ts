/**
 * Smoke launcher: runs dist/smoke-suite.cjs inside the INSTALLED
 * VSCode (the P0 spike pattern — no download), against a generated
 * one-off workspace whose settings point at the local verified
 * release staging copy. Invoke with `npm run test:vscode`; not part
 * of `make check` (needs a display + installed VSCode 1.125+).
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { runTests } from '@vscode/test-electron';

const VSCODE_BIN = process.env.ATLAS_SMOKE_VSCODE ?? '/usr/share/code/code';
const DATA_DIR =
  process.env.VDOCS_DATA_HOME === undefined
    ? join(homedir(), 'data/vdocs')
    : process.env.VDOCS_DATA_HOME;

const repoRoot = new URL('../..', import.meta.url).pathname;

const workspace = mkdtempSync(join(tmpdir(), 'atlas-smoke-'));
const settingsDir = join(workspace, '.vscode');
mkdirSync(settingsDir, { recursive: true });
writeFileSync(
  join(settingsDir, 'settings.json'),
  JSON.stringify({ 'vistaAtlas.dataPath': join(DATA_DIR, 'dist') }),
);

await runTests({
  vscodeExecutablePath: VSCODE_BIN,
  extensionDevelopmentPath: repoRoot,
  extensionTestsPath: join(repoRoot, 'dist/smoke-suite.cjs'),
  launchArgs: [workspace, '--disable-extensions', '--disable-gpu'],
});
