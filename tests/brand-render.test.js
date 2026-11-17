import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('brand wordmark reads Prod. Guard', async () => {
  const vite = await createServer({ server: { middlewareMode: true, preTransformRequests: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
  try {
    const { Brand } = await vite.ssrLoadModule('/client/src/components/Brand.jsx');
    const markup = renderToStaticMarkup(React.createElement(Brand));
    assert.match(markup, /<h1 class="brand-title">Prod\. Guard<\/h1>/);
    assert.match(markup, /Purchase order review/);
    assert.doesNotMatch(markup, /PO Checker/);
  } finally { await vite.close(); }
});
