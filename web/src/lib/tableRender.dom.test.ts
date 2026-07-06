import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import { renderInline, renderMarkdown } from './markdown';
import { csvToTableHtml, parseCsv } from './csvTable';

// A real DOM (jsdom) so this exercises the reading pane's actual pipeline end-to-end — render gold
// markdown → DOMPurify.sanitize → parse into the DOM (as `{@html}` does) → hydrate each `.csv-table`
// placeholder with its fetched CSV rendered as a table. This guards the regression where the
// placeholder was emitted as a block `<div>` nested inside `<em>`/`<p>` (the gold link is an italic
// standalone paragraph): the browser reparents that invalid nesting, and the `<table>` injected into
// the mis-nested node loses its `<tr>/<td>`, so the table collapsed to flat text.
const { window } = new JSDOM('<!doctype html><body></body>');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DOMPurify = createDOMPurify(window as any);

function renderBodyInto(markdown: string): HTMLElement {
  const article = window.document.createElement('article');
  article.className = 'markdown';
  article.innerHTML = DOMPurify.sanitize(renderMarkdown(markdown)); // what `{@html bodyHtml}` does
  return article;
}

// The pane's hydration step (see +page.svelte $effect): replace a placeholder's content with the
// CSV rendered as a table (inline-markdown cells), sanitized.
function hydrate(article: HTMLElement, csvFor: (name: string) => string): void {
  for (const ph of article.querySelectorAll<HTMLElement>('.csv-table[data-csv]')) {
    const tableHtml = csvToTableHtml(parseCsv(csvFor(ph.dataset.csv ?? '')), (c) => renderInline(c));
    ph.innerHTML = DOMPurify.sanitize(`<figcaption>${ph.innerHTML}</figcaption>${tableHtml}`);
  }
}

test('an extracted-table link hydrates into a real <table> with rows in the DOM', () => {
  // the gold form: a standalone *italic* link → marked emits `<p><em><a…>…</a></em></p>`
  const article = renderBodyInto('_[Table 2 (extracted to CSV)](tables/table-02.csv)_');

  const ph = article.querySelector<HTMLElement>('.csv-table[data-csv]');
  assert.ok(ph, 'placeholder present after render + sanitize + DOM parse');
  assert.equal(ph!.dataset.csv, 'table-02.csv');
  // the heart of the regression: the placeholder must be a clean block, never reparented into an
  // <em>/<p> wrapper (which is what strips the injected table's rows).
  assert.ok(!ph!.closest('em'), 'placeholder must not be inside <em>');
  assert.ok(!ph!.closest('p'), 'placeholder must not be inside <p>');

  hydrate(article, () => 'Entry Point,Description / Title\r\n**EN1^DIP**,Print Data\r\n**D^DIQ**,Convert\r\n');

  const rows = article.querySelectorAll('.csv-table table tbody tr');
  assert.equal(rows.length, 2, 'both data rows survive as <tr> in the DOM (not flattened)');
  assert.equal(article.querySelectorAll('.csv-table table thead th').length, 2, 'header cells survive');
  const firstCell = article.querySelector('.csv-table table tbody tr td');
  assert.match(firstCell!.innerHTML, /<strong>EN1\^DIP<\/strong>/, 'cell markdown renders');
});

test('a doc with no matching CSV link renders no csv-table placeholder', () => {
  const article = renderBodyInto('# Heading\n\nNormal paragraph with [a link](https://va.gov).');
  assert.equal(article.querySelectorAll('.csv-table').length, 0);
});
