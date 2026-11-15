import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('incoming delivery horizon form displays a close cross instead of a question mark', async () => {
  const vite = await createServer({ server: { middlewareMode: true, preTransformRequests: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
  try {
    const { IncomingHorizonDialog } = await vite.ssrLoadModule('/client/src/dialogs/IncomingHorizonDialog.jsx');
    const markup = renderToStaticMarkup(React.createElement(IncomingHorizonDialog, {
      value: 2, unit: 'weeks', onClose() {}, onSave() {},
    }));
    assert.match(markup, /aria-label="Close horizon form">×<\/button>/);
  } finally { await vite.close(); }
});

test('home view is the accessible dashboard landing section', async () => {
  const vite = await createServer({ server: { middlewareMode: true, preTransformRequests: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
  try {
    const { HomeView } = await vite.ssrLoadModule('/client/src/views/HomeView.jsx');
    const markup = renderToStaticMarkup(React.createElement(HomeView, {
      status: { auth: { account: { id: 'gmail:a@example.com' } } },
      inventory: [],
    }));

    assert.match(markup, /class="home"/);
    assert.match(markup, /id="home"/);
    assert.match(markup, /aria-labelledby="home-title"/);
    assert.match(markup, /<h2 id="home-title">Home<\/h2>/);
    assert.match(markup, /Add visualization/);
    assert.match(markup, /Loading dashboard/);
    assert.doesNotMatch(markup, /<table/);
    assert.doesNotMatch(markup, /Purchases|Inventory|Deliveries|Production|Assemblies/);
  } finally { await vite.close(); }
});
