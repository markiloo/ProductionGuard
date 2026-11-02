import test from 'node:test';
import assert from 'node:assert/strict';
import { isEligibleMessage, isValidSender, isValidClientId, normalizeSender } from '../server/rules.js';

const cutoff = '2026-11-02T09:00:00.000Z';
const message = (receivedDateTime, address, name = 'Allowed Sender') => ({ receivedDateTime, from: { emailAddress: { address, name } } });

test('startup cutoff excludes messages before and exactly at startup', () => {
  assert.equal(isEligibleMessage(message('2026-11-02T08:59:59.999Z', 'sales@example.com'), ['sales@example.com'], cutoff), false);
  assert.equal(isEligibleMessage(message(cutoff, 'sales@example.com'), ['sales@example.com'], cutoff), false);
  assert.equal(isEligibleMessage(message('2026-11-02T09:00:00.001Z', 'sales@example.com'), ['sales@example.com'], cutoff), true);
});

test('sender matching uses exact normalized addresses and ignores display names', () => {
  assert.equal(isEligibleMessage(message('2026-11-02T09:01:00Z', ' SALES@EXAMPLE.COM '), [' sales@example.com '], cutoff), true);
  assert.equal(isEligibleMessage(message('2026-11-02T09:01:00Z', 'other@example.com', 'sales@example.com'), ['sales@example.com'], cutoff), false);
  assert.equal(isEligibleMessage(message('2026-11-02T09:01:00Z', 'sales@sub.example.com'), ['sales@example.com'], cutoff), false);
});

test('sender input is trimmed, normalized, and validated as an address', () => {
  assert.equal(normalizeSender('  Billing@Example.com  '), 'billing@example.com');
  assert.equal(isValidSender('  Billing@Example.com  '), true);
  assert.equal(isValidSender('Sales Team <sales@example.com>'), false);
  assert.equal(isValidSender('example.com'), false);
});

test('empty allowlists collect nothing and multiple addresses can match', () => {
  assert.equal(isEligibleMessage(message('2026-11-02T09:01:00Z', 'sales@example.com'), [], cutoff), false);
  assert.equal(isEligibleMessage(message('2026-11-02T09:01:00Z', 'billing@example.com'), ['sales@example.com', 'billing@example.com'], cutoff), true);
});

test('Microsoft application ID must be a UUID', () => {
  assert.equal(isValidClientId('6f9619ff-8b86-4d11-b42d-00c04fc964ff'), true);
  assert.equal(isValidClientId('not-a-guid'), false);
});
