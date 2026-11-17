import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const projection = {
  sku: 'SKU-A',
  item: 'Carton Glue',
  unit: 'units',
  startDate: '2026-11-13',
  endDate: '2026-11-23',
  horizonDays: 10,
  currentBalance: 109,
  endBalance: -51,
  minBalance: -71,
  reorderLevel: 30,
  nextArrival: '2026-11-12',
  stockoutDates: [{ date: '2026-11-18', balance: -41 }, { date: '2026-11-19', balance: -41 }],
  excluded: { deliveries: 0, requirements: 0 },
  points: [
    { date: '2026-11-13', balance: 109 },
    { date: '2026-11-14', balance: 159 },
    { date: '2026-11-18', balance: -41 },
  ],
};

test('home dashboard renders projection, incoming, and run progress', async () => {
  const vite = await createServer({ server: { middlewareMode: true, preTransformRequests: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
  try {
    const {
      HomeView, ProjectionTile, IncomingOrdersTable, CurrentRunsList,
    } = await vite.ssrLoadModule('/client/src/views/HomeView.jsx');

    const chart = renderToStaticMarkup(React.createElement(
      (await vite.ssrLoadModule('/client/src/components/ProjectionChart.jsx')).ProjectionChart,
      { projection },
    ));
    assert.match(chart, /role="img"/);
    assert.match(chart, /Lowest -71 units/);
    assert.match(chart, /Stockout from/);
    assert.match(chart, /class="chart-line"/);
    assert.match(chart, /class="chart-stockout"/);
    assert.match(chart, /class="chart-reorder"/);

    const tile = renderToStaticMarkup(React.createElement(ProjectionTile, {
      widget: { id: 'widget-a', horizonDays: 10, projection },
      busy: false,
      onEdit() {},
      onRemove() {},
    }));
    assert.match(tile, /Carton Glue/);
    assert.match(tile, /Today&#x27;s balance/);
    assert.match(tile, /109 units/);
    assert.match(tile, /Projected stockout from/);
    assert.match(tile, /Projected stockout from Wed, 18 Nov \u00b7 2 days below zero\./);
    const renderStockouts = (stockoutDates) => renderToStaticMarkup(React.createElement(ProjectionTile, {
      widget: { id: 'widget-a', projection: { ...projection, stockoutDates } },
    }));
    const singleStockout = renderStockouts(projection.stockoutDates.slice(0, 1));
    assert.match(singleStockout, /Projected stockout from Wed, 18 Nov\./);
    assert.doesNotMatch(singleStockout, /days below zero/);
    assert.match(renderStockouts([]), /No projected stockout in this horizon\./);
    assert.match(tile, />Edit</);
    assert.match(tile, />Remove</);

    const incoming = renderToStaticMarkup(React.createElement(IncomingOrdersTable, {
      incoming: [
        { id: 'del-1', itemSku: 'SKU-A', itemName: 'Carton Glue', quantity: 50, unit: 'units', expectedArrival: '2026-11-12', supplier: 'Supplier A', poId: 'PO-0001', overdue: true },
        { id: 'del-2', itemSku: 'SKU-A', itemName: 'Carton Glue', quantity: 5, unit: 'units', expectedArrival: '2026-11-14', supplier: '', poId: null, overdue: false },
      ],
    }));
    assert.match(incoming, /<table/);
    assert.match(incoming, /Overdue/);
    assert.match(incoming, /PO-0001/);
    assert.match(incoming, /Manual delivery/);
    assert.match(incoming, /Supplier A/);
    assert.match(incoming, /<td>—<\/td>/);
    assert.doesNotMatch(incoming, /â€/);

    const runs = renderToStaticMarkup(React.createElement(CurrentRunsList, {
      runs: [
        { id: 'run-1', runNumber: 'PR-0001', item: 'Assembly A', quantity: 5, unit: 'units', status: 'in_progress', scheduledDate: '2026-11-13', completedQuantity: 2, percent: 40 },
      ],
    }));
    assert.match(runs, /role="progressbar"/);
    assert.match(runs, /aria-valuenow="2"/);
    assert.match(runs, /aria-valuemax="5"/);
    assert.match(runs, /40%/);
    assert.match(runs, /2 \/ 5 units \u00b7 40%/);
    assert.match(runs, /PR-0001/);

    const home = renderToStaticMarkup(React.createElement(HomeView, {
      status: { auth: { account: { id: 'gmail:a@example.com' } } },
      inventory: [],
    }));
    assert.match(home, /id="home"/);
    assert.match(home, /Add visualization/);
    assert.match(home, /Loading dashboard…/);
    assert.doesNotMatch(home, /â€/);
  } finally { await vite.close(); }
});


test('incoming window shows two weeks and only three deliveries per page', async () => {
  const vite = await createServer({ server: { middlewareMode: true, preTransformRequests: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
  try {
    const { IncomingDeliveriesPanel } = await vite.ssrLoadModule('/client/src/views/HomeView.jsx');
    const incoming = ['2026-11-12', '2026-11-14', '2026-11-20', '2026-11-27', '2026-11-28'].map((date, i) => ({
      id: `delivery-${i}`, itemSku: `SKU-${i}`, quantity: 1, unit: 'units', expectedArrival: date, overdue: i === 0,
    }));
    const markup = renderToStaticMarkup(React.createElement(IncomingDeliveriesPanel, { incoming, today: '2026-11-13' }));
    assert.match(markup, /Incoming deliveries/);
    assert.match(markup, /Next 2 weeks/);
    assert.match(markup, /Edit incoming delivery horizon/);
    assert.doesNotMatch(markup, /<input|<select/);
    assert.match(markup, /Page 1 of 2/);
    assert.match(markup, /Overdue/);
    assert.match(markup, /class="count">4</);
    assert.doesNotMatch(markup, /SKU-3|SKU-4/);
    assert.equal((markup.match(/<tr>/g) || []).length, 4);
    assert.match(markup, /disabled="">Previous/);
    const empty = renderToStaticMarkup(React.createElement(IncomingDeliveriesPanel, { incoming: [], today: '2026-11-13' }));
    assert.match(empty, /No incoming deliveries in this window/);
    assert.doesNotMatch(empty, /Incoming delivery pages/);
  } finally { await vite.close(); }
});
