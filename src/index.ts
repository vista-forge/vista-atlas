/**
 * vista-atlas — VSCode extension over the vdocs gold-corpus data
 * release (index.db + gold tree): what the VA documentation SAYS.
 *
 * This package root exports the Atlas data layer: the shared
 * vista-store modules (kept byte-identical with vista-compass's until
 * the lib extracts to a sibling repo), the index.db contract check,
 * the query layer, and the twin-link contract v1 seam.
 */

export {
  checkIndexDb,
  type ContractReport,
  INDEX_DB_FTS,
  INDEX_DB_VIEWS,
  type IndexContractExpectation,
} from './store/contract.js';
export { openStore, type SqlRow, type SqlValue, type Store } from './store/engine.js';
export {
  installDataRelease,
  type InstallOptions,
  type InstallResult,
} from './store/bundle.js';
export {
  ensureAsset,
  type EnsureAssetOptions,
  type EnsureAssetResult,
} from './store/fetch.js';
export {
  loadProducerManifest,
  parseProducerManifest,
  type ProducerManifest,
} from './store/manifest.js';
export {
  assetUrl,
  loadReleaseRecord,
  parseReleaseRecord,
  type ReleaseRecord,
} from './store/release.js';
export { type ExtractOptions, extractTarGz, type TarEntry } from './store/tar.js';
export { type ExpectedFile, sha256File, verifyFile, type VerifyResult } from './store/verify.js';
export { childrenOf, facetDimensions, type LibraryNode } from './model/library.js';
export { readingUriParts, sectionIdFromQuery, sectionMarkdown } from './model/reading.js';
export {
  type DocumentDetail,
  type DocumentFacet,
  type DocumentFilters,
  type DocumentSummary,
  escapeFtsQuery,
  facetCounts,
  getDocument,
  getSection,
  joinChunkParts,
  listDocuments,
  listSections,
  type Page,
  searchChunks,
  type SearchHit,
  type SearchOptions,
  type SearchScope,
  type SectionRow,
  sectionText,
  vocabLabels,
} from './model/queries.js';
export {
  buildDeepLink,
  type Citation,
  type CommandSpec,
  loadTwinLinkContract,
  type ParamSpec,
  parseCitation,
  parseDeepLink,
  type ParsedDeepLink,
  type Target,
  type TwinLinkContract,
  validatePayload,
  type ValidationResult,
} from './twinlink.js';
