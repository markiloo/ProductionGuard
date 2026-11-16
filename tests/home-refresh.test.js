import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../client/src/views/HomeView.jsx', import.meta.url), 'utf8');
const lifecycle = source.slice(source.indexOf('    let disposed = false;'), source.indexOf('  }, [accountId]);'));
const polling = source.slice(source.indexOf('    if (!active) return undefined;'), source.indexOf('  }, [active, accountId]);'));

test('Home polls only while selected and reloads immediately on return', () => {
  let calls = 0;
  let cleared = false;
  let tick;
  const loader = { current: () => { calls++; } };
  const run = new Function('active', 'loader', 'setInterval', 'clearInterval', polling);
  const interval = (callback, delay) => { assert.equal(delay, 10000); tick = callback; return 1; };
  assert.equal(run(false, loader, interval, () => {}), undefined);
  assert.equal(calls, 0);
  const stop = run(true, loader, interval, () => { cleared = true; });
  assert.equal(calls, 1);
  tick();
  assert.equal(calls, 2);
  stop();
  assert.equal(cleared, true);
  run(true, loader, interval, () => {})();
  assert.equal(calls, 3);
});

test('Home serializes refreshes, queues updated data, and aborts on cleanup', async () => {
  const loader = { current: null };
  const pending = [];
  const results = [];
  let signal;
  const api = (_url, options) => { signal = options.signal; return new Promise(resolve => pending.push(resolve)); };
  const noop = () => {};
  const start = new Function('loader', 'api', 'AbortController', 'setData', 'setLastUpdated', 'setError', 'setRefreshing', lifecycle);
  const stop = start(loader, api, AbortController, value => results.push(value), noop, noop, noop);
  const first = loader.current();
  const queued = loader.current();
  assert.equal(pending.length, 1);
  pending.shift()({ revision: 1 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pending.length, 1);
  pending.shift()({ revision: 2 });
  await Promise.all([first, queued]);
  assert.deepEqual(results, [null, { revision: 1 }, { revision: 2 }]);
  const final = loader.current();
  stop();
  assert.equal(signal.aborted, true);
  pending.shift()({ revision: 3 });
  await final;
  assert.equal(results.length, 3);
  assert.equal(loader.current, null);
});
