import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { DEFAULT_ORDER_FILTER, ORDER_FILTERS } from '../client/src/lib/constants.js';

test('order queue bar keeps every status, counts, and the inbox hint', async () => {
  const vite = await createServer({ server: { middlewareMode: true, preTransformRequests: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
  try {
    assert.equal(DEFAULT_ORDER_FILTER, 'all');
    assert.ok(ORDER_FILTERS.some((filter) => filter.value === DEFAULT_ORDER_FILTER), 'the default filter must exist in the queue list');
    const { OrderNav } = await vite.ssrLoadModule('/client/src/views/OrdersView.jsx');
    const markup = renderToStaticMarkup(React.createElement(OrderNav, {
      counts: { pending_review: 2, unverified: 1, approved: 0, ordered: 3, rejected: 1, all: 7 },
      stateFilter: DEFAULT_ORDER_FILTER,
      setStateFilter() {},
      setOffset() {},
    }));

    for (const label of ['Pending review', 'Unverified', 'Approved', 'Ordered / Incoming', 'Rejected', 'All orders']) {
      assert.ok(markup.includes(label), `expected queue ${label}`);
    }
    assert.match(markup, /class="panel order-nav"/);
    assert.match(markup, /aria-label="Order queues"/);
    assert.equal((markup.match(/aria-current="page"/g) || []).length, 1);
    assert.match(markup, /New POs appear after the next inbox check\./);
    assert.match(markup, /class="count">2</);
    assert.match(markup, /class="count">7</);

    const buttons = [...markup.matchAll(/<button[^>]*>[\s\S]*?<\/button>/g)].map((match) => match[0]);
    assert.match(buttons[0], /All orders/, 'All orders should be the leftmost tab');
    assert.match(buttons[0], /aria-current="page"/, 'All orders should be selected by default');
    assert.ok(markup.indexOf('All orders') < markup.indexOf('New POs appear'), 'the hint should follow the queue tabs');

    // The moved bar drops the old side-panel heading block.
    assert.doesNotMatch(markup, /Queues/);
    assert.doesNotMatch(markup, /order-nav-title/);
    assert.doesNotMatch(markup, /<h2/);
  } finally { await vite.close(); }
});
