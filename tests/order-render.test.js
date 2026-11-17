import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fullDate, scheduleDate, warningText } from '../client/src/lib/format.js';

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

test('PO detail formats assessment, delivery, coverage, demand, and warning dates', async () => {
  const vite = await createServer({ server: { middlewareMode: true, preTransformRequests: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
  try {
    const { PoDetailDialog } = await vite.ssrLoadModule('/client/src/dialogs/PoDetailDialog.jsx');
    const markup = renderToStaticMarkup(React.createElement(PoDetailDialog, {
      po: {
        poId: 'PO-0002', state: 'pending_review', item: 'Stainless steel mounting plate', sku: 'ST-204',
        quantity: 80, unit: 'pieces', expectedArrival: '2026-01-12', events: [], body: '',
        delivery: { quantity: 80, unit: 'pieces', expectedArrival: '2026-01-12', status: 'incoming' },
        assessment: {
          decision: 'Adjust Quantity', flag: 'adjust', daysEarly: 3,
          needDate: '2026-01-09', arrival: '2026-01-06', planningEnd: '2026-01-15', inventory: null,
          warnings: [{ type: 'early', needDate: '2026-01-09', daysEarly: 3 }],
          balances: [],
          deliveries: [{ id: 'delivery-1', expectedArrival: '2026-01-08', quantity: 20, unit: 'pieces' }],
          coverage: [{ poId: 'PO-0001', state: 'approved', quantity: 40, arrival: '2026-01-07' }],
          demand: [{ id: 'demand-1', runNumber: 'PR-0012', scheduledDate: '2026-01-10', quantity: 120, unit: 'pieces' }],
        },
      },
      skuOptions: [], onClose() {},
    }));

    for (const iso of ['2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10', '2026-01-12', '2026-01-15']) {
      assert.equal(markup.includes(iso), false, `${iso} should be shown as a formatted date`);
    }
    for (const iso of ['2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10', '2026-01-12', '2026-01-15']) {
      assert.ok(markup.includes(scheduleDate(iso)), `${scheduleDate(iso)} should appear in the sheet`);
    }
    assert.match(markup, /Arriving Early — need date/);
  } finally { await vite.close(); }
});

test('warning copy formats need and run dates', () => {
  assert.equal(
    warningText({ type: 'early', needDate: '2026-11-22', daysEarly: 3 }),
    `Arriving Early — need date ${scheduleDate('2026-11-22')}, 3 days early`,
  );
  assert.equal(
    warningText({ type: 'timing', runNumber: 'PR-0012', runDate: '2026-11-24', stockout: true }),
    `Timing Conflict / Expedite Needed — PR-0012 on ${scheduleDate('2026-11-24')} (stockout)`,
  );
  assert.equal(
    warningText({ type: 'stockout', runNumber: 'PR-0012', runDate: '2026-11-24', balance: -120 }),
    `Projected Stockout — PR-0012 on ${scheduleDate('2026-11-24')} (-120)`,
  );
  assert.doesNotMatch(warningText({ type: 'early', needDate: '2026-11-22', daysEarly: 3 }), /2026-11-22/);
});
