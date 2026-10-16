import test from 'node:test';
import assert from 'node:assert/strict';
import { assetResponse } from '../worker.js';
test('private media policy permits local and embedded narration but not remote providers', () => {
  const response = assetResponse(new Request('https://app/'), {
    '/index.html': { body: btoa('<html></html>'), type: 'text/html' },
  });
  const csp = response.headers.get('Content-Security-Policy');
  assert(csp.includes("media-src 'self' data:;"));
  assert(csp.includes("script-src 'self';"));
  assert(csp.includes("frame-ancestors 'none'"));
});
