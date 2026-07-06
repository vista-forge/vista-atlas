/**
 * Loaders over an extracted gold tree (the bundle's `gold/` directory)
 * for the hydration transforms: doc-bundle sidecars (tables/*.csv) via
 * `v_documents.bundle_path`, and `_shared/` boilerplate. Paths come
 * out of corpus text, so both loaders are traversal-guarded and answer
 * undefined rather than throwing — an unavailable file is an expected
 * outcome the transforms degrade around.
 */

import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type { HydrationLoaders } from './reading.js';

const unsafe = (path: string): boolean =>
  path === '' || isAbsolute(path) || path.split('/').some((segment) => segment === '..');

function readOrUndefined(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

/** Build hydration loaders rooted at an extracted gold directory. */
export function makeGoldLoaders(goldRoot: string): Required<HydrationLoaders> {
  return {
    loadDocFile(bundlePath, relPath) {
      if (unsafe(bundlePath) || unsafe(relPath)) {
        return undefined;
      }
      return readOrUndefined(join(goldRoot, 'consolidated', bundlePath, relPath));
    },
    loadShared(relPath) {
      if (unsafe(relPath) || !relPath.startsWith('_shared/')) {
        return undefined;
      }
      return readOrUndefined(join(goldRoot, relPath));
    },
    resolveAsset() {
      // rich-assets are not in the data-v1 release (Track P-vdocs 3);
      // rewriteImages degrades every reference to a visible note.
      return undefined;
    },
  };
}
