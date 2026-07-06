import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  csvToMarkdownTable,
  hydrateBoilerplate,
  hydrateTables,
  parseCsv,
  rewriteImages,
  splitFrontmatter,
  stripNavChrome,
} from './hydrate.ts';

const SHA = 'ef8a40cdd67bc456a5ac4370d6c90daee85c4535b3621c3eeba10b7b160f54ee';

describe('splitFrontmatter', () => {
  it('separates the identity block from the body', () => {
    const text = '---\ntitle: X\napp_code: XU\n---\n\n# Heading\nBody.';
    const parts = splitFrontmatter(text);
    assert.equal(parts.frontmatter, 'title: X\napp_code: XU');
    assert.equal(parts.body, '\n# Heading\nBody.');
  });

  it('passes through a body with no frontmatter', () => {
    const parts = splitFrontmatter('# Just a heading\n');
    assert.equal(parts.frontmatter, '');
    assert.equal(parts.body, '# Just a heading\n');
  });
});

describe('stripNavChrome (predecessor bug class: nav chrome in text)', () => {
  it('removes standalone back-to-contents lines', () => {
    const md = 'Before.\n\n[↑ Back to Contents](#contents)\n\nAfter.';
    assert.equal(stripNavChrome(md), 'Before.\n\nAfter.');
  });

  it('keeps an inline mention inside a sentence', () => {
    const md = 'See [↑ Back to Contents](#contents) for details.';
    assert.equal(stripNavChrome(md), md);
  });

  it('leaves ordinary links alone', () => {
    const md = '[Contents of the file](#contents-of-file)';
    assert.equal(stripNavChrome(md), md);
  });
});

describe('rewriteImages (predecessor bug class: CAS image paths)', () => {
  const resolve = (name: string): string | undefined =>
    name.startsWith(SHA) ? `https://asset.test/${name}` : undefined;

  it('rewrites a resolved CAS reference, keeping the alt text', () => {
    assert.equal(
      rewriteImages(`![Figure 1](${SHA}.jpeg)`, resolve),
      `![Figure 1](https://asset.test/${SHA}.jpeg)`,
    );
  });

  it('replaces an unresolved CAS reference with a visible note — never a broken image', () => {
    const out = rewriteImages(`![](${'a'.repeat(64)}.png)`, resolve);
    assert.ok(!out.includes('!['), `no broken image left: ${out}`);
    assert.ok(out.includes('aaaaaaaa'), 'note names the asset');
    assert.ok(out.toLowerCase().includes('unavailable'));
  });

  it('preserves prose glued directly after the image (real corpus shape)', () => {
    const md = `> ![](${SHA}.jpeg)The Templates section opens:`;
    const out = rewriteImages(md, resolve);
    assert.ok(out.startsWith('> '));
    assert.ok(out.endsWith('The Templates section opens:'));
    assert.ok(out.includes(`https://asset.test/${SHA}.jpeg`));
  });

  it('leaves non-CAS image links untouched', () => {
    const md = '![logo](https://example.test/logo.png) and ![x](images/x.gif)';
    assert.equal(rewriteImages(md, resolve), md);
  });

  it('handles multiple CAS references on one line', () => {
    const md = `![](${SHA}.jpeg) then ![](${'b'.repeat(64)}.gif)`;
    const out = rewriteImages(md, resolve);
    assert.ok(out.includes('https://asset.test/'));
    assert.ok(out.toLowerCase().includes('unavailable'));
  });
});

describe('parseCsv', () => {
  const cases = [
    {
      name: 'plain rows',
      csv: 'a,b\nc,d\n',
      rows: [
        ['a', 'b'],
        ['c', 'd'],
      ],
    },
    { name: 'quoted comma', csv: '"a,x",b\n', rows: [['a,x', 'b']] },
    { name: 'escaped quote', csv: '"say ""hi""",b\n', rows: [['say "hi"', 'b']] },
    { name: 'quoted newline', csv: '"line1\nline2",b\n', rows: [['line1\nline2', 'b']] },
    {
      name: 'CRLF endings',
      csv: 'a,b\r\nc,d\r\n',
      rows: [
        ['a', 'b'],
        ['c', 'd'],
      ],
    },
    { name: 'empty text', csv: '', rows: [] },
  ];
  for (const tc of cases) {
    it(`parses ${tc.name}`, () => {
      assert.deepEqual(parseCsv(tc.csv), tc.rows);
    });
  }
});

