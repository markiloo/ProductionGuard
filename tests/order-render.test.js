import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fullDate } from '../client/src/lib/format.js';

test('order detail renders Recommended and one-day arrival copy while escaping hostile email text', async () => {
  const vite = await createServer({ server: { middlewareMode: true, preTransformRequests: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
  try {
    const { PoDetailDialog } = await vite.ssrLoadModule('/client/src/dialogs/PoDetailDialog.jsx');
    const markup = renderToStaticMarkup(React.createElement(PoDetailDialog, {
      po: {
        poId: 'PO-0001', state: 'pending_review', item: 'X', sku: 'X', quantity: 100, unit: 'units',
        events: [], body: '<img src="https://attacker.invalid/tracker" onerror="alert(1)">',
        assessment: { decision: 'Recommended', flag: 'recommended', daysEarly: 1, needDate: '2026-01-11', arrival: '2026-01-10', warnings: [], balances: [], demand: [], deliveries: [], coverage: [] },
      },
      skuOptions: [], onClose() {},
    }));
    assert.match(markup, /Recommended/);
    assert.match(markup, /arriving one day early/);
    assert.match(markup, /&lt;img/);
    assert.doesNotMatch(markup, /<img[^>]+attacker/);
    const stamp = '2026-01-01T00:00:00Z';
    assert.equal(fullDate(stamp), new Date(stamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }));
  } finally { await vite.close(); }
});
