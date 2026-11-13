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

    const runs = renderToStaticMarkup(React.createElement(CurrentRunsList, {
      runs: [
        { id: 'run-1', runNumber: 'PR-0001', item: 'Assembly A', quantity: 5, unit: 'units', status: 'in_progress', scheduledDate: '2026-11-13', completedQuantity: 2, percent: 40 },
      ],
    }));
    assert.match(runs, /role="progressbar"/);
    assert.match(runs, /aria-valuenow="2"/);
    assert.match(runs, /aria-valuemax="5"/);
    assert.match(runs, /40%/);
    assert.match(runs, /PR-0001/);

    const home = renderToStaticMarkup(React.createElement(HomeView, {
      status: { auth: { account: { id: 'gmail:a@example.com' } } },
      inventory: [],
    }));
    assert.match(home, /id="home"/);
    assert.match(home, /Add visualization/);
    assert.match(home, /Loading dashboard/);
  } finally { await vite.close(); }
});
