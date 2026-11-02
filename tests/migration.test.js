import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { listEmails, getEmail, clearSavedEmails } from '../server/email-queries.js';

test('migration converts old PO mail and hides unrelated saved mail', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'po-checker-migration-'));
  const prior = process.env.DATA_DIR;
  const old = new Database(path.join(directory, 'po-checker.db'));
  old.exec(`CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);
    INSERT INTO schema_migrations VALUES(1,'2026-01-01'),(2,'2026-01-01');
    CREATE TABLE accounts(id TEXT PRIMARY KEY,display_name TEXT,email TEXT,created_at TEXT);
    CREATE TABLE runs(id TEXT PRIMARY KEY,account_id TEXT,cutoff TEXT,started_at TEXT,last_success_at TEXT,error TEXT,status TEXT);
    CREATE TABLE emails(account_id TEXT NOT NULL,message_id TEXT NOT NULL,run_id TEXT NOT NULL,sender_address TEXT NOT NULL,sender_name TEXT NOT NULL DEFAULT '',recipients TEXT NOT NULL DEFAULT '[]',subject TEXT NOT NULL DEFAULT '',received_at TEXT NOT NULL,preview TEXT NOT NULL DEFAULT '',body TEXT NOT NULL DEFAULT '',has_attachments INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(account_id,message_id));
    CREATE TABLE account_clears(account_id TEXT PRIMARY KEY,cleared_at TEXT NOT NULL);
    INSERT INTO emails(account_id,message_id,run_id,sender_address,subject,received_at,body) VALUES
      ('a','po','r','orders@example.com',' po ','2026-01-02T00:00:00.000Z','ITEM: Steel\nQuantity: 3\nUnit: kg\nETA: 2 weeks'),
      ('a','other','r','orders@example.com','Hello','2026-01-03T00:00:00.000Z','Unrelated');`);
  old.close();
  process.env.DATA_DIR = directory;
  let loaded;
  try {
    loaded = await import('../server/db.js?migration-test');
    const { db } = loaded;
    const page = listEmails(db, { accountId: 'a', cutoff: '2026-01-01T00:00:00.000Z' });
    assert.equal(page.total, 1);
    assert.deepEqual(page.items.map((item) => [item.id, item.item, item.quantity, item.unit, item.eta, item.poStatus]), [['po', 'Steel', 3, 'kg', '2 weeks', 'valid']]);
    assert.equal(getEmail(db, 'a', 'other'), null);
    assert.equal(clearSavedEmails(db, 'a', '2026-01-04T00:00:00.000Z'), 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM emails').get().count, 1);
    assert.equal(db.prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1').get().version, 3);
  } finally {
    loaded?.db.close();
    loaded?.releaseInstanceLock();
    if (prior === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = prior;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
