import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { metricDate } from '../client/src/lib/format.js';

test('orders status strip shows only the last complete check', async () => {
  const vite = await createServer({ server: { middlewareMode: true, preTransformRequests: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
  try {
    const { RunStrip } = await vite.ssrLoadModule('/client/src/components/RunStrip.jsx');
    const render = (collection) => renderToStaticMarkup(React.createElement(RunStrip, { status: { collection } }));
    const stamp = '2026-11-13T15:20:00.000Z';

    const healthy = render({ lastSuccessAt: stamp, currentRunCount: 3, error: null });
    assert.match(healthy, /Last complete check/);
    assert.ok(healthy.includes(metricDate(stamp)));
    assert.equal((healthy.match(/class="metric"/g) || []).length, 1);
    for (const removed of ['Collector', 'Next inbox check', '>Saved<', 'saved this run', 'Polls every 15 seconds']) {
      assert.ok(!healthy.includes(removed), `expected the strip to omit ${removed}`);
    }
    assert.doesNotMatch(healthy, /Check failed/);

    assert.match(render({ lastSuccessAt: null, currentRunCount: 0, error: null }), /Not yet/);

    const error = 'Gmail sign-in failed. Check or replace the app password.';
    const failed = render({ lastSuccessAt: stamp, currentRunCount: 3, error });
    assert.match(failed, /Check failed — retrying/);
    assert.match(failed, new RegExp(`title="${error.replace(/\./g, '\\.')}"`));
    assert.match(failed, /class="text-danger"/);
  } finally { await vite.close(); }
});
