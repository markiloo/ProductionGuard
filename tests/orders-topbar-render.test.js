import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { metricDate } from '../client/src/lib/format.js';

test('orders topbar places the last complete check beside the queue tabs', async () => {
  const vite = await createServer({ server: { middlewareMode: true, preTransformRequests: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
  try {
    const { OrdersTopbar } = await vite.ssrLoadModule('/client/src/components/OrdersTopbar.jsx');
    const stamp = '2026-11-13T15:20:00.000Z';
    const markup = renderToStaticMarkup(React.createElement(OrdersTopbar, {
      status: { collection: { lastSuccessAt: stamp, currentRunCount: 3, error: null } },
      counts: { pending_review: 2, unverified: 1, approved: 0, ordered: 3, rejected: 1, all: 7 },
      stateFilter: 'all',
      setStateFilter() {},
      setOffset() {},
    }));

    assert.equal((markup.match(/class="orders-topbar"/g) || []).length, 1);
    assert.ok(markup.includes(metricDate(stamp)));
    assert.ok(markup.indexOf('Last complete check') < markup.indexOf('Pending review'), 'marker should precede the queue tabs');
    assert.match(markup, /class="panel order-nav"/);
    for (const label of ['Pending review', 'Unverified', 'Approved', 'Ordered / Incoming', 'Rejected', 'All orders']) {
      assert.ok(markup.includes(label), `expected queue ${label}`);
    }
    assert.equal((markup.match(/aria-current="page"/g) || []).length, 1);
    assert.match(markup, /New POs appear after the next inbox check\./);
    const buttons = [...markup.matchAll(/<button[^>]*>[\s\S]*?<\/button>/g)].map((match) => match[0]);
    assert.match(buttons[0], /All orders/);
    assert.match(buttons[0], /aria-current="page"/);
  } finally { await vite.close(); }
});
