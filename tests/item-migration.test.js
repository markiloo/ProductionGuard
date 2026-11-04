import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { copyItemDefinitionsToInventory } from '../server/item-migration.js';

function store() {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE item_definitions(
    account_id TEXT NOT NULL,
    id TEXT NOT NULL,
    sku TEXT NOT NULL,
    item TEXT NOT NULL,
    unit TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(account_id, id)
  );
  CREATE UNIQUE INDEX item_definitions_sku ON item_definitions(account_id, sku COLLATE NOCASE);
  CREATE TABLE inventory(
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
  );
  CREATE UNIQUE INDEX inventory_sku ON inventory(account_id, sku COLLATE NOCASE) WHERE trim(sku) <> '';`);
  return db;
}

const now = '2026-11-04T00:00:00.000Z';

test('migration copies definitions with no inventory row and never overwrites existing stock', () => {
  const db = store();
  try {
    db.prepare('INSERT INTO item_definitions VALUES(?,?,?,?,?,?,?)').run('acct-a', 'def-a', 'SKU-A', 'Item A', 'units', now, now);
    db.prepare('INSERT INTO item_definitions VALUES(?,?,?,?,?,?,?)').run('acct-a', 'def-b', 'SKU-B', 'Item B', 'kg', now, now);
    db.prepare('INSERT INTO inventory(account_id,id,item,sku,quantity,unit,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('acct-a', 'inv-b', 'Existing B', 'SKU-B', 7, 'kg', now, now);

    assert.equal(copyItemDefinitionsToInventory(db), 1);
    const items = db.prepare('SELECT sku,item,quantity,unit FROM inventory WHERE account_id=? ORDER BY sku').all('acct-a');
    assert.deepEqual(items, [
      { sku: 'SKU-A', item: 'Item A', quantity: 0, unit: 'units' },
      { sku: 'SKU-B', item: 'Existing B', quantity: 7, unit: 'kg' },
    ]);
  } finally {
    db.close();
  }
});
