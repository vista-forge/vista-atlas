/**
 * Section reading content — the interim reading surface: a section
 * rendered as a virtual markdown document (VSCode's own preview does
 * the rendering, so no webview/sanitizer code yet). Every page ends
 * with its own citation line (proposal §3.5: humans and AI cite
 * identically).
 */

import type { Store } from '../store/engine.js';
import { getSection, sectionText } from './queries.js';

/** A section as a titled markdown page, or undefined if unknown. */
export function sectionMarkdown(store: Store, sectionId: string): string | undefined {
  const section = getSection(store, sectionId);
  if (section === undefined) {
    return undefined;
  }
  const body = sectionText(store, sectionId) ?? '*(no text in this section)*';
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
