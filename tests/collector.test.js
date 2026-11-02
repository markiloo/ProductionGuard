import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import Database from 'better-sqlite3';
import { createCollector } from '../server/collector-core.js';
import { clearSavedEmails } from '../server/email-queries.js';

const cutoff = '2026-11-02T09:00:00.000Z';
const message = (uid, at, address = 'orders@example.com', subject = 'PO') => ({ uid, emailId: `gmail-${uid}`, internalDate: new Date(at), envelope: { from: [{ address, name: 'Orders' }], to: [{ address: 'buyer@example.com' }], subject }, bodyStructure: { type: 'multipart/mixed', childNodes: [{ part: '1', type: 'text/plain' }, { part: '2', type: 'application/pdf', disposition: 'attachment' }] } });

function fixture(fetchMessage, download = async () => ({ content: Readable.from([Buffer.from('ITEM: Steel\nQUANTITY: 2\nUNIT: kg\nETA: 1 week\nSUPPLIER: Acme Supply')]) })) {
  const db = new Database(':memory:');
  db.exec("CREATE TABLE runs(id TEXT PRIMARY KEY,account_id TEXT,cutoff TEXT,started_at TEXT,last_success_at TEXT,error TEXT,status TEXT);CREATE TABLE senders(account_id TEXT,address TEXT,normalized_address TEXT,created_at TEXT,PRIMARY KEY(account_id,normalized_address));CREATE TABLE emails(account_id TEXT,message_id TEXT,run_id TEXT,sender_address TEXT,sender_name TEXT,recipients TEXT,subject TEXT,received_at TEXT,preview TEXT,body TEXT,has_attachments INTEGER,item TEXT,quantity INTEGER,unit TEXT,eta TEXT,supplier TEXT,po_status TEXT,po_error TEXT,PRIMARY KEY(account_id,message_id));CREATE TABLE account_clears(account_id TEXT PRIMARY KEY,cleared_at TEXT NOT NULL);");
  db.prepare('INSERT INTO senders VALUES(?,?,?,?)').run('gmail:a@gmail.com', 'orders@example.com', 'orders@example.com', cutoff);
  let account = 'gmail:a@gmail.com';
  const calls = { searches: [], downloads: [], closes: 0 };
  const collector = createCollector({ db, cutoff, getAccountId: () => account, getCredentials: () => ({ email: 'a@gmail.com', password: 'fake' }), sleep: async () => {}, createClient: () => ({ mailbox: { uidValidity: 1n }, connect: async () => {}, getMailboxLock: async (_name, options) => { assert.equal(options.readOnly, true); return { release() {} }; }, search: async (query) => { calls.searches.push(query); return [1, 2, 3, 4]; }, fetchOne: async (uid) => fetchMessage(uid), download: async (uid, part) => { calls.downloads.push({ uid, part }); return download(uid, part); }, logout: async () => {}, close() { calls.closes += 1; } }) });
  return { db, collector, calls, setAccount: (value) => { account = value; }, count: () => db.prepare('SELECT COUNT(*) count FROM emails').get().count };
}

test('Gmail collector applies strict received cutoff, exact From address, and downloads only text parts', async () => {
  const data = fixture((uid) => [message(1, '2026-11-02T08:59:59Z'), message(2, cutoff), message(3, '2026-11-02T09:01:00Z', 'other@example.com'), message(4, '2026-11-02T09:02:00Z')][uid - 1]);
  try {
    await data.collector.collect();
    assert.equal(data.count(), 1);
    assert.deepEqual(data.calls.downloads, [{ uid: 4, part: '1' }]);
    const saved = data.db.prepare('SELECT * FROM emails').get();
    assert.equal(saved.message_id, 'gmail-4');
    assert.equal(saved.item, 'Steel');
    assert.equal(saved.quantity, 2);
    assert.equal(saved.supplier, 'Acme Supply');
    assert.equal(saved.po_status, 'valid');
    assert.equal(saved.has_attachments, 1);
    assert.equal(JSON.parse(saved.recipients)[0].address, 'buyer@example.com');
    assert.equal(data.calls.searches[0].from, 'orders@example.com');
    assert.equal(data.collector.state().currentRunCount, 1);
  } finally { data.collector.stop(); data.db.close(); }
});

