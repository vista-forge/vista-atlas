import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { DOC_AXES, type Filter, ftsMatch, ftsSanitize, isDocAxis, where } from './filter.ts';

// Ported from the reference semantics (vdocs-web internal/index/filter_test.go,
// code reference authorized by owner 2026-07-05).
describe('where', () => {
  it('empty filter is is_latest only', () => {
    const { clause, args } = where({ sel: {} });
    assert.equal(clause, 'is_latest = 1');
    assert.deepEqual(args, []);
  });

  it('single axis, single value', () => {
    const { clause, args } = where({ sel: { doc_type: ['UM'] } });
    assert.equal(clause, 'is_latest = 1 AND doc_type IN (?)');
    assert.deepEqual(args, ['UM']);
  });

  it('OR within an axis', () => {
    const { clause, args } = where({ sel: { doc_type: ['UM', 'TM'] } });
    assert.equal(clause, 'is_latest = 1 AND doc_type IN (?, ?)');
    assert.deepEqual(args, ['UM', 'TM']);
  });

  it('AND across axes in fixed DocAxes order, regardless of object order', () => {
    const filter: Filter = {
      sel: {
        function_category: ['Clinical Services'],
        doc_type: ['UM'],
        app_user: ['clinical'],
      },
    };
    const { clause, args } = where(filter);
    assert.equal(
      clause,
      'is_latest = 1 AND doc_type IN (?) AND app_user IN (?) AND function_category IN (?)',
    );
    assert.deepEqual(args, ['UM', 'clinical', 'Clinical Services']);
  });

  it('omit relaxes exactly one axis', () => {
    const filter: Filter = { sel: { doc_type: ['UM'], app_user: ['clinical'] } };
    const { clause, args } = where(filter, 'doc_type');
    assert.equal(clause, 'is_latest = 1 AND app_user IN (?)');
    assert.deepEqual(args, ['clinical']);
  });

  it('ignores unknown (hostile) axis names', () => {
    const { clause, args } = where({ sel: { 'evil; DROP TABLE documents': ['x'] } });
    assert.equal(clause, 'is_latest = 1');
    assert.deepEqual(args, []);
  });

  it('adds a doc-level FTS subquery clause', () => {
    const { clause, args } = where({ sel: {}, fts: 'kernel menu' });
    assert.equal(
      clause,
      'is_latest = 1 AND doc_key IN (SELECT doc_key FROM chunks_fts WHERE chunks_fts MATCH ?)',
    );
    assert.deepEqual(args, ['"kernel" "menu"']);
  });

  it('a blank FTS query adds no clause', () => {
    const { clause } = where({ sel: {}, fts: '   ' });
    assert.equal(clause, 'is_latest = 1');
  });

  it('omit "fts" relaxes the FTS clause', () => {
    const { clause } = where({ sel: {}, fts: 'kernel' }, 'fts');
    assert.equal(clause, 'is_latest = 1');
  });

  it('adds an entity-mention subquery clause', () => {
    const { clause, args } = where({ sel: {}, entity: ['routine:XUP', 'rpc:X'] });
    assert.equal(
      clause,
      'is_latest = 1 AND doc_key IN (SELECT doc_key FROM v_entity_mentions WHERE entity_id IN (?, ?))',
    );
    assert.deepEqual(args, ['routine:XUP', 'rpc:X']);
  });
});

describe('isDocAxis / DOC_AXES', () => {
  it('whitelists exactly the ten documents-table axes', () => {
    assert.equal(DOC_AXES.length, 10);
    assert.ok(isDocAxis('pub_year'));
    assert.ok(!isDocAxis('doc_key'));
    assert.ok(!isDocAxis('evil'));
  });
});

describe('ftsSanitize / ftsMatch', () => {
  const cases = [
    { q: 'kernel menu', want: '"kernel" "menu"' },
    { q: ' ^DIC( ', want: '"^DIC("' },
    { q: 'say "hi"', want: '"say" """hi"""' },
    { q: '', want: '' },
    { q: '   ', want: '' },
  ];
  for (const tc of cases) {
    it(`sanitizes ${JSON.stringify(tc.q)}`, () => {
      assert.equal(ftsSanitize(tc.q), tc.want);
    });
  }

  it('wraps a name scope in the doc_title column filter', () => {
    assert.equal(ftsMatch('cprs', 'name'), '{doc_title}:("cprs")');
  });

  it('wraps a headings scope in the title+path column filter', () => {
    assert.equal(ftsMatch('menu', 'headings'), '{title section_path}:("menu")');
  });

  it('unknown scope means all columns', () => {
    assert.equal(ftsMatch('menu', 'bogus'), '"menu"');
  });
});
