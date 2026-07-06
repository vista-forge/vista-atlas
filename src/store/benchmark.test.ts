import { strict as assert } from 'node:assert';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { listSections, searchChunks } from '../model/queries.ts';
import { getDocument } from '../model/queries.ts';
import { sectionMarkdown } from '../model/reading.ts';
import { openStore } from './engine.ts';

// The automated core of the P2 parity acceptance (proposal §8): ten
// benchmark documents spanning clinical / infrastructure / financial
// apps and doc types. Every section of every benchmark must render
// through the hydrating reading surface without error, chrome-free
// and citation-stamped. The visual side-by-side against vdocs-web
// stays a human check; this sweep is what a machine can hold green.
const BENCHMARKS = [
  'DI/fm22_2dg', // FileMan developer's guide — the biggest doc in the corpus
  'XU/krn_8_0_tm', // Kernel technical manual
  'XWB/xwb_1_1_dg_r', // RPC Broker developer's guide
  'CPRS/cprsguium', // CPRS GUI user manual
  'PXRM/pxrm_2_22_mm', // Clinical Reminders manager's manual
  'LR/lab5_2tm', // Laboratory technical manual
  'PSO/pso_7_0_p653_man_um', // Outpatient Pharmacy user manual
  'TIU/tiutm', // Text Integration Utilities technical manual
  'GMTS/hsum_2_7_um', // Health Summary user manual
  'VBECS/vbecs_2_4_1_user_guide', // VBECS user guide
];

const REAL_DB = join(
  process.env.VDOCS_DATA_HOME ?? join(process.env.HOME ?? '', 'data/vdocs'),
  'dist/index.db',
);

// Opt-in (ATLAS_BENCHMARK=1): the sweep renders ~4k sections and the
// published index.db has no chunks(section_id) index yet (each section
// body is a table SCAN, ~36 ms — recorded as a P-vdocs producer item in
// the tracker), so a full pass runs ~2.5 minutes. Run it before
// declaring a P2 parity milestone, not on every push.
const OPTED_IN = process.env.ATLAS_BENCHMARK === '1';

describe('P2 benchmark sweep (10 docs, every section renders)', () => {
  it(
    'all benchmark documents resolve, list, render, and search',
    { skip: !(OPTED_IN && existsSync(REAL_DB)) },
    () => {
      const store = openStore(REAL_DB);
      let sectionsRendered = 0;
      try {
        for (const docKey of BENCHMARKS) {
          const doc = getDocument(store, docKey);
          assert.ok(doc, `benchmark resolves: ${docKey}`);
          assert.equal(doc.is_latest, 1, `${docKey} is the latest of its group`);

          const sections = listSections(store, docKey);
          assert.equal(
            sections.length,
            doc.section_count,
            `${docKey}: TOC lists every declared section`,
          );

          for (const section of sections) {
            const markdown = sectionMarkdown(store, section.section_id);
            assert.ok(markdown, `${section.section_id} renders`);
            assert.ok(
              markdown.includes(`vdocs://section/${section.section_id}`),
              `${section.section_id} carries its citation`,
            );
            assert.ok(
              !markdown
                .split('\n')
                .some((line) => line.trim() === '[↑ Back to Contents](#contents)'),
              `${section.section_id} is chrome-free`,
            );
            sectionsRendered += 1;
          }

          // The document is findable: its app-filtered search returns it.
          const token = doc.title.split(/\s+/).find((word) => word.length > 4) ?? doc.app_code;
          const hits = searchChunks(store, token, {
            filters: { app_code: doc.app_code },
            limit: 30,
          });
          assert.ok(hits.length > 0, `${docKey}: search finds "${token}"`);
        }
        assert.ok(sectionsRendered > 3000, `swept ${sectionsRendered} sections`);
      } finally {
        store.close();
      }
    },
  );
});
