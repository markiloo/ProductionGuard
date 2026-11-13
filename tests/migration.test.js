import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { clearSavedEmails } from '../server/email-maintenance.js';

test('migration adds suppliers to saved POs and flags older messages missing them', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'po-checker-migration-'));
  const prior = process.env.DATA_DIR;
  const old = new Database(path.join(directory, 'po-checker.db'));
  old.exec(`CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);
    INSERT INTO schema_migrations VALUES(1,'2026-01-01'),(2,'2026-01-01'),(3,'2026-01-01');
    CREATE TABLE accounts(id TEXT PRIMARY KEY,display_name TEXT,email TEXT,created_at TEXT);
    CREATE TABLE runs(id TEXT PRIMARY KEY,account_id TEXT,cutoff TEXT,started_at TEXT,last_success_at TEXT,error TEXT,status TEXT);
    CREATE TABLE emails(account_id TEXT NOT NULL,message_id TEXT NOT NULL,run_id TEXT NOT NULL,sender_address TEXT NOT NULL,sender_name TEXT NOT NULL DEFAULT '',recipients TEXT NOT NULL DEFAULT '[]',subject TEXT NOT NULL DEFAULT '',received_at TEXT NOT NULL,preview TEXT NOT NULL DEFAULT '',body TEXT NOT NULL DEFAULT '',has_attachments INTEGER NOT NULL DEFAULT 0,item TEXT,quantity INTEGER,unit TEXT,eta TEXT,po_status TEXT,po_error TEXT,PRIMARY KEY(account_id,message_id));
    CREATE TABLE account_clears(account_id TEXT PRIMARY KEY,cleared_at TEXT NOT NULL);
    INSERT INTO emails(account_id,message_id,run_id,sender_address,subject,received_at,body,po_status) VALUES
      ('a','po','r','orders@example.com',' po ','2026-01-02T00:00:00.000Z','ITEM: Steel\nQUANTITY: 3\nUNIT: kg\nETA: 2 weeks\nSUPPLIER: Acme Supply','needs_review'),
      ('a','old-po','r','orders@example.com','PO','2026-01-02T01:00:00.000Z','ITEM: Bolts\nQUANTITY: 1\nUNIT: units\nETA: 1 week','valid'),
      ('a','other','r','orders@example.com','Hello','2026-01-03T00:00:00.000Z','Unrelated',NULL);`);
  old.close();
  process.env.DATA_DIR = directory;
  let loaded;
  try {
    loaded = await import('../server/db.js?migration-test');
    const { db } = loaded;
    const rows = db.prepare("SELECT message_id AS id, supplier, po_status AS poStatus FROM emails WHERE account_id='a' AND po_status IS NOT NULL ORDER BY received_at DESC").all();
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((row) => [row.id, row.supplier, row.poStatus]), [['old-po', null, 'needs_review'], ['po', 'Acme Supply', 'valid']]);
    assert.match(db.prepare("SELECT po_error FROM emails WHERE account_id='a' AND message_id='old-po'").get().po_error, /supplier/i);
    assert.equal(db.prepare("SELECT po_status FROM emails WHERE account_id='a' AND message_id='other'").get().po_status, null);
    assert.equal(db.prepare("SELECT po_state FROM emails WHERE message_id='po'").get().po_state, 'pending_review');
    assert.equal(clearSavedEmails(db, 'a', '2026-01-04T00:00:00.000Z'), 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM emails').get().count, 1);
    assert.equal(db.prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1').get().version, 22);
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'inventory'").get());
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'production_runs'").get());
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'production_requirements'").get());
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'incoming_deliveries'").get());
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'item_definitions'").get(), undefined);
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'production_items'").get());
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'po_proofs'").get());
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'delivery_receipts'").get());
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'delivery_proofs'").get());
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'dashboard_widgets'").get());
    assert.ok(db.prepare("SELECT name FROM pragma_table_info('production_items') WHERE name = 'sku'").get());
    assert.ok(db.prepare("SELECT name FROM pragma_table_info('production_items') WHERE name = 'inventory_id'").get());
    assert.ok(db.prepare("SELECT name FROM pragma_table_info('incoming_deliveries') WHERE name = 'received_quantity'").get());
  } finally {
    loaded?.db.close();
    loaded?.releaseInstanceLock();
    if (prior === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = prior;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('migration gives existing assemblies finished-good inventory items and SKUs', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'po-checker-assembly-migration-'));
  const prior = process.env.DATA_DIR;
  const old = new Database(path.join(directory, 'po-checker.db'));
  old.exec(`CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);
    CREATE TABLE accounts(id TEXT PRIMARY KEY,display_name TEXT,email TEXT,created_at TEXT);
    CREATE TABLE production_items(account_id TEXT NOT NULL,id TEXT NOT NULL,name TEXT NOT NULL,unit TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(account_id,id));
    CREATE TABLE inventory(account_id TEXT NOT NULL,id TEXT NOT NULL,item TEXT NOT NULL,sku TEXT NOT NULL DEFAULT '',quantity INTEGER NOT NULL DEFAULT 0,unit TEXT NOT NULL DEFAULT 'units',supplier TEXT NOT NULL DEFAULT '',reorder_level INTEGER,notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(account_id,id));
    CREATE TABLE inventory_history(id INTEGER PRIMARY KEY AUTOINCREMENT,account_id TEXT NOT NULL,inventory_id TEXT NOT NULL,kind TEXT NOT NULL,before_quantity INTEGER NOT NULL,after_quantity INTEGER NOT NULL,before_unit TEXT NOT NULL,unit TEXT NOT NULL,delivery_id TEXT,po_id TEXT,supplier TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
    INSERT INTO accounts VALUES('a','','a@example.com','2026-01-01');
    INSERT INTO inventory(account_id,id,item,sku,quantity,unit,created_at,updated_at) VALUES('a','existing','Existing Box','ASM-PACKAGING-BOX',5,'units','2026-01-01','2026-01-01');
    INSERT INTO production_items(account_id,id,name,unit,notes,created_at,updated_at) VALUES
      ('a','item-1','Packaging Box','units','','2026-01-02','2026-01-02'),
      ('a','item-2','Custom Widget','kg','','2026-01-03','2026-01-03');`);
  for (let version = 1; version <= 21; version += 1) old.prepare('INSERT INTO schema_migrations VALUES(?,?)').run(version, '2026-01-01');
  old.close();
  process.env.DATA_DIR = directory;
  let loaded;
  try {
    loaded = await import('../server/db.js?assembly-migration-test');
    const { db } = loaded;
    const first = db.prepare('SELECT sku, inventory_id AS inventoryId FROM production_items WHERE id=?').get('item-1');
    const second = db.prepare('SELECT sku, inventory_id AS inventoryId FROM production_items WHERE id=?').get('item-2');
    assert.equal(first.sku, 'ASM-PACKAGING-BOX-2', 'the generated SKU avoids an existing inventory SKU');
    assert.equal(second.sku, 'ASM-CUSTOM-WIDGET');
    const firstStock = db.prepare('SELECT item, quantity, unit FROM inventory WHERE account_id=? AND id=?').get('a', first.inventoryId);
    assert.deepEqual(firstStock, { item: 'Packaging Box', quantity: 0, unit: 'units' });
    assert.equal(db.prepare('SELECT quantity FROM inventory WHERE account_id=? AND id=?').get('a', 'existing').quantity, 5, 'existing inventory keeps its stock');
    const history = db.prepare('SELECT kind, before_quantity AS before, after_quantity AS after, unit FROM inventory_history WHERE account_id=? AND inventory_id=?').all('a', second.inventoryId);
    assert.deepEqual(history, [{ kind: 'Starting balance', before: 0, after: 0, unit: 'kg' }]);
    assert.equal(db.prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1').get().version, 22);
  } finally {
    try { loaded?.db.close(); } catch { /* Already closed. */ }
    try { loaded?.releaseInstanceLock(); } catch { /* Already released. */ }
    if (prior === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = prior;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('migration completes production runs whose recorded units reached the planned quantity', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'po-checker-complete-migration-'));
  const prior = process.env.DATA_DIR;
  process.env.DATA_DIR = directory;
  let first;
  let second;
  try {
    first = await import('../server/db.js?complete-migration-seed');
    const now = '2026-11-05T00:00:00.000Z';
    first.db.prepare('INSERT INTO accounts(id,display_name,email,created_at) VALUES(?,?,?,?)').run('a', 'A', 'a@example.com', now);
    const insert = first.db.prepare(`INSERT INTO production_runs(account_id,id,run_number,item,quantity,completed_quantity,unit,status,scheduled_date,notes,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
    insert.run('a', 'full', 'PR-0001', 'A', 5, 5, 'units', 'in_progress', '2026-11-05', '', now, now);
    insert.run('a', 'partial', 'PR-0002', 'B', 5, 4, 'units', 'scheduled', '2026-11-05', '', now, now);
    first.db.prepare('DELETE FROM schema_migrations WHERE version = 18').run();
    first.db.close();
    first.releaseInstanceLock();
    first = null;

    second = await import('../server/db.js?complete-migration-apply');
    assert.equal(second.db.prepare("SELECT status FROM production_runs WHERE id = 'full'").get().status, 'completed');
    assert.equal(second.db.prepare("SELECT status FROM production_runs WHERE id = 'partial'").get().status, 'scheduled');
  } finally {
    try { first?.db.close(); } catch { /* Already closed. */ }
    try { first?.releaseInstanceLock(); } catch { /* Already released. */ }
    try { second?.db.close(); } catch { /* Already closed. */ }
    try { second?.releaseInstanceLock(); } catch { /* Already released. */ }
    if (prior === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = prior;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
