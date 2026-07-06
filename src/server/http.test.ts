import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { type Store, openStore } from '../store/engine.ts';
import { buildFixtureDb } from '../store/fixture.ts';
import { type RunningNavigator, startNavigator } from './http.ts';

const DOCS = [
  {
    doc_key: 'XU/xu_8_0_um',
    title: 'Kernel User Manual',
    app_code: 'XU',
    app_name: 'Kernel',
    doc_type: 'UM',
    section: 'INF',
    bundle_path: 'XU/xu_um',
    sections: [
      {
        section_id: 'XU/xu_8_0_um/intro',
        slug: 'intro',
        title: 'Introduction',
        kind: 'ok',
        seq: 0,
        chunks: ['Kernel is the infrastructure.'],
      },
    ],
  },
  {
    doc_key: 'OR/or_3_0_tm',
    title: 'CPRS Technical Manual',
    app_code: 'OR',
    app_name: 'Order Entry',
    doc_type: 'TM',
    section: 'CLI',
    sections: [
      {
        section_id: 'OR/or_3_0_tm/rpcs',
        slug: 'rpcs',
        title: 'RPCs',
        kind: 'ok',
        seq: 0,
        chunks: ['ORWPT SELECT returns demographics.'],
      },
    ],
  },
];

describe('navigator http server', () => {
  let dir: string;
  let store: Store;
  let nav: RunningNavigator;
  const get = (path: string): Promise<Response> => fetch(`${nav.url}${path}`);
  const getJSON = async (path: string): Promise<unknown> => {
    const res = await get(path);
    assert.equal(res.status, 200, `${path}: ${res.status}`);
    return res.json();
  };

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'atlas-http-'));
    const dbPath = join(dir, 'fixture.db');
    buildFixtureDb(dbPath, DOCS);
    store = openStore(dbPath);

    const staticDir = join(dir, 'static');
    mkdirSync(join(staticDir, '_app'), { recursive: true });
    writeFileSync(join(staticDir, 'index.html'), '<!doctype html><title>nav</title>');
    writeFileSync(join(staticDir, '_app', 'x.js'), 'export const x = 1;');

    const tablesDir = join(dir, 'consolidated');
    mkdirSync(join(tablesDir, 'XU/xu_um/tables'), { recursive: true });
    writeFileSync(join(tablesDir, 'XU/xu_um/tables/table-01.csv'), 'a,b\n1,2\n');

    const assetsDir = join(dir, 'assets');
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(join(assetsDir, `${'c'.repeat(64)}.png`), Buffer.from([1, 2, 3]));

    nav = await startNavigator({ store, staticDir, tablesDir, assetsDir });
  });
  after(async () => {
    await nav.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves /api/meta with the contract version', async () => {
    const meta = (await getJSON('/api/meta')) as { read_schema_version: string };
    assert.equal(meta.read_schema_version, '1.5');
  });

  it('serves /api/vocab', async () => {
    const v = (await getJSON('/api/vocab')) as { AppName: Record<string, string> };
    assert.equal(v.AppName.XU, 'Kernel');
  });

  it('serves /api/facets with an axis', async () => {
    assert.deepEqual(await getJSON('/api/facets?axis=app_code'), [
      { Value: 'OR', Count: 1 },
      { Value: 'XU', Count: 1 },
    ]);
  });

  it('400s /api/facets without an axis', async () => {
    assert.equal((await get('/api/facets')).status, 400);
  });

  it('serves filtered /api/candidates with FTS', async () => {
    const docs = (await getJSON('/api/candidates?doc_type=TM&q=ORWPT')) as { DocKey: string }[];
    assert.deepEqual(
      docs.map((d) => d.DocKey),
      ['OR/or_3_0_tm'],
    );
  });

  it('serves /api/doc/{docKey}/toc with an encoded key', async () => {
    const toc = (await getJSON(`/api/doc/${encodeURIComponent('XU/xu_8_0_um')}/toc`)) as {
      ID: string;
    }[];
    assert.deepEqual(
      toc.map((s) => s.ID),
      ['XU/xu_8_0_um/intro'],
    );
  });

  it('serves /api/section/{id} as {text}', async () => {
    const body = (await getJSON(`/api/section/${encodeURIComponent('XU/xu_8_0_um/intro')}`)) as {
      text: string;
    };
    assert.equal(body.text, 'Kernel is the infrastructure.');
  });

  it('serves /api/preview/{docKey} as {text}', async () => {
    const body = (await getJSON(`/api/preview/${encodeURIComponent('OR/or_3_0_tm')}`)) as {
      text: string;
    };
    assert.ok(body.text.includes('ORWPT SELECT'));
  });

  it('serves a doc table CSV through bundle_path', async () => {
    const res = await get(`/api/table/${encodeURIComponent('XU/xu_8_0_um')}/table-01.csv`);
    assert.equal(res.status, 200);
    assert.ok((res.headers.get('content-type') ?? '').includes('text/csv'));
    assert.equal(await res.text(), 'a,b\n1,2\n');
  });

  const badTables = [
    ['missing sidecar', `/api/table/${encodeURIComponent('XU/xu_8_0_um')}/table-99.csv`],
    ['non-csv name', `/api/table/${encodeURIComponent('XU/xu_8_0_um')}/evil.sh`],
    ['traversal name', `/api/table/${encodeURIComponent('XU/xu_8_0_um')}/..%2Fsecret.csv`],
    ['unknown doc', `/api/table/${encodeURIComponent('NO/doc')}/table-01.csv`],
  ] as const;
  for (const [name, path] of badTables) {
    it(`404s table route: ${name}`, async () => {
      assert.equal((await get(path)).status, 404);
    });
  }

  it('serves a CAS asset by bare name, 404s traversal', async () => {
    const ok = await get(`/api/asset/${'c'.repeat(64)}.png`);
    assert.equal(ok.status, 200);
    assert.deepEqual(new Uint8Array(await ok.arrayBuffer()), new Uint8Array([1, 2, 3]));
    assert.equal((await get('/api/asset/..%2Ffixture.db')).status, 404);
  });

  it('serves the SPA index at / and static assets with types', async () => {
    const home = await get('/');
    assert.equal(home.status, 200);
    assert.ok((await home.text()).includes('<title>nav</title>'));
    const js = await get('/_app/x.js');
    assert.equal(js.status, 200);
    assert.ok((js.headers.get('content-type') ?? '').includes('javascript'));
  });

  it('falls back to index.html for unknown extension-less paths', async () => {
    const res = await get('/some/spa/route');
    assert.equal(res.status, 200);
    assert.ok((await res.text()).includes('<title>nav</title>'));
  });

  it('404s static traversal attempts', async () => {
    assert.equal((await get('/..%2F..%2Fetc%2Fpasswd')).status, 404);
  });
});