describe('csvToMarkdownTable', () => {
  it('renders header + rows with pipe escaping', () => {
    const md = csvToMarkdownTable('Name,Use|Case\nA,plain\n');
    assert.equal(md, '| Name | Use\\|Case |\n| --- | --- |\n| A | plain |');
  });

  it('caps rows with a remainder note', () => {
    const md = csvToMarkdownTable('h1,h2\n1,a\n2,b\n3,c\n', 2);
    assert.ok(md.includes('| 2 | b |'));
    assert.ok(!md.includes('| 3 | c |'));
    assert.ok(md.includes('1 more row'));
  });

  it('renders newlines inside cells as line breaks, keeping the row intact', () => {
    const md = csvToMarkdownTable('h\n"line1\nline2"\n');
    assert.ok(md.includes('| line1<br>line2 |'));
  });

  it('returns empty for empty csv', () => {
    assert.equal(csvToMarkdownTable(''), '');
  });
});

describe('hydrateTables (predecessor bug class: mis-nested placeholder collapsed tables)', () => {
  const CSV = 'Field,Meaning\nNAME,"The, name"\n';
  const load = (rel: string): string | undefined =>
    rel === 'tables/table-01.csv' ? CSV : undefined;
  const placeholder = '_[Table 1 (extracted to CSV)](tables/table-01.csv)_';

  it('hydrates a top-level placeholder into a captioned grid', () => {
    const out = hydrateTables(`Before.\n\n${placeholder}\n\nAfter.`, load);
    assert.ok(out.includes('**Table 1**'));
    assert.ok(out.includes('| Field | Meaning |'));
    assert.ok(out.includes('| NAME | The, name |'));
    assert.ok(out.includes('Before.') && out.includes('After.'), 'surrounding prose intact');
  });

  it('hydrates a placeholder nested in a blockquote WITHOUT breaking the quote', () => {
    // THE bug class: the predecessor mis-nested this shape and the
    // table silently collapsed. Every generated line must carry the
    // blockquote prefix, and nothing may be dropped.
    const out = hydrateTables(`> intro\n> ${placeholder}\n> outro`, load);
    assert.ok(out.includes('> intro') && out.includes('> outro'), 'quote context intact');
    const tableLines = out.split('\n').filter((l) => l.includes('|'));
    assert.ok(tableLines.length >= 3, 'header, separator, and data rows present');
    for (const line of tableLines) {
      assert.ok(line.startsWith('> '), `table row stays inside the quote: ${line}`);
    }
    assert.ok(out.includes('NAME'), 'data rows present');
  });

  it('keeps the visible link when the sidecar is missing — never silently drops', () => {
    const md = '_[Table 9 (extracted to CSV)](tables/table-09.csv)_';
    const out = hydrateTables(md, load);
    assert.ok(out.includes('tables/table-09.csv'), 'link preserved');
    assert.ok(out.includes('Table 9'), 'caption preserved');
  });

  it('leaves a placeholder embedded mid-sentence intact (appends nothing inside prose)', () => {
    const md = `See ${placeholder} for the field list.`;
    const out = hydrateTables(md, load);
    assert.ok(out.includes('See') && out.includes('for the field list.'), 'prose intact');
    assert.ok(out.includes('| Field | Meaning |'), 'table still delivered');
  });

  it('does not touch ordinary italic links', () => {
    const md = '_[some other link](other/place.md)_';
    assert.equal(hydrateTables(md, load), md);
  });
});

describe('hydrateBoilerplate', () => {
  const link =
    '_[The intended audience of this man — shared boilerplate](_shared/boilerplate/bp-4500bb1269.md)_';

  it('inlines shared boilerplate as an attributed quote', () => {
    const out = hydrateBoilerplate(link, () => 'Full boilerplate text.\nSecond line.');
    assert.ok(out.includes('> Full boilerplate text.'));
    assert.ok(out.includes('> Second line.'));
    assert.ok(out.toLowerCase().includes('shared boilerplate'), 'provenance kept');
  });

  it('keeps the visible link when the boilerplate is unavailable', () => {
    const out = hydrateBoilerplate(link, () => undefined);
    assert.equal(out, link);
  });

  it('leaves ordinary links alone', () => {
    const md = '_[a link](somewhere/else.md)_';
    assert.equal(
      hydrateBoilerplate(md, () => 'x'),
      md,
    );
  });
});
