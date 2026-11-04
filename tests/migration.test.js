import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { listEmails, getEmail, clearSavedEmails } from '../server/email-queries.js';

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
    const page = listEmails(db, { accountId: 'a', cutoff: '2026-01-01T00:00:00.000Z' });
    assert.equal(page.total, 2);
    assert.deepEqual(page.items.map((item) => [item.id, item.supplier, item.poStatus]), [['old-po', null, 'needs_review'], ['po', 'Acme Supply', 'valid']]);
    assert.match(getEmail(db, 'a', 'old-po').poError, /supplier/i);
    assert.equal(getEmail(db, 'a', 'other'), null);
    assert.equal(db.prepare("SELECT po_state FROM emails WHERE message_id='po'").get().po_state, 'pending_review');
    assert.equal(clearSavedEmails(db, 'a', '2026-01-04T00:00:00.000Z'), 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM emails').get().count, 1);
    assert.equal(db.prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1').get().version, 15);
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'inventory'").get());
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'production_runs'").get());
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'production_requirements'").get());
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'incoming_deliveries'").get());
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'item_definitions'").get(), undefined);
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'production_items'").get());
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'po_proofs'").get());
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'delivery_receipts'").get());
    assert.ok(db.prepare("SELECT name FROM pragma_table_info('incoming_deliveries') WHERE name = 'received_quantity'").get());
  } finally {
    loaded?.db.close();
    loaded?.releaseInstanceLock();
    if (prior === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = prior;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
