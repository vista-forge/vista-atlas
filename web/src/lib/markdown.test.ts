import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderMarkdown } from './markdown';

test('renders a GFM pipe table as an HTML table', () => {
  const md = ['| Routine | Purpose |', '| --- | --- |', '| XUS | sign-on |'].join('\n');
  const html = renderMarkdown(md);
  assert.match(html, /<table>/);
  assert.match(html, /<th>Routine<\/th>/);
  assert.match(html, /<td>XUS<\/td>/);
  assert.match(html, /<td>sign-on<\/td>/);
});

test('renders headings, emphasis, and inline code', () => {
  const html = renderMarkdown('# Title\n\nSome **bold** and `code`.');
  assert.match(html, /<h1[^>]*>Title<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<code>code<\/code>/);
});

test('renders links and lists', () => {
  const html = renderMarkdown('- one\n- two\n\n[VA](https://va.gov)');
  assert.match(html, /<ul>/);
  assert.match(html, /<li>one<\/li>/);
  assert.match(html, /<a href="https:\/\/va\.gov">VA<\/a>/);
});

test('renders fenced code blocks', () => {
  const html = renderMarkdown('```\nset x=1\n```');
  assert.match(html, /<pre><code/);
  assert.match(html, /set x=1/);
});

test('escapes raw HTML-looking text in code spans', () => {
  const html = renderMarkdown('use `<XUS>` here');
  assert.match(html, /&lt;XUS&gt;/);
});

test('a figure with alt text renders <figure> + centered <figcaption>', () => {
  const html = renderMarkdown('![Select a Certificate box.](abc123.png)');
  assert.match(html, /<figure>/);
  // image is repointed at the asset route by its bare content-addressed name
  assert.match(html, /<img src="\/api\/asset\/abc123\.png" alt="Select a Certificate box\."/);
  assert.match(html, /<figcaption>Select a Certificate box\.<\/figcaption>/);
  assert.match(html, /<\/figure>/);
});

test('a figure without alt or title renders no figcaption', () => {
  const html = renderMarkdown('![](de1f.png)');
  assert.match(html, /<figure><img src="\/api\/asset\/de1f\.png"[^>]*><\/figure>/);
  assert.doesNotMatch(html, /<figcaption>/);
});

test('caption falls back to the image title when alt is empty', () => {
  const html = renderMarkdown('![](x.png "A title caption")');
  assert.match(html, /<figcaption>A title caption<\/figcaption>/);
});

test('caption text is HTML-escaped', () => {
  const html = renderMarkdown('![a <b> & "c"](x.png)');
  assert.match(html, /<figcaption>a &lt;b&gt; &amp; "c"<\/figcaption>/);
  assert.doesNotMatch(html, /<figcaption>a <b>/);
});

test('rewrites a raw HTML <img> src to the asset route, preserving other attrs', () => {
  // Pandoc emits figures with inline sizing as raw <img> (not markdown ![](…)); these must route too.
  const html = renderMarkdown('<img src="a0e627.png" style="width:0.3in;height:0.3in" />');
  assert.match(html, /<img src="\/api\/asset\/a0e627\.png" style="width:0\.3in;height:0\.3in"/);
});

test('routes a raw <img> inside an HTML table cell', () => {
  const md = '<table><tbody><tr><td><img src="27daaf.png" /></td></tr></tbody></table>';
  assert.match(renderMarkdown(md), /<td><img src="\/api\/asset\/27daaf\.png"/);
});

test('leaves external and already-routed image srcs untouched', () => {
  assert.match(renderMarkdown('<img src="https://va.gov/seal.png">'), /src="https:\/\/va\.gov\/seal\.png"/);
  assert.match(renderMarkdown('<img src="/api/asset/x.png">'), /src="\/api\/asset\/x\.png"/);
});

test('an extracted-table link becomes a csv-table placeholder keyed by the CSV name', () => {
  const html = renderMarkdown('_[Table 3 (extracted to CSV)](tables/table-03.csv)_');
  assert.match(html, /<div class="csv-table" data-csv="table-03\.csv">.*Table 3 \(extracted to CSV\).*<\/div>/);
  assert.doesNotMatch(html, /<a href="tables\//); // the dead link is gone
  // the block placeholder must NOT sit inside <em>/<p> — that invalid nesting breaks the table the
  // reading pane injects into it (the whole wrapping paragraph is consumed).
  assert.doesNotMatch(html, /<em>\s*<div class="csv-table"/);
  assert.doesNotMatch(html, /<p>\s*<div class="csv-table"/);
});

test('a non-table link is left as a normal anchor', () => {
  const html = renderMarkdown('[VA](https://va.gov)');
  assert.match(html, /<a href="https:\/\/va\.gov">VA<\/a>/);
});

test('empty input yields empty output', () => {
  assert.equal(renderMarkdown(''), '');
});
