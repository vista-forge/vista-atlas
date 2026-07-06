import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { navigatorLinkQuery, withLinkQuery } from './link.ts';

// Section→doc resolution for the tests: one known section.
const resolve = (sectionId: string): string | undefined =>
  sectionId === 'xu/tm#s-042' ? 'xu/tm' : undefined;

describe('navigatorLinkQuery', () => {
  const cases: {
    name: string;
    command: string;
    payload: unknown;
    want: string;
  }[] = [
    {
      name: 'openDoc → ?doc with the key %-encoded as one value',
      command: 'vistaAtlas.openDoc',
      payload: { doc_key: 'cprs/user-manual' },
      want: '?doc=cprs%2Fuser-manual',
    },
    {
      name: 'openSection resolves its doc and carries both',
      command: 'vistaAtlas.openSection',
      payload: { section_id: 'xu/tm#s-042' },
      want: '?doc=xu%2Ftm&section=xu%2Ftm%23s-042',
    },
    {
      name: 'openSection with an unknown id degrades to a plain open',
      command: 'vistaAtlas.openSection',
      payload: { section_id: 'nope#s-1' },
      want: '',
    },
    {
      name: 'search → ?q',
      command: 'vistaAtlas.search',
      payload: { query: 'kernel installation' },
      want: '?q=kernel+installation',
    },
    {
      name: 'search filters map to repeatable facet-axis params',
      command: 'vistaAtlas.search',
      payload: { query: 'error', filters: { app_user: ['cprs', 'kaajee'], doc_type: 'TM' } },
      want: '?q=error&app_user=cprs&app_user=kaajee&doc_type=TM',
    },
    {
      name: 'filter axes outside the displayed whitelist are dropped',
      command: 'vistaAtlas.search',
      payload: { query: 'x', filters: { bogus: ['y'], pkg_ns: ['DI'] } },
      want: '?q=x&pkg_ns=DI',
    },
    {
      name: 'invalid payload degrades to a plain open',
      command: 'vistaAtlas.openDoc',
      payload: { wrong: 1 },
      want: '',
    },
    {
      name: 'missing payload degrades to a plain open',
      command: 'vistaAtlas.openDoc',
      payload: undefined,
      want: '',
    },
    {
      name: 'non-deep-linkable command degrades to a plain open',
      command: 'vistaAtlas.pins',
      payload: {},
      want: '',
    },
  ];

  for (const tc of cases) {
    it(tc.name, () => {
      assert.equal(navigatorLinkQuery(tc.command, tc.payload, resolve), tc.want);
    });
  }
});

describe('withLinkQuery', () => {
  const cases: { name: string; base: string; query: string; want: string }[] = [
    {
      name: 'empty query returns the base untouched',
      base: 'http://127.0.0.1:39311/',
      query: '',
      want: 'http://127.0.0.1:39311/',
    },
    {
      name: 'appends the deep-link params',
      base: 'http://127.0.0.1:39311/',
      query: '?doc=xu%2Ftm&section=xu%2Ftm%23s-042',
      want: 'http://127.0.0.1:39311/?doc=xu%2Ftm&section=xu%2Ftm%23s-042',
    },
    {
      name: 'preserves params already on the base (tunnel tokens)',
      base: 'https://tunnel.example/proxy/39311/?token=abc',
      query: '?doc=k',
      want: 'https://tunnel.example/proxy/39311/?token=abc&doc=k',
    },
  ];
  for (const tc of cases) {
    it(tc.name, () => {
      assert.equal(withLinkQuery(tc.base, tc.query), tc.want);
    });
  }
});
