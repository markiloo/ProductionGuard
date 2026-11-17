import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('calendar filters production and incoming deliveries within the 30-day window', async () => {
  const vite = await createServer({ server: { middlewareMode: true, preTransformRequests: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
  try {
    const { ProductionCalendar } = await vite.ssrLoadModule('/client/src/components/ProductionCalendar.jsx');
    const calendar = { startDate: '2026-12-20', endDate: '2027-01-18', runs: [{ id: 'same', scheduledDate: '2026-12-20', runNumber: 'PR-SAMPLE', item: 'Assembly', quantity: 10, unit: 'units', status: 'scheduled' }] };
    const incoming = [{ id: 'same', itemSku: 'DELIVERY-SAMPLE', quantity: 5, unit: 'units', expectedArrival: '2027-01-18' }, { id: 'old', itemSku: 'OVERDUE', quantity: 1, expectedArrival: '2026-12-19' }, { id: 'late', itemSku: 'OUTSIDE', quantity: 1, expectedArrival: '2027-01-19' }, { id: 'received', itemSku: 'RECEIVED', quantity: 1, expectedArrival: '2026-12-20', status: 'received' }];
    const render = filter => renderToStaticMarkup(React.createElement(ProductionCalendar, { calendar, incoming, filter }));
    assert.match(render('both'), /PR-SAMPLE/);
    assert.match(render('both'), /DELIVERY-SAMPLE/);
    assert.doesNotMatch(render('both'), /OVERDUE|OUTSIDE|RECEIVED/);
    assert.doesNotMatch(render('production'), /DELIVERY-SAMPLE/);
    assert.doesNotMatch(render('deliveries'), /PR-SAMPLE/);
    assert.match(render('deliveries'), /DELIVERY-SAMPLE/);
  } finally { await vite.close(); }
});
