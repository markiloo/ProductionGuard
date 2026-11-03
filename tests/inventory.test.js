import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { parseInventoryInput, listInventory, createInventoryItem, updateInventoryItem } from '../server/inventory.js';

function store() {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE inventory(
    account_id TEXT NOT NULL,
    id TEXT NOT NULL,
    item TEXT NOT NULL,
    sku TEXT NOT NULL DEFAULT '',
    quantity INTEGER NOT NULL DEFAULT 0,
    unit TEXT NOT NULL DEFAULT 'units',
    supplier TEXT NOT NULL DEFAULT '',
    reorder_level INTEGER,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(account_id, id)
  );`);
  return db;
}

const now = '2026-11-03T09:00:00.000Z';

test('inventory input trims text and accepts valid numeric strings', () => {
  assert.deepEqual(parseInventoryInput({
    item: '  Bearings ',
    sku: ' BR-1 ',
    quantity: '4',
    unit: ' units ',
    supplier: ' Acme Supply ',
    reorderLevel: '2',
    notes: ' shelf A ',
  }), {
    item: 'Bearings',
    sku: 'BR-1',
    quantity: 4,
    unit: 'units',
    supplier: 'Acme Supply',
    reorderLevel: 2,
    notes: 'shelf A',
  });
  assert.equal(parseInventoryInput({ item: 'Bolts', quantity: '0', unit: 'kg', reorderLevel: '' }).reorderLevel, null);
});

test('inventory input rejects missing, malformed, or oversized values', () => {
  const invalid = [
    {},
    { item: '', quantity: 1, unit: 'units' },
    { item: 'Bolts', quantity: '', unit: 'units' },
    { item: 'Bolts', quantity: -1, unit: 'units' },
    { item: 'Bolts', quantity: 1.5, unit: 'units' },
    { item: 'Bolts', quantity: 1, unit: '' },
    { item: 'Bolts', quantity: 1, unit: 'units', reorderLevel: -1 },
    { item: 'Bolts', quantity: 1, unit: 'units', reorderLevel: 1.5 },
    { item: 'x'.repeat(121), quantity: 1, unit: 'units' },
    { item: 'Bolts', quantity: 1, unit: 'units', notes: 'x'.repeat(501) },
  ];
  for (const body of invalid) assert.throws(() => parseInventoryInput(body));
});

test('inventory is account-scoped and supports create and edit', () => {
  const db = store();
  try {
    const created = createInventoryItem(
      db,
      'acct-a',
      parseInventoryInput({ item: 'Bearings', quantity: 4, unit: 'units', supplier: 'Acme Supply', reorderLevel: 2 }),
      now,
    );
    assert.equal(created.item, 'Bearings');
    assert.equal(created.quantity, 4);
    assert.equal(created.reorderLevel, 2);
    assert.equal(created.createdAt, now);

    createInventoryItem(db, 'acct-b', parseInventoryInput({ item: 'Acme only', quantity: 1, unit: 'kg' }), now);
    assert.deepEqual(listInventory(db, 'acct-a').map((item) => item.item), ['Bearings']);
    assert.deepEqual(listInventory(db, 'acct-b').map((item) => item.item), ['Acme only']);

    const updated = updateInventoryItem(
      db,
      'acct-a',
      created.id,
      parseInventoryInput({ item: 'Bearings', sku: 'BR-1', quantity: 9, unit: 'units', supplier: 'Acme Supply', reorderLevel: 3, notes: ' top shelf ' }),
      '2026-11-04T09:00:00.000Z',
    );
    assert.equal(updated.quantity, 9);
    assert.equal(updated.sku, 'BR-1');
    assert.equal(updated.notes, 'top shelf');
    assert.equal(updated.updatedAt, '2026-11-04T09:00:00.000Z');
    assert.equal(updateInventoryItem(db, 'acct-b', created.id, parseInventoryInput({ item: 'Stolen', quantity: 1, unit: 'units' }), now), null);
    assert.deepEqual(listInventory(db, 'acct-a').map((item) => item.item), ['Bearings']);
  } finally {
    db.close();
  }
});
