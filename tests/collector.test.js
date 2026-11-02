import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { createCollector } from '../server/collector-core.js';

const cutoff = '2026-11-02T09:00:00.000Z';
const accepted = (id, receivedDateTime, address = 'orders@example.com', displayName = 'Orders') => ({
  id,
  receivedDateTime,
  from: { emailAddress: { address, name: displayName } },
  toRecipients: [{ emailAddress: { address: 'buyer@example.com', name: 'Buyer' } }],
  ccRecipients: [{ emailAddress: { address: 'copy@example.com', name: 'Copy' } }],
  bccRecipients: [],
  subject: `Subject ${id}`,
  bodyPreview: 'Short preview',
  hasAttachments: true,
});

function createStore() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE runs (id TEXT PRIMARY KEY, account_id TEXT, cutoff TEXT NOT NULL, started_at TEXT NOT NULL, last_success_at TEXT, error TEXT, status TEXT NOT NULL);
    CREATE TABLE senders (account_id TEXT NOT NULL, address TEXT NOT NULL, normalized_address TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(account_id, normalized_address));
    CREATE TABLE emails (account_id TEXT NOT NULL, message_id TEXT NOT NULL, run_id TEXT NOT NULL, sender_address TEXT NOT NULL, sender_name TEXT NOT NULL DEFAULT '', recipients TEXT NOT NULL DEFAULT '[]', subject TEXT NOT NULL DEFAULT '', received_at TEXT NOT NULL, preview TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', has_attachments INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(account_id, message_id));
  `);
  const now = new Date().toISOString();
  const addSender = db.prepare('INSERT INTO senders(account_id,address,normalized_address,created_at) VALUES(?,?,?,?)');
  return { db, addSender: (account, address) => addSender.run(account, address, address.toLowerCase(), now) };
}

const jsonResponse = (payload, status = 200, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: new Headers(headers), json: async () => payload });
const detail = (id, body) => jsonResponse({ id, body: { contentType: 'text', content: body } });
const countEmails = (db) => db.prepare('SELECT COUNT(*) AS count FROM emails').get().count;

test('collector applies strict cutoff and exact From address before fetching full bodies', async () => {
  const { db, addSender } = createStore();
  addSender('acct-a', 'orders@example.com');
  const items = [
    accepted('before', '2026-11-02T08:59:59.999Z'),
    accepted('at-cutoff', cutoff),
    accepted('new', '2026-11-02T09:01:00.000Z'),
    accepted('misleading', '2026-11-02T09:02:00.000Z', 'other@example.com', 'orders@example.com'),
  ];
  const requests = [];
  const collector = createCollector({
    db, cutoff, getAccessToken: async () => 'test-token', getAccountId: () => 'acct-a', now: () => '2026-11-02T09:05:00.000Z',
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return String(url).includes('/mailFolders/inbox/messages') ? jsonResponse({ value: items }) : detail('new', 'Full readable body');
    },
  });
  try {
    await collector.collect();
    assert.equal(countEmails(db), 1);
    const saved = db.prepare('SELECT * FROM emails').get();
    assert.equal(saved.message_id, 'new');
    assert.equal(saved.body, 'Full readable body');
    assert.equal(saved.has_attachments, 1);
    assert.deepEqual(JSON.parse(saved.recipients).map((recipient) => recipient.type), ['To', 'Cc']);
    assert.equal(requests.length, 2, 'only the eligible, exact-sender message gets its full body fetched');
    const listUrl = new URL(requests[0].url);
    assert.match(listUrl.searchParams.get('$filter'), /receivedDateTime gt 2026-11-02T09:00:00\.000Z/);
    assert.match(listUrl.searchParams.get('$filter'), /from\/emailAddress\/address eq 'orders@example\.com'/);
    assert.match(requests[0].options.headers.Prefer, /ImmutableId/);
    assert.equal(collector.state().lastSuccessAt, '2026-11-02T09:05:00.000Z');
  } finally { collector.stop(); db.close(); }
});

test('collector follows all pages and deduplicates repeated results before detail retrieval', async () => {
  const { db, addSender } = createStore();
  addSender('acct-a', 'orders@example.com');
  const first = accepted('repeat', '2026-11-02T09:01:00Z');
  const second = accepted('later', '2026-11-02T09:02:00Z');
  const detailCalls = [];
  const collector = createCollector({
    db, cutoff, getAccessToken: async () => 'token', getAccountId: () => 'acct-a',
    fetchImpl: async (url) => {
      const target = String(url);
      if (target.includes('page=2')) return jsonResponse({ value: [first, second] });
      if (target.includes('/mailFolders/inbox/messages')) {
        return jsonResponse({ value: [first], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/next?page=2' });
      }
      const id = target.includes('/repeat?') ? 'repeat' : 'later';
      detailCalls.push(id);
      return detail(id, `Body ${id}`);
    },
  });
  try {
    await collector.collect();
    assert.equal(countEmails(db), 2);
    assert.deepEqual(detailCalls.sort(), ['later', 'repeat']);
    assert.equal(db.prepare('SELECT body FROM emails WHERE message_id=?').get('repeat').body, 'Body repeat');
  } finally { collector.stop(); db.close(); }
});

test('a later poll catches delayed visibility for a newly added sender within the unchanged run window', async () => {
  const { db, addSender } = createStore();
  addSender('acct-a', 'orders@example.com');
  let visible = false;
  const collector = createCollector({
    db, cutoff, getAccessToken: async () => 'token', getAccountId: () => 'acct-a',
    fetchImpl: async (url) => String(url).includes('/mailFolders/inbox/messages')
      ? jsonResponse({ value: visible ? [accepted('delayed', '2026-11-02T09:03:00Z', 'later@example.com')] : [] })
      : detail('delayed', 'Delayed body'),
  });
  try {
    await collector.collect();
    assert.equal(countEmails(db), 0);
    addSender('acct-a', 'later@example.com');
    visible = true;
    await collector.collect();
    assert.equal(collector.state().cutoff, cutoff);
    assert.equal(countEmails(db), 1);
    assert.equal(db.prepare('SELECT message_id FROM emails').get().message_id, 'delayed');
  } finally { collector.stop(); db.close(); }
});

test('sign-out during a full-body request prevents stale results from being inserted', async () => {
  const { db, addSender } = createStore();
  addSender('acct-a', 'orders@example.com');
  let account = 'acct-a';
  let resolveDetail;
  let detailRequested;
  const detailStarted = new Promise((resolve) => { detailRequested = resolve; });
  const collector = createCollector({
    db, cutoff, getAccessToken: async () => 'token', getAccountId: () => account,
    fetchImpl: async (url) => {
      if (String(url).includes('/mailFolders/inbox/messages')) return jsonResponse({ value: [accepted('stale', '2026-11-02T09:04:00Z')] });
      detailRequested();
      return new Promise((resolve) => { resolveDetail = resolve; });
    },
  });
  try {
    const pending = collector.collect();
    await detailStarted;
    account = null;
    collector.stop();
    resolveDetail(detail('stale', 'Must not be saved'));
    await pending;
    assert.equal(countEmails(db), 0);
  } finally { collector.stop(); db.close(); }
});

test('sign-out while silent token acquisition is pending prevents the old poll from starting', async () => {
  const { db, addSender } = createStore();
  addSender('acct-a', 'orders@example.com');
  let account = 'acct-a';
  let resolveToken;
  let tokenRequested;
  const tokenStarted = new Promise((resolve) => { tokenRequested = resolve; });
  let fetchCalls = 0;
  const collector = createCollector({
    db, cutoff, getAccessToken: () => { tokenRequested(); return new Promise((resolve) => { resolveToken = resolve; }); }, getAccountId: () => account,
    fetchImpl: async () => { fetchCalls += 1; return jsonResponse({ value: [] }); },
  });
  try {
    const pending = collector.collect();
    await tokenStarted;
    account = null;
    collector.stop();
    resolveToken('stale-token');
    await pending;
    assert.equal(fetchCalls, 0);
    assert.equal(countEmails(db), 0);
  } finally { collector.stop(); db.close(); }
});

test('simultaneous collection requests share one active poll instead of overlapping', async () => {
  const { db, addSender } = createStore();
  addSender('acct-a', 'orders@example.com');
  let resolveToken;
  let tokenCalls = 0;
  const collector = createCollector({
    db, cutoff, getAccessToken: () => { tokenCalls += 1; return new Promise((resolve) => { resolveToken = resolve; }); }, getAccountId: () => 'acct-a',
    fetchImpl: async () => jsonResponse({ value: [] }),
  });
  try {
    const first = collector.collect();
    await new Promise((resolve) => setImmediate(resolve));
    await collector.collect();
    assert.equal(tokenCalls, 1);
    assert.equal(collector.state().collecting, true);
    resolveToken(null);
    await first;
    assert.equal(collector.state().collecting, false);
  } finally { collector.stop(); db.close(); }
});

test('switching accounts during a request cannot put one account\'s message in another account\'s history', async () => {
  const { db, addSender } = createStore();
  addSender('acct-a', 'orders@example.com');
  addSender('acct-b', 'orders@example.com');
  let account = 'acct-a';
  let resolveDetail;
  let detailRequested;
  const detailStarted = new Promise((resolve) => { detailRequested = resolve; });
  const collector = createCollector({
    db, cutoff, getAccessToken: async () => 'token-a', getAccountId: () => account,
    fetchImpl: async (url) => {
      if (String(url).includes('/mailFolders/inbox/messages')) return jsonResponse({ value: [accepted('account-a-mail', '2026-11-02T09:04:00Z')] });
      detailRequested();
      return new Promise((resolve) => { resolveDetail = resolve; });
    },
  });
  try {
    const pending = collector.collect();
    await detailStarted;
    account = 'acct-b';
    collector.stop();
    resolveDetail(detail('account-a-mail', 'Account A body'));
    await pending;
    assert.equal(countEmails(db), 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM emails WHERE account_id=?').get('acct-b').count, 0);
  } finally { collector.stop(); db.close(); }
});

test('sender removal during a full-body request prevents insertion but preserves prior history', async () => {
  const { db, addSender } = createStore();
  addSender('acct-a', 'orders@example.com');
  let resolveDetail;
  let detailRequested;
  const detailStarted = new Promise((resolve) => { detailRequested = resolve; });
  const collector = createCollector({
    db, cutoff, getAccessToken: async () => 'token', getAccountId: () => 'acct-a',
    fetchImpl: async (url) => {
      if (String(url).includes('/mailFolders/inbox/messages')) return jsonResponse({ value: [accepted('removed', '2026-11-02T09:04:00Z')] });
      detailRequested();
      return new Promise((resolve) => { resolveDetail = resolve; });
    },
  });
  try {
    db.prepare('INSERT INTO emails(account_id,message_id,run_id,sender_address,received_at) VALUES(?,?,?,?,?)').run('acct-a', 'saved', collector.runId, 'orders@example.com', '2026-11-02T09:01:00Z');
    const pending = collector.collect();
    await detailStarted;
    db.prepare('DELETE FROM senders WHERE account_id=?').run('acct-a');
    resolveDetail(detail('removed', 'Must not be saved'));
    await pending;
    assert.equal(countEmails(db), 1);
    assert.equal(db.prepare('SELECT message_id FROM emails').get().message_id, 'saved');
  } finally { collector.stop(); db.close(); }
});

test('collector respects Retry-After, recovers from throttling, and records auth expiry', async () => {
  const { db, addSender } = createStore();
  addSender('acct-a', 'orders@example.com');
  const waits = [];
  let throttled = false;
  let interactive = 0;
  const collector = createCollector({
    db, cutoff, getAccessToken: async () => 'token', getAccountId: () => 'acct-a', waitImpl: async (ms) => waits.push(ms),
    fetchImpl: async (url) => {
      if (!String(url).includes('/mailFolders/inbox/messages')) return detail('ok', 'body');
      if (!throttled) { throttled = true; return jsonResponse({}, 429, { 'retry-after': '0.001' }); }
      return jsonResponse({ value: [accepted('ok', '2026-11-02T09:04:00Z')] });
    },
    onInteractionRequired: () => { interactive += 1; },
  });
  try {
    await collector.collect();
    assert.deepEqual(waits, [1]);
    assert.equal(countEmails(db), 1);
    assert.ok(collector.state().lastSuccessAt);

    const expired = createCollector({
      db, cutoff, getAccessToken: async () => 'expired-token', getAccountId: () => 'acct-a',
      fetchImpl: async () => jsonResponse({}, 401), onInteractionRequired: () => { interactive += 1; },
    });
    await assert.rejects(expired.collect(), /sign-in expired/i);
    assert.equal(interactive, 1);
    assert.match(expired.state().error, /sign-in expired/i);
    expired.stop();

    const transientWaits = [];
    let transientAttempts = 0;
    let repeatedDetails = 0;
    const transient = createCollector({
      db, cutoff, getAccessToken: async () => 'token', getAccountId: () => 'acct-a', waitImpl: async (ms) => transientWaits.push(ms),
      fetchImpl: async (url) => {
        if (!String(url).includes('/mailFolders/inbox/messages')) { repeatedDetails += 1; return detail('ok', 'duplicate body'); }
        transientAttempts += 1;
        if (transientAttempts === 1) return jsonResponse({}, 503, { 'retry-after': '0.002' });
        if (transientAttempts === 2) throw new Error('temporary connection drop');
        return jsonResponse({ value: [accepted('ok', '2026-11-02T09:04:00Z')] });
      },
    });
    await transient.collect();
    assert.equal(transientAttempts, 3);
    assert.deepEqual(transientWaits, [2, 2000]);
    assert.equal(repeatedDetails, 0, 'previously saved IDs do not trigger another body fetch');
    transient.stop();
  } finally { collector.stop(); db.close(); }
});
