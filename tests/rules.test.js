import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidSender, normalizeSender } from '../server/rules.js';

test('exact sender input is trimmed, normalized, and validated', () => {
  assert.equal(normalizeSender('  Billing@Example.com  '), 'billing@example.com');
  assert.equal(isValidSender('  Billing@Example.com  '), true);
  assert.equal(isValidSender('Sales Team <sales@example.com>'), false);
  assert.equal(isValidSender('example.com'), false);
});
