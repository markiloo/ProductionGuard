import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPo } from '../server/assessment.js';

const today = '2026-11-04';

function assess(etaDays) {
  return assessPo({
    po: {
      id: 'msg-1',
      poId: 'PO-0001',
      state: 'pending_review',
      poStatus: 'valid',
      poError: null,
      item: 'ITEM-X',
      sku: 'ITEM-X',
      quantity: 100,
      unit: 'units',
      etaDays,
      receivedAt: '2026-11-04T01:00:00.000Z',
    },
    inventory: { sku: 'ITEM-X', item: 'Item X', quantity: 0, unit: 'units', updatedAt: '2026-11-01T00:00:00.000Z' },
    deliveries: [],
    requirements: [{
      id: 'req-1', runId: 'run-1', runNumber: 'PR-0001', itemSku: 'ITEM-X',
      quantity: 100, unit: 'units', status: 'outstanding', scheduledDate: '2026-11-10', runStatus: 'scheduled',
    }],
    earlierPos: [],
    today,
  });
}

test('one day early satisfies the arrival buffer without an early warning', () => {
  const result = assess(5);
  assert.equal(result.arrival, '2026-11-09');
  assert.equal(result.needDate, '2026-11-10');
  assert.equal(result.daysEarly, 1);
  assert.equal(result.decision, 'Recommended');
  assert.deepEqual(result.warnings, []);
  assert.match(result.note, /one-day buffer met/);
  assert.doesNotMatch(result.note, /days early/);
});

test('more than one day early is reported as Arriving Early', () => {
  const result = assess(4);
  assert.equal(result.arrival, '2026-11-08');
  assert.equal(result.daysEarly, 2);
  assert.deepEqual(result.warnings.map((warning) => warning.type), ['early']);
  assert.equal(result.warnings[0].daysEarly, 2);
});

test('arriving on the run date is a timing conflict, not early', () => {
  const result = assess(6);
  assert.equal(result.arrival, '2026-11-10');
  assert.equal(result.daysEarly, 0);
  assert.deepEqual(result.warnings.map((warning) => warning.type), ['timing']);
  assert.equal(result.warnings[0].stockout, false);
});

test('arriving after the run date is a timing conflict with a stockout', () => {
  const result = assess(7);
  assert.equal(result.arrival, '2026-11-11');
  assert.deepEqual(result.warnings.map((warning) => warning.type), ['timing', 'stockout']);
  assert.equal(result.warnings[0].stockout, true);
});

test('a mapped SKU without an inventory row reports Missing Inventory', () => {
  const result = assessPo({
    po: {
      id: 'msg-1', poId: 'PO-0001', state: 'pending_review', poStatus: 'valid', poError: null,
      item: 'Carton Glue', sku: 'SKU-0001', quantity: 50, unit: 'units', etaDays: 5,
      receivedAt: '2026-11-04T01:00:00.000Z',
    },
    inventory: null,
    deliveries: [],
    requirements: [{ id: 'req-1', runId: 'run-1', runNumber: 'PR-0001', itemSku: 'SKU-0001', quantity: 4, unit: 'units', status: 'outstanding', scheduledDate: '2026-11-10', runStatus: 'scheduled' }],
    earlierPos: [],
    today,
  });
  assert.equal(result.decision, 'Manual Review Required — Missing Inventory');
  assert.match(result.note, /no inventory record/);
});
