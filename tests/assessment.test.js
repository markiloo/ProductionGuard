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
  assert.match(result.note, /arriving one day early/);
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

function scenario({ stock = 0, quantity = 100, arrival = 9, demand = [[10, 100]], supply = [], earlierPos = [] } = {}) {
  const date = (day) => `2026-01-${String(day + 1).padStart(2, '0')}`;
  return assessPo({
    today: date(0),
    po: { poId: 'PO-0002', state: 'pending_review', poStatus: 'valid', sku: 'X', quantity, unit: 'units', etaDays: arrival },
    inventory: { sku: 'X', quantity: stock, unit: 'units' },
    deliveries: supply.map(([day, amount], i) => ({ id: String(i), status: 'incoming', expectedArrival: date(day), quantity: amount, unit: 'units' })),
    requirements: demand.map(([day, amount], i) => ({ id: String(i), runNumber: `PR-${i}`, status: 'outstanding', runStatus: 'scheduled', scheduledDate: date(day), quantity: amount, unit: 'units' })),
    earlierPos,
  });
}

test('worked shortage counts cumulative deficits once and recommends an 80-unit PO one day early', () => {
  const result = scenario({ quantity: 80, arrival: 3, demand: [[4, 50], [10, 30]] });
  assert.equal(result.requirement, 80);
  assert.equal(result.difference, 0);
  assert.equal(result.decision, 'Recommended');
  assert.deepEqual(result.balances.map(({ before, after }) => [before, after]), [[0, 80], [-50, 30], [-80, 0]]);
  assert.equal(result.needDate, '2026-01-05');
  assert.deepEqual(result.warnings, []);
  assert.match(result.note, /arriving one day early/);
});

test('time-phased supply covers the first run while a later PO covers the remaining deficit', () => {
  const result = scenario({ stock: 100, supply: [[3, 50]], demand: [[4, 120], [10, 80]], arrival: 5, quantity: 50 });
  assert.deepEqual(result.balances.map(({ before, after }) => [before, after]), [[30, 30], [30, 80], [-50, 0]]);
  assert.equal(result.requirement, 50);
  assert.equal(result.difference, 0);
  assert.equal(result.decision, 'Recommended');
  assert.equal(result.needDate, '2026-01-11');
  assert.equal(result.daysEarly, 5);
  assert.deepEqual(result.warnings.map(({ type }) => type), ['early']);
});

test('quantity classification distinguishes exact, short, excess, redundant, and absent demand', () => {
  for (const [quantity, decision, difference] of [[100, 'Recommended', 0], [50, 'Adjust Quantity', -50], [150, 'Adjust Quantity', 50]]) {
    const result = scenario({ quantity });
    assert.equal(result.requirement, 100);
    assert.equal(result.decision, decision);
    assert.equal(result.difference, difference);
  }
  const redundant = scenario({ stock: 100 });
  assert.equal(redundant.requirement, 0);
  assert.equal(redundant.difference, 100);
  assert.equal(redundant.decision, 'Redundant / Overstock');
  assert.match(scenario({ demand: [] }).decision, /No Scheduled Demand/);
});

test('late existing supply resolves quantity shortage but preserves the missed-run warning', () => {
  const result = scenario({ demand: [[4, 100]], supply: [[5, 100]], arrival: 6 });
  assert.equal(result.requirement, 0);
  assert.equal(result.difference, 100);
  assert.equal(result.decision, 'Redundant / Overstock');
  assert.deepEqual(result.balances.map(({ before, after }) => [before, after]), [[-100, -100], [0, 100]]);
  assert.equal(result.timingConflicts[0].source, 'delivery');
  assert.equal(result.timingConflicts[0].runDate, '2026-01-05');
});

test('provisional coverage starts at its arrival and reduces the later PO requirement', () => {
  const result = scenario({ earlierPos: [{ poId: 'PO-0001', state: 'approved', quantity: 100, arrival: '2026-01-10' }] });
  assert.equal(result.requirement, 0);
  assert.equal(result.decision, 'Redundant / Overstock');
  assert.equal(result.coveredAmount, 100);
  assert.equal(result.warnings.find(({ type }) => type === 'duplicate').coveredAmount, 100);
});

