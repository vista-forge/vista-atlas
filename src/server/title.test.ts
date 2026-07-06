import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { cleanTitle } from './title.ts';

// Ported verbatim from the reference (vdocs-web internal/index/title_test.go,
// code reference authorized by owner 2026-07-05) — the display titles must
// match what vdocs-web showed.
describe('cleanTitle', () => {
  const cases: readonly [raw: string, app: string, want: string][] = [
    [
      'RMPR*3*59 Delayed Order Report (DOR) (GUI) User Manual',
      'RMPR',
      'Delayed Order Report (DOR) (GUI) User Manual',
    ],
    [
      'Accounts Receivable Version 4.5 User Manual - Title Page',
      'PRCA',
      'Accounts Receivable User Manual - Title Page',
    ],
    [
      'Consult/Request Tracking Technical Manual (GMRC*3.0*189)',
      'GMRC',
      'Consult/Request Tracking Technical Manual',
    ],
    [
      'National Drug File - User Manual (Updated PSN*4.0*575)',
      'PSN',
      'National Drug File - User Manual',
    ],
    ['VistALink Version 1.5 Developer Guide', 'XOBV', 'VistALink Developer Guide'],
    ['QUASAR Version 3 User Manual (Updated ACKQ*3*21)', 'ACKQ', 'QUASAR User Manual'],
    [
      'Laboratory: VBECS Version 2.4.1 Admin User Guide',
      'VBECS',
      'Laboratory: VBECS Admin User Guide',
    ],
    [
      'VistA Scheduling Enhancement (VSE) GUI 1.7.2.1 User Guide Addendum',
      'SDEC',
      'VistA Scheduling Enhancement (VSE) GUI User Guide Addendum',
    ],
    ["IFCAP Version 5.1 Budget Analyst User's Guide", 'PRC', "IFCAP Budget Analyst User's Guide"],
    ['XWB*1.1*73 User Guide', 'XWB', 'XWB — User Guide'],
    ["PSJ*5*279 Nurse's User Manual Change Pages", 'PSJ', "PSJ — Nurse's User Manual Change Pages"],
    ["DI — Developer's Guide", 'DI', "DI — Developer's Guide"],
    ['DI', 'DI', 'DI'],
  ];
  for (const [raw, app, want] of cases) {
    it(`${JSON.stringify(raw)} → ${JSON.stringify(want)}`, () => {
      assert.equal(cleanTitle(raw, app), want);
    });
  }

  it('falls back to the app code for an all-version title', () => {
    assert.equal(cleanTitle('XU*8.0*777', 'XU'), 'XU');
  });
});
