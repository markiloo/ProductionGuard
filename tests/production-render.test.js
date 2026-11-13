import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('production rows keep material tags aligned while the run tag follows the name', async () => {
  const vite = await createServer({ server: { middlewareMode: true, preTransformRequests: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
  try {
    const { ProductionRow } = await vite.ssrLoadModule('/client/src/components/ProductionRow.jsx');
    const markup = renderToStaticMarkup(React.createElement(ProductionRow, {
      run: {
        id: 'run-1',
        runNumber: 'PR-0001',
        item: 'Packaging Box',
        quantity: 20,
        completedQuantity: 12,
        unit: 'units',
        status: 'in_progress',
        scheduledDate: '2026-11-21',
        notes: '',
        updatedAt: '2026-11-14T09:00:00.000Z',
        requirements: [
          { id: 'req-1', itemSku: 'CARD', quantity: 40, unit: 'units', status: 'outstanding' },
          { id: 'req-2', itemSku: 'GLUE', quantity: 20, unit: 'units', status: 'completed' },
        ],
      },
      onEdit() {},
    }));

    assert.match(markup, /class="production-row"/);
    assert.match(markup, /class="production-top"/);
    assert.match(markup, /class="status-chip in-progress"/);
    assert.match(markup, /In progress/);
    assert.match(markup, /class="status-chip scheduled"/);
    assert.match(markup, /Outstanding/);
    assert.match(markup, /class="status-chip completed"/);
    assert.match(markup, /Consumed/);

    const css = readFileSync(new URL('../client/src/style.css', import.meta.url), 'utf8');
    assert.doesNotMatch(css, /\.production-top \.status-chip\s*\{[^}]*margin-left:\s*auto/, 'the run status tag should sit next to the run name');
    assert.doesNotMatch(css, /\.production-main\s*\{[^}]*padding-right/, 'the main column should not be inset');
    assert.match(css, /\.production-row \.requirement-list\s*\{[^}]*grid-template-columns:\s*minmax\(0, max-content\) max-content 104px/);
    assert.match(css, /\.production-row \.requirement-list\s*\{[^}]*justify-content:\s*start/);
    assert.match(css, /\.production-row \.requirement-list li\s*\{[^}]*grid-template-columns:\s*subgrid/);
    assert.match(css, /\.production-row \.requirement-list li \.status-chip\s*\{[^}]*justify-self:\s*start/);
    assert.match(css, /grid-template-columns:\s*minmax\(0, max-content\) max-content 96px/);
  } finally { await vite.close(); }
});
