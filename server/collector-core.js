import crypto from 'node:crypto';
import { ImapFlow } from 'imapflow';
import { htmlToText } from 'html-to-text';
import { normalizeSender } from './rules.js';
import { isPoSubject, parsePo } from './po.js';

const now = () => new Date().toISOString();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Collect Gmail INBOX mail during one server run. Dependencies may be injected for offline checks. */
export function createCollector({ db, cutoff, getAccountId, getCredentials, createClient = (credentials) => new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user: credentials.email, pass: credentials.password }, logger: false }), clock = now, sleep = wait }) {
  const runId = crypto.randomUUID();
  db.prepare("INSERT INTO runs(id, cutoff, started_at, status) VALUES (?, ?, ?, 'waiting')").run(runId, cutoff, clock());
  let timer = null; let active = false; let generation = 0; let rerun = false; let client = null; let error = null;
  const account = () => getAccountId() || null;
  const state = () => {
    const run = db.prepare('SELECT last_success_at FROM runs WHERE id=?').get(runId);
    const currentRunCount = db.prepare('SELECT COUNT(*) count FROM emails WHERE account_id=? AND run_id=? AND po_status IS NOT NULL').get(account() || '', runId).count;
    return { runId, cutoff, lastSuccessAt: run.last_success_at, error, collecting: active, currentRunCount };
  };
  const stop = () => { clearInterval(timer); timer = null; generation += 1; rerun = false; if (client) client.close(); };
  const begin = () => { if (timer) return; timer = setInterval(() => collect().catch(() => {}), 15_000); collect({ rerunIfActive: true }).catch(() => {}); };
  async function collect({ rerunIfActive = false } = {}) {
    if (active) { if (rerunIfActive) rerun = true; return; }
    active = true;
    const version = generation;
    const accountId = account();
    try {
      if (!accountId) return;
      const senders = db.prepare('SELECT address,normalized_address FROM senders WHERE account_id=?').all(accountId);
      const credentials = getCredentials();
      if (!senders.length || !credentials) return;
      error = null;
      db.prepare("UPDATE runs SET account_id=?,status='running' WHERE id=?").run(accountId, runId);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          client = createClient(credentials);
          await client.connect();
          if (version !== generation || account() !== accountId) return;
          const lock = await client.getMailboxLock('INBOX', { readOnly: true });
          try {
            for (const sender of senders) {
              const uids = await client.search({ since: new Date(cutoff), from: sender.address }, { uid: true }) || [];
              for (const uid of uids) {
                if (version !== generation || account() !== accountId) return;
                const message = await client.fetchOne(uid, { uid: true, emailId: true, envelope: true, internalDate: true, bodyStructure: true }, { uid: true });
                if (!message) continue;
                const from = message.envelope?.from?.[0];
                const receivedTime = new Date(message.internalDate);
                if (Number.isNaN(receivedTime.getTime())) continue;
                const receivedAt = receivedTime.toISOString();
                if (Date.parse(receivedAt) <= Date.parse(cutoff) || normalizeSender(from?.address) !== sender.normalized_address || !isPoSubject(message.envelope?.subject)) continue;
                const id = String(message.emailId || `${client.mailbox.uidValidity}:${uid}`);
                if (db.prepare('SELECT 1 FROM emails WHERE account_id=? AND message_id=?').get(accountId, id)) continue;
                if (!allowed(accountId, from.address, receivedAt, version)) continue;
                const parts = inspectParts(message.bodyStructure);
                let body = '';
                const chosen = parts.plain || parts.html;
                if (chosen) {
                  const downloaded = await client.download(uid, chosen, { uid: true });
                  if (downloaded.content) {
                    const chunks = [];
                    for await (const chunk of downloaded.content) chunks.push(chunk);
                    body = Buffer.concat(chunks).toString('utf8');
                    if (!parts.plain) body = htmlToText(body, { wordwrap: false });
                  }
                }
                if (!allowed(accountId, from.address, receivedAt, version)) continue;
                const recipients = ['to', 'cc', 'bcc'].flatMap((type) => (message.envelope?.[type] || []).map((item) => ({ type: type === 'to' ? 'To' : type === 'cc' ? 'Cc' : 'Bcc', name: item.name || '', address: item.address || '' })));
                const po = parsePo(body);
                db.prepare('INSERT OR IGNORE INTO emails(account_id,message_id,run_id,sender_address,sender_name,recipients,subject,received_at,preview,body,has_attachments,item,quantity,unit,eta,po_status,po_error) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(accountId, id, runId, from.address, from.name || '', JSON.stringify(recipients), message.envelope.subject || '', receivedAt, body.slice(0, 200), body, parts.hasAttachments ? 1 : 0, po.item, po.quantity, po.unit, po.eta, po.poStatus, po.poError);
              }
            }
          } finally { lock.release(); }
          if (version === generation && account() === accountId) db.prepare("UPDATE runs SET last_success_at=?,error=NULL WHERE id=?").run(clock(), runId);
          return;
        } catch (failure) {
          if (version !== generation || account() !== accountId) return;
          if (isAuthError(failure) || attempt === 2) throw failure;
          await sleep(1000 * 2 ** attempt);
        } finally {
          try { await client?.logout(); } catch { /* Broken connections close themselves. */ }
          client = null;
        }
      }
    } catch (failure) {
      if (version !== generation || account() !== accountId) return;
      error = isAuthError(failure) ? 'Gmail sign-in failed. Check or replace the app password.' : 'Gmail connection failed. The collector will retry.';
      db.prepare('UPDATE runs SET error=? WHERE id=?').run(error, runId);
      console.error(JSON.stringify({ level: 'error', event: 'collection_failed', message: error }));
    } finally {
      active = false;
      if (rerun) { rerun = false; queueMicrotask(() => collect().catch(() => {})); }
    }
  }
  function allowed(accountId, address, receivedAt, version) {
    return version === generation && account() === accountId
      && Boolean(db.prepare('SELECT 1 FROM senders WHERE account_id=? AND normalized_address=?').get(accountId, normalizeSender(address)))
      && !db.prepare('SELECT 1 FROM account_clears WHERE account_id=? AND cleared_at>=?').get(accountId, receivedAt);
  }
  return { runId, state, stop, begin, collect };
}

function inspectParts(root) {
  const result = { plain: null, html: null, hasAttachments: false };
  function visit(part) {
    if (!part) return;
    const type = String(part.type || '').toLowerCase();
    const disposition = String(part.disposition || '').toLowerCase();
    const attached = disposition === 'attachment' || Boolean(part.parameters?.name || part.dispositionParameters?.filename);
    if (attached) { result.hasAttachments = true; return; }
    if (type === 'text/plain' && !result.plain) result.plain = part.part || '1';
    if (type === 'text/html' && !result.html) result.html = part.part || '1';
    for (const child of part.childNodes || []) visit(child);
  }
  visit(root);
  return result;
}
function isAuthError(failure) { return /AUTHENTICATIONFAILED|Invalid credentials|Application-specific password|Login failed|Invalid login/i.test(String(failure?.message || '')); }
