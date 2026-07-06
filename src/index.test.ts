import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import * as api from './index.ts';

describe('public API surface (atlas data layer)', () => {
  // Everything a consumer (the extension host code, later the twin)
  // needs is re-exported from the package root. A name disappearing
  // from here is a breaking change.
  const exported: readonly string[] = [
    // engine
    'openStore',
    // verify
    'sha256File',
    'verifyFile',
    // release records
    'parseReleaseRecord',
    'loadReleaseRecord',
    'assetUrl',
    // fetch + bundle install
    'ensureAsset',
    'installDataRelease',
    'parseProducerManifest',
    'loadProducerManifest',
    'extractTarGz',
    // index.db contract
    'checkIndexDb',
    'INDEX_DB_VIEWS',
    'INDEX_DB_FTS',
    // query layer
    'listDocuments',
    'facetCounts',
    'getDocument',
    'listSections',
    'sectionText',
    'joinChunkParts',
    'searchChunks',
    'escapeFtsQuery',
    'getSection',
    'vocabLabels',
    // library tree + reading models
    'childrenOf',
    'facetDimensions',
    'sectionMarkdown',
    'readingUriParts',
    'sectionIdFromQuery',
    // hydration transforms
    'splitFrontmatter',
    'stripNavChrome',
    'rewriteImages',
    'parseCsv',
    'csvToMarkdownTable',
    'hydrateTables',
    'hydrateBoilerplate',
    'makeGoldLoaders',
    // navigator server (the vdocs-web surface, in-process)
    'startNavigator',
    'navigatorHandler',
    'cleanTitle',
    'where',
    'ftsSanitize',
    'isDocAxis',
    'DOC_AXES',
    // twin-link contract v1
    'loadTwinLinkContract',
    'validatePayload',
    'parseCitation',
    'buildDeepLink',
    'parseDeepLink',
  ];
  for (const name of exported) {
    it(`exports ${name}`, () => {
      assert.ok(name in api, `missing export: ${name}`);
    });
  }
});
