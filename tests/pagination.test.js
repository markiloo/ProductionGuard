import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePagination } from '../server/pagination.js';

test('pagination bounds malformed, negative, and oversized values', () => {
  assert.deepEqual(parsePagination('nope', '-20'), { limit: 25, offset: 0 });
  assert.deepEqual(parsePagination('5000', '90000000'), { limit: 100, offset: 1_000_000 });
  assert.deepEqual(parsePagination('10', '17'), { limit: 10, offset: 17 });
});
