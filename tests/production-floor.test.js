import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Reproduce: open /production_runs before and after loading; the heading
// previously read "Today?s" and the loading message ended with a question mark.
test('production floor copy has readable schedule and loading messages', () => {
  const source = readFileSync(new URL('../client/src/main.jsx', import.meta.url), 'utf8');
  const page = source.slice(source.indexOf('function ProductionRunsApp()'));
  assert.ok(page.includes('Scheduled for today and all work in progress.'));
  assert.ok(page.includes('Loading production runs...'));
  assert.ok(!page.includes('Today?s'));
  assert.ok(!page.includes('Loading production runs?'));
});
