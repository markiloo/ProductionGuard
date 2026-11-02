import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { getEmail, listEmails, parsePagination } from '../server/email-queries.js';

function store() {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE emails(account_id TEXT NOT NULL,message_id TEXT NOT NULL,sender_address TEXT NOT NULL,sender_name TEXT NOT NULL,recipients TEXT NOT NULL,subject TEXT NOT NULL,received_at TEXT NOT NULL,preview TEXT NOT NULL,body TEXT NOT NULL,has_attachments INTEGER NOT NULL,item TEXT,quantity INTEGER,unit TEXT,eta TEXT,po_status TEXT,po_error TEXT,PRIMARY KEY(account_id,message_id));`);
  const insert = db.prepare('INSERT INTO emails(account_id,message_id,sender_address,sender_name,recipients,subject,received_at,preview,body,has_attachments) VALUES(?,?,?,?,?,?,?,?,?,?)');
  const email = (account, id, received, subject, body = '', sender = 'orders@example.com', name = 'Orders') => { insert.run(account, id, sender, name, JSON.stringify([{ type: 'To', name: 'Buyer', address: 'buyer@example.com' }]), subject, received, 'preview', body, 1); db.prepare('UPDATE emails SET po_status=?,item=? WHERE account_id=? AND message_id=?').run('valid', subject, account, id); };
  email('acct-a', 'old', '2026-01-14T10:00:00.000Z', 'Old subject', 'old history');
  email('acct-a', 'one', '2026-01-16T10:00:00.000Z', 'Subject one', 'body needle');
  email('acct-a', 'two', '2026-01-17T10:00:00.000Z', 'Subject two', 'other body');
  email('acct-a', 'three', '2026-01-18T10:00:00.000Z', 'Subject three', 'third body', 'billing@example.com', 'Billing Team');
  email('acct-b', 'one', '2026-01-19T10:00:00.000Z', 'Other account', 'secret body');
  return db;
}

test('email listing is account-scoped, newest-first, searchable, and correctly paginated', () => {
  const db = store();
  try {
    const page = listEmails(db, { accountId: 'acct-a', cutoff: '2026-01-15T00:00:00.000Z', limit: 2, offset: 1 });
    assert.deepEqual(page.items.map((item) => item.id), ['two', 'one']);
    assert.equal(page.total, 3);
    assert.deepEqual(listEmails(db, { accountId: 'acct-a', cutoff: '2026-01-15T00:00:00.000Z', query: 'needle' }).items.map((item) => item.id), ['one']);
    assert.deepEqual(listEmails(db, { accountId: 'acct-a', cutoff: '2026-01-15T00:00:00.000Z', query: 'billing@example.com' }).items.map((item) => item.id), ['three']);
    assert.deepEqual(listEmails(db, { accountId: 'acct-a', cutoff: '2026-01-15T00:00:00.000Z', query: 'Billing Team' }).items.map((item) => item.id), ['three']);
    assert.deepEqual(listEmails(db, { accountId: 'acct-a', cutoff: '2026-01-15T00:00:00.000Z', query: 'Subject three' }).items.map((item) => item.id), ['three']);
    assert.equal(listEmails(db, { accountId: 'acct-a', cutoff: '2026-01-15T00:00:00.000Z', scope: 'all' }).total, 4);
    assert.equal(listEmails(db, { accountId: 'acct-b', cutoff: '2026-01-15T00:00:00.000Z', scope: 'all' }).total, 1);
  } finally { db.close(); }
});

test('email details are account-scoped and include the full text body and recipients', () => {
  const db = store();
  try {
    const own = getEmail(db, 'acct-a', 'one');
    assert.equal(own.body, 'body needle');
    assert.equal(own.recipients[0].address, 'buyer@example.com');
    assert.equal(getEmail(db, 'acct-a', 'missing'), null);
    assert.equal(getEmail(db, 'acct-b', 'one').body, 'secret body');
  } finally { db.close(); }
});

test('pagination bounds malformed, negative, and oversized values', () => {
  assert.deepEqual(parsePagination('nope', '-20'), { limit: 25, offset: 0 });
  assert.deepEqual(parsePagination('5000', '90000000'), { limit: 100, offset: 1_000_000 });
  assert.deepEqual(parsePagination('10', '17'), { limit: 10, offset: 17 });
});
