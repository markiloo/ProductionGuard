import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';

test('inactive dashboard views retain shared sizing but cannot receive focus', async () => {
  const vite = await createServer({ server: { middlewareMode: true, preTransformRequests: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
  try {
    const { ViewPane } = await vite.ssrLoadModule('/client/src/components/ViewPane.jsx');
    const hidden = renderToStaticMarkup(React.createElement(ViewPane, { active: false }, React.createElement('button', null, 'Edit')));
    assert.match(hidden, /inert=""/);
    assert.match(hidden, /aria-hidden="true"/);
    assert.match(hidden, /<button>Edit<\/button>/);
    const active = renderToStaticMarkup(React.createElement(ViewPane, { active: true }, 'Visible'));
    assert.doesNotMatch(active, /inert=/);
    assert.match(active, /aria-hidden="false"/);
    const css = readFileSync(new URL('../client/src/style.css', import.meta.url), 'utf8');
    assert.match(css, /\.dashboard-view \{[^}]*grid-area: 1 \/ 1/);
    assert.match(css, /\.dashboard-view\[data-active="false"\] \{[^}]*visibility: hidden/);
  } finally { await vite.close(); }
});