test('daily provisional arrivals advance from buffer met to timing conflict while ordered arrivals stay fixed', () => {
  const date = (day) => `2026-01-${String(day + 1).padStart(2, '0')}`;
  const input = {
    po: { poId: 'PO-0001', state: 'approved', poStatus: 'valid', sku: 'X', quantity: 100, unit: 'units', etaDays: 5 },
    inventory: { sku: 'X', quantity: 0, unit: 'units' },
    requirements: [{ id: 'req', status: 'outstanding', runStatus: 'scheduled', scheduledDate: date(6), quantity: 100, unit: 'units' }],
  };
  const initial = assessPo({ ...input, today: date(0) });
  assert.equal(initial.arrival, date(5));
  assert.equal(initial.decision, 'Recommended');
  assert.deepEqual(initial.warnings, []);
  assert.match(initial.note, /arriving one day early/);
  const next = assessPo({ ...input, today: date(1) });
  assert.equal(next.arrival, date(6));
  assert.equal(next.timingConflicts[0].balance, 0);
  const late = assessPo({ ...input, today: date(2) });
  assert.equal(late.arrival, date(7));
  assert.equal(late.timingConflicts[0].balance, -100);
  const fixed = assessPo({ ...input, po: { ...input.po, state: 'ordered', expectedArrival: date(5) }, today: date(2) });
  assert.equal(fixed.arrival, date(5));
  assert.deepEqual(fixed.warnings, []);
});

test('five-day PO for a Day 2 run stays Recommended with a 100-unit stockout warning', () => {
  const result = scenario({ arrival: 5, demand: [[2, 100]] });
  assert.equal(result.decision, 'Recommended');
  assert.equal(result.requirement, 100);
  assert.equal(result.difference, 0);
  assert.equal(result.timingConflicts[0].runDate, '2026-01-03');
  assert.equal(result.timingConflicts[0].balance, -100);
  for (const arrival of [9, 10, 11]) {
    const timed = scenario({ arrival });
    assert.equal(timed.decision, 'Recommended');
    assert.equal(timed.requirement, 100);
    assert.equal(timed.timingConflicts.length, arrival === 9 ? 0 : 1);
    assert.equal(timed.balances.find(({ date }) => date === '2026-01-11').after, arrival === 11 ? -100 : 0);
  }
});

test('invalid earlier PO cannot make a later valid purchase redundant', async () => {
  const { assessWithContext } = await import('../server/pos.js');
  const po = { id: 'second', poId: 'PO-0002', state: 'pending_review', poStatus: 'valid', sku: 'X', quantity: 100, unit: 'units', etaDays: 9, receivedAt: '2026-01-01T02:00:00Z' };
  const inventory = { sku: 'X', quantity: 0, unit: 'units' };
  const context = {
    inventoryBySku: new Map([['x', inventory]]), deliveries: [],
    requirements: [{ id: 'req', itemSku: 'X', quantity: 100, unit: 'units', status: 'outstanding', runStatus: 'scheduled', scheduledDate: '2026-01-11' }],
    pos: [{ ...po, id: 'first', poId: 'PO-0001', poStatus: 'needs_review', receivedAt: '2026-01-01T01:00:00Z', arrival: '2026-01-10' }, po],
  };
  const result = assessWithContext(context, po, '2026-01-01');
  assert.equal(result.decision, 'Recommended');
  assert.equal(result.requirement, 100);
  assert.equal(result.coveredAmount, 0);
  assert.deepEqual(result.coverage, []);
});

test('PO, delivery, and production unit mismatches require manual review without quantity classification', () => {
  const base = {
    today: '2026-01-01',
    po: { poId: 'PO-0001', state: 'pending_review', poStatus: 'valid', sku: 'X', quantity: 100, unit: 'units', etaDays: 9 },
    inventory: { sku: 'X', quantity: 0, unit: 'units' },
    requirements: [{ id: 'req', status: 'outstanding', runStatus: 'scheduled', scheduledDate: '2026-01-11', quantity: 100, unit: 'units' }],
  };
  for (const input of [
    { ...base, po: { ...base.po, unit: 'kg' } },
    { ...base, deliveries: [{ id: 'delivery', status: 'incoming', expectedArrival: '2026-01-10', quantity: 100, unit: 'kg' }] },
    { ...base, requirements: [{ ...base.requirements[0], unit: 'kg' }] },
  ]) {
    const result = assessPo(input);
    assert.match(result.decision, /Unit Mismatch/);
    assert.equal(result.flag, 'manual');
    assert.equal(result.requirement, null);
    assert.equal(result.difference, null);
    assert.deepEqual(result.coverage, []);
  }
});
