import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { paginate } from '../client/src/hooks/usePagination.js';

test('Assemblies shows six records while retaining the total count', async () => {
  const vite = await createServer({ server: { middlewareMode: true, preTransformRequests: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
  try {
    const { AssembliesView } = await vite.ssrLoadModule('/client/src/views/AssembliesView.jsx');
    for (const count of [0, 6, 7]) {
      const assemblies = Array.from({ length: count }, (_, id) => ({ id, name: `Assembly ${id}`, sku: `ASM-${id}`, unit: 'units', requirements: [] }));
      const markup = renderToStaticMarkup(React.createElement(AssembliesView, { assemblies, onAdd() {}, onEdit() {} }));
      assert.equal((markup.match(/class="definition-row"/g) || []).length, Math.min(count, 6));
      assert.ok(markup.includes(`${count} assemblies`));
      if (count === 7) {
        assert.match(markup, /Page 1 of 2/);
        assert.doesNotMatch(markup, /Assembly 6/);
        assert.match(markup, /disabled="">Previous/);
        assert.match(markup, /button-small">Next/);
        assert.deepEqual(paginate(assemblies, 1).visible.map(item => item.id), [6]);
        assert.equal(paginate(assemblies.slice(0, 6), 1).currentPage, 0);
      } else {
        assert.doesNotMatch(markup, /Assemblies pages/);
      }
      if (count === 0) assert.match(markup, /No assemblies defined/);
    }
  } finally { await vite.close(); }
});
