/**
 * Section reading content — the reading surface: a section rendered
 * as a virtual markdown document (VSCode's own preview does the
 * rendering, so no webview/sanitizer code yet), run through the
 * hydration transforms. Nav chrome always strips and CAS images
 * always degrade visibly; tables and boilerplate hydrate when the
 * caller supplies loaders (an extracted gold tree). Every page ends
 * with its own citation line (proposal §3.5: humans and AI cite
 * identically).
 */

import type { Store } from '../store/engine.js';
import { hydrateBoilerplate, hydrateTables, rewriteImages, stripNavChrome } from './hydrate.js';
import { getDocument, getSection, sectionText } from './queries.js';

export interface HydrationLoaders {
  /** Read a file from the section's doc bundle (e.g. tables/x.csv). */
  readonly loadDocFile?: (bundlePath: string, relPath: string) => string | undefined;
  /** Read a `_shared/…` file from the gold root. */
  readonly loadShared?: (relPath: string) => string | undefined;
  /** Resolve a CAS asset name to a displayable URI. */
  readonly resolveAsset?: (assetName: string) => string | undefined;
}

const NONE = (): undefined => undefined;

/** A section as a titled, hydrated markdown page, or undefined if unknown. */
export function sectionMarkdown(
  store: Store,
  sectionId: string,
  loaders: HydrationLoaders = {},
): string | undefined {
  const section = getSection(store, sectionId);
  if (section === undefined) {
    return undefined;
  }
  const raw = sectionText(store, sectionId) ?? '*(no text in this section)*';
  const bundlePath = getDocument(store, section.doc_key)?.bundle_path ?? '';
  const loadDocFile = loaders.loadDocFile;
  const body = rewriteImages(
    hydrateBoilerplate(
      hydrateTables(
        stripNavChrome(raw),
        loadDocFile === undefined || bundlePath === ''
          ? NONE
          : (rel) => loadDocFile(bundlePath, rel),
      ),
      loaders.loadShared ?? NONE,
    ),
    loaders.resolveAsset ?? NONE,
  );
  return [
    `# ${section.title}`,
    '',
    body,
    '',
    '---',
    `*${section.section_path}* · \`vdocs://section/${section.section_id}\``,
    '',
  ].join('\n');
}

/**
 * Virtual-document URI pieces for a section: a display path ending in
 * .md (so the markdown preview engages) + the section id in the query
 * (section ids contain slashes, so the path alone cannot carry them).
 */
export function readingUriParts(sectionId: string): { path: string; query: string } {
  return {
    path: `/${sectionId}.md`,
    query: `section=${encodeURIComponent(sectionId)}`,
  };
}

/** Recover the section id from a reading URI query, or undefined. */
export function sectionIdFromQuery(query: string): string | undefined {
  return new URLSearchParams(query).get('section') ?? undefined;
}
