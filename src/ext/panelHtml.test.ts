import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { panelHtml } from './panelHtml.ts';

describe('panelHtml', () => {
  it('frames the navigator URL with a CSP allowing its origin', () => {
    const html = panelHtml('http://127.0.0.1:39999/');
    assert.ok(html.includes('<iframe src="http://127.0.0.1:39999/"'));
    assert.ok(html.includes('frame-src http://127.0.0.1:39999'));
    assert.ok(html.includes("default-src 'none'"));
  });

  it('escapes hostile characters in the frame URI attribute', () => {
    const html = panelHtml('http://127.0.0.1:1/"><script>x</script>');
    assert.ok(!html.includes('"><script>'));
    assert.ok(html.includes('&quot;&gt;&lt;script&gt;'));
  });
});
