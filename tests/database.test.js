import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

test('SQLite schema persists data and enforces account-scoped uniqueness', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'po-checker-test-'));
  process.env.DATA_DIR = directory;
  const { db, releaseInstanceLock } = await import('../server/db.js');
  try {
    const now = new Date().toISOString();
    const account = db.prepare('INSERT INTO accounts(id,display_name,email,created_at) VALUES(?,?,?,?)');
    account.run('account-a', 'A', 'a@example.com', now);
    account.run('account-b', 'B', 'b@example.com', now);
    db.prepare('INSERT INTO runs(id,account_id,cutoff,started_at,status) VALUES(?,?,?,?,?)').run('run-a', 'account-a', now, now, 'running');
    db.prepare('INSERT INTO runs(id,account_id,cutoff,started_at,status) VALUES(?,?,?,?,?)').run('run-b', 'account-b', now, now, 'running');
    const sender = db.prepare('INSERT INTO senders(account_id,address,normalized_address,created_at) VALUES(?,?,?,?)');
    sender.run('account-a', 'Mail@example.com', 'mail@example.com', now);
    assert.throws(() => sender.run('account-a', 'mail@example.com', 'mail@example.com', now));
    sender.run('account-b', 'mail@example.com', 'mail@example.com', now);
    const email = db.prepare('INSERT INTO emails(account_id,message_id,run_id,sender_address,received_at) VALUES(?,?,?,?,?)');
    email.run('account-a', 'immutable-id', 'run-a', 'mail@example.com', now);
    email.run('account-b', 'immutable-id', 'run-b', 'mail@example.com', now);
    assert.throws(() => email.run('account-a', 'immutable-id', 'run-a', 'mail@example.com', now));
    assert.equal(db.prepare('SELECT COUNT(*) count FROM emails WHERE account_id=?').get('account-a').count, 1);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM emails WHERE account_id=?').get('account-b').count, 1);
    db.close();
    releaseInstanceLock();
    const reopened = await import('../server/db.js?reopen');
    assert.equal(reopened.db.prepare('SELECT COUNT(*) count FROM accounts').get().count, 2);
    assert.equal(reopened.db.prepare('SELECT COUNT(*) count FROM senders').get().count, 2);
    assert.equal(reopened.db.prepare('SELECT COUNT(*) count FROM emails').get().count, 2);
    reopened.db.close();
    reopened.releaseInstanceLock();
  } finally {
    try { fs.rmSync(directory, { recursive: true, force: true }); } catch { /* Cleanup after Windows releases SQLite handles. */ }
  }
});
