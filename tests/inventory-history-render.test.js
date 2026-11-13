import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { metricDate } from '../client/src/lib/format.js';

test('stock history table explains deliveries, edits, baselines, and unit changes', async () => {
  const vite = await createServer({ server: { middlewareMode: true, preTransformRequests: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
  try {
    const { InventoryHistoryTable } = await vite.ssrLoadModule('/client/src/dialogs/InventoryHistoryDialog.jsx');
    const base = { before_quantity: 10, after_quantity: 30, before_unit: 'pieces', unit: 'pieces', created_at: '2026-11-13T00:00:00Z' };
    const render = (entry) => renderToStaticMarkup(React.createElement(InventoryHistoryTable, { entries: [{ ...base, id: 1, ...entry }] }));
    const delivery = render({ kind: 'Delivery received', delivery_id: 'del-1', po_id: 'PO-0001', supplier: '<script>supplier</script>' });
    assert.match(delivery, /<table/);
    assert.match(delivery, /scope="col"/);
    assert.match(delivery, /\+20 pieces/);
    assert.match(delivery, /PO-0001/);
    assert.match(delivery, /&lt;script&gt;/);
    assert.doesNotMatch(delivery, /<script>/);
    assert.ok(delivery.includes(metricDate(base.created_at)), 'history rows use the compact date and time');
    assert.match(delivery, /title="[^"]*\d/);
    assert.match(render({ kind: 'Quantity edited', after_quantity: 5 }), /−5 pieces/);
    const baseline = render({ kind: 'Starting balance' });
    assert.match(baseline, /<td>—<\/td>/);
    assert.doesNotMatch(baseline, /\+20/);
    const changed = render({ kind: 'Quantity edited', unit: 'boxes' });
    assert.match(changed, /Unit changed/);
    assert.match(changed, /10 pieces/);
    assert.match(changed, /30 boxes/);
    assert.doesNotMatch(changed, /\+20/);

    const css = readFileSync(new URL('../client/src/style.css', import.meta.url), 'utf8');
    assert.match(css, /\.detail\.inventory-history-dialog\s*\{[^}]*width:\s*min\(960px, 100%\)/);
    assert.match(css, /\.inventory-history-dialog \.detail-body\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
    const tableRule = css.match(/\.history-table\s*\{([^}]*)\}/)[1];
    assert.match(tableRule, /table-layout:\s*fixed/);
    assert.doesNotMatch(tableRule, /min-width:\s*700px/);
    assert.match(css, /\.history-table-scroll\s*\{[^}]*max-width:\s*100%/);
  } finally { await vite.close(); }
});
