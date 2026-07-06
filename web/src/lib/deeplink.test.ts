import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { parseDeepLink } from './deeplink';

describe('parseDeepLink', () => {
  const cases: {
    name: string;
    search: string;
    want: ReturnType<typeof parseDeepLink>;
  }[] = [
    {
      name: 'empty search → neutral state',
      search: '',
      want: { sel: {}, q: '', scope: 'all', doc: null, section: null },
    },
    {
      name: 'ignores a bare question mark',
      search: '?',
      want: { sel: {}, q: '', scope: 'all', doc: null, section: null },
    },
    {
      name: 'full-text query with scope',
      search: '?q=kernel+installation&scope=headings',
      want: { sel: {}, q: 'kernel installation', scope: 'headings', doc: null, section: null },
    },
    {
      name: 'invalid scope falls back to all',
      search: '?q=x&scope=bogus',
      want: { sel: {}, q: 'x', scope: 'all', doc: null, section: null },
    },
    {
      name: 'doc key decodes %2F path segments',
      search: '?doc=cprs%2Fuser-manual',
      want: { sel: {}, q: '', scope: 'all', doc: 'cprs/user-manual', section: null },
    },
    {
      name: 'section with its doc',
      search: '?doc=xu%2Ftm&section=xu%2Ftm%23s-042',
      want: { sel: {}, q: '', scope: 'all', doc: 'xu/tm', section: 'xu/tm#s-042' },
    },
    {
      name: 'facet axes are repeatable, OR within an axis (API grammar)',
      search: '?app_user=cprs&app_user=kaajee&doc_type=TM',
      want: {
        sel: { app_user: ['cprs', 'kaajee'], doc_type: ['TM'] },
        q: '',
        scope: 'all',
        doc: null,
        section: null,
      },
    },
    {
      name: 'unknown params are ignored (never poison the selection)',
      search: '?bogus_axis=x&q=y',
      want: { sel: {}, q: 'y', scope: 'all', doc: null, section: null },
    },
    {
      name: 'empty values are dropped',
      search: '?doc=&q=&app_user=',
      want: { sel: {}, q: '', scope: 'all', doc: null, section: null },
    },
  ];

  for (const tc of cases) {
    it(tc.name, () => {
      assert.deepEqual(parseDeepLink(tc.search), tc.want);
    });
  }
});