test('collector ignores non-PO subjects before downloading text', async () => {
  const data = fixture(() => message(4, '2026-11-02T09:02:00Z', 'orders@example.com', 'PO 123'));
  try {
    await data.collector.collect();
    assert.equal(data.count(), 0);
    assert.equal(data.calls.downloads.length, 0);
  } finally { data.collector.stop(); data.db.close(); }
});

test('collector saves malformed PO mail for review', async () => {
  const data = fixture(() => message(4, '2026-11-02T09:02:00Z', 'orders@example.com', ' po '), async () => ({ content: Readable.from([Buffer.from('ITEM: Bolts\nQuantity: zero\nUnit: boxes')]) }));
  try {
    await data.collector.collect();
    const saved = data.db.prepare('SELECT item,quantity,po_status,po_error FROM emails').get();
    assert.equal(saved.item, 'Bolts');
    assert.equal(saved.quantity, null);
    assert.equal(saved.po_status, 'needs_review');
    assert.match(saved.po_error, /Quantity/);
    assert.match(saved.po_error, /Unit/);
    assert.match(saved.po_error, /ETA/);
  } finally { data.collector.stop(); data.db.close(); }
});

test('repeated checks deduplicate and retain saved mail after sender removal', async () => {
  const data = fixture(() => message(4, '2026-11-02T09:02:00Z'));
  try {
    await data.collector.collect();
    await data.collector.collect();
    assert.equal(data.count(), 1);
    assert.equal(data.calls.downloads.length, 1);
    data.db.prepare('DELETE FROM senders').run();
    await data.collector.collect();
    assert.equal(data.count(), 1);
  } finally { data.collector.stop(); data.db.close(); }
});

test('sign-out during a text download cannot insert stale mail', async () => {
  let finish;
  let started;
  const downloading = new Promise((resolve) => { started = resolve; });
  const data = fixture(() => message(4, '2026-11-02T09:02:00Z'), async () => { started(); return new Promise((resolve) => { finish = resolve; }); });
  try {
    const pending = data.collector.collect();
    await downloading;
    data.setAccount(null);
    data.collector.stop();
    finish({ content: Readable.from([Buffer.from('stale text')]) });
    await pending;
    assert.equal(data.count(), 0);
  } finally { data.collector.stop(); data.db.close(); }
});

test('new sender checks the current cutoff window and uses the same Gmail account', async () => {
  const data = fixture(() => message(4, '2026-11-02T09:02:00Z', 'later@example.com'));
  try {
    await data.collector.collect();
    assert.equal(data.count(), 0);
    data.db.prepare('INSERT INTO senders VALUES(?,?,?,?)').run('gmail:a@gmail.com', 'later@example.com', 'later@example.com', cutoff);
    await data.collector.collect();
    assert.equal(data.count(), 1);
    assert.equal(data.collector.state().cutoff, cutoff);
  } finally { data.collector.stop(); data.db.close(); }
});

test('clearing local mail keeps old Inbox messages cleared and accepts newer mail', async () => {
  let incoming = message(4, '2026-11-02T09:02:00Z');
  const data = fixture(() => incoming);
  try {
    await data.collector.collect();
    assert.equal(data.count(), 1);
    assert.equal(clearSavedEmails(data.db, 'gmail:a@gmail.com', '2026-11-02T09:03:00Z'), 1);
    assert.equal(data.count(), 0);
    await data.collector.collect();
    assert.equal(data.count(), 0);
    incoming = message(5, '2026-11-02T09:04:00Z');
    await data.collector.collect();
    assert.equal(data.count(), 1);
    assert.equal(data.db.prepare('SELECT message_id FROM emails').get().message_id, 'gmail-5');
  } finally { data.collector.stop(); data.db.close(); }
});

test('clear during a text download blocks the pending insert', async () => {
  let finish;
  let started;
  const downloading = new Promise((resolve) => { started = resolve; });
  const data = fixture(() => message(4, '2026-11-02T09:02:00Z'), async () => { started(); return new Promise((resolve) => { finish = resolve; }); });
  try {
    const pending = data.collector.collect();
    await downloading;
    assert.equal(clearSavedEmails(data.db, 'gmail:a@gmail.com', '2026-11-02T09:03:00Z'), 0);
    finish({ content: Readable.from([Buffer.from('old text')]) });
    await pending;
    assert.equal(data.count(), 0);
  } finally { data.collector.stop(); data.db.close(); }
});
