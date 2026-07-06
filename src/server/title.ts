/**
 * Title de-noising — a faithful TS port of vdocs-web's
 * internal/index/title.go (code reference authorized by owner,
 * 2026-07-05): strip version and patch tokens from a document title
 * so the application/product name is what shows. The removed info
 * already lives in the patch_id / version columns. Version/Release
 * words are removed ONLY when followed by a number, so plain-word
 * senses ("GUI Version", "Release Notes") survive.
 */

const TITLE_STRIP_RULES: readonly RegExp[] = [
  /\s*\(\s*updated[^)]*\)/gi, // (Updated PSN*4.0*575)
  /\s*\([A-Z][A-Z0-9]*\*[\d.*]+\)/g, // (GMRC*3.0*189)
  /\b[A-Z][A-Z0-9]+\*\d+(\.\d+)*(\*\d+)?/g, // PSO*7.0*123 / IB*2
  /\b[A-Z]{2,}\s+\d+\.\d+\s+\d+\b/g, // SD 5.3 574
  /\b(version|release|rel\.?|ver\.?)[\s.]*\d+(\.\d+)*[A-Za-z]?\b/gi,
  /\bv\.?\s*\d+(\.\d+)+\b/gi, // v1.5 / V. 1.6
  /\b\d+\.\d+(\.\d+)*\b/g, // bare dotted version (VSE 1.7.2.1)
  /\b\d+\.\d+\*\d+\b/g, // orphan 1.6*14
  /\*\d+\b/g, // orphan *14
];

const EMPTY_PARENS = /\(\s*\)/g;
const TRAILING_PUNCT = /\s*[:\-–]\s*$/;
const SPACE_BEFORE = /\s+([:,])/g;
const MULTI_SPACE = /\s{2,}/g;
const LEADING_JUNK = /^[\s:\-–,]+/;

// Doc-type label / role words — used to decide whether a cleaned title
// still carries a product name or is label-only (needs the app-name
// fallback).
const LABEL_WORDS =
  /\b(user|technical|installation|developer'?s?|security|supervisor'?s?|programmer'?s?|nurse'?s?|inspector'?s?|clinical coordinator|manual|guide|guides|handbook|reference|card|notes|addendum|supplement|update|page|pages|change|menu|gui)\b/gi;
const NON_ALNUM = /[^A-Za-z0-9]/g;

function tidyTitle(s: string): string {
  return s
    .replace(EMPTY_PARENS, '')
    .replace(SPACE_BEFORE, '$1')
    .replace(MULTI_SPACE, ' ')
    .replace(TRAILING_PUNCT, '')
    .replace(LEADING_JUNK, '')
    .trim();
}

/** Whether s, with label words removed, has no real name residue left. */
function labelOnly(s: string): boolean {
  const residue = s.replace(LABEL_WORDS, '').replace(NON_ALNUM, '');
  return residue.length < 3;
}

/**
 * Remove version/patch tokens from a raw document title. A label-only
 * result (no product name left) is prefixed with appCode so the row
 * stays identifiable; an empty result falls back to appCode. The
 * fallback is skipped when the title already carries the appCode
 * prefix (the display title is fed back through here).
 */
export function cleanTitle(raw: string, appCode: string): string {
  let s = raw;
  for (const rule of TITLE_STRIP_RULES) {
    s = s.replace(rule, ' ');
  }
  s = tidyTitle(s);
  if (s === '') {
    return appCode;
  }
  if (appCode !== '' && labelOnly(s) && s !== appCode && !s.startsWith(`${appCode} `)) {
    return `${appCode} — ${s}`;
  }
  return s;
}
