import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('calendar text is valid UTF-8 without broken separators', () => {
  const bytes = readFileSync(new URL('../client/src/components/ProductionCalendar.jsx', import.meta.url));
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  assert.ok(!source.includes('\uFFFD'));
  assert.match(source, /Upcoming production/);
});
