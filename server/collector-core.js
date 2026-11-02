import crypto from 'node:crypto';
import { isEligibleMessage } from './rules.js';

/**
 * Build a single-account, single-run Graph Inbox collector. Dependencies are injected so
 * polling, cancellation, pagination, retry, and account isolation can be exercised offline.
 */
export function createCollector({ db, cutoff, getAccessToken, getAccountId, onInteractionRequired = () => {}, fetchImpl = fetch, now = () => new Date().toISOString(), waitImpl = wait }) {
  const runId = crypto.randomUUID();
  let timer = null;
  let active = false;
  let generation = 0;
  let rerunRequested = false;
  let activeAbortController = null;
  let lastError = null;
  db.prepare("INSERT INTO runs(id, cutoff, started_at, status) VALUES (?, ?, ?, 'waiting')").run(runId, cutoff, now());

  function currentAccount() { return getAccountId() || null; }
  function state() {
    const run = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId);
    const count = db.prepare('SELECT COUNT(*) AS count FROM emails WHERE account_id = ? AND received_at > ?').get(currentAccount() || '', cutoff).count;
    return { runId, cutoff, lastSuccessAt: run.last_success_at, error: lastError, collecting: active, currentRunCount: count };
  }
  function begin() {
    if (timer) return;
    timer = setInterval(() => { collect().catch(() => {}); }, 15_000);
    collect({ rerunIfActive: true }).catch(() => {});
  }
  function stop() {
    clearInterval(timer);
    timer = null;
    generation += 1;
    rerunRequested = false;
    activeAbortController?.abort();
  }
  async function collect({ rerunIfActive = false } = {}) {
    if (active) { if (rerunIfActive) rerunRequested = true; return; }
    active = true;
    const controller = new AbortController();
    activeAbortController = controller;
    const thisGeneration = generation;
    const accountId = currentAccount();
    try {
      if (!accountId) return;
      const senders = db.prepare('SELECT address, normalized_address FROM senders WHERE account_id = ?').all(accountId);
      const token = await getAccessToken();
      if (generation !== thisGeneration || currentAccount() !== accountId || !token || !senders.length) return;
      lastError = null;
      db.prepare("UPDATE runs SET account_id = ?, status = 'running' WHERE id = ?").run(accountId, runId);
      const headers = { Authorization: `Bearer ${token}`, Prefer: 'IdType="ImmutableId", outlook.body-content-type="text"' };
      for (const sender of senders) {
        let next = new URL('https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages');
        next.searchParams.set('$filter', `receivedDateTime gt ${cutoff} and from/emailAddress/address eq '${sender.address.replaceAll("'", "''")}'`);
        next.searchParams.set('$select', 'id,from,toRecipients,ccRecipients,bccRecipients,subject,receivedDateTime,bodyPreview,hasAttachments');
        next.searchParams.set('$top', '50');
        while (next) {
          const page = await graphFetch(next.toString(), headers, controller.signal, fetchImpl, waitImpl, onInteractionRequired);
          for (const item of page.value || []) {
            if (controller.signal.aborted || generation !== thisGeneration) return;
            const messageSender = item.from?.emailAddress?.address || '';
            if (!isEligibleMessage(item, [sender.address], cutoff)) continue;
            const allowed = db.prepare('SELECT 1 FROM senders WHERE account_id = ? AND normalized_address = ?').get(accountId, messageSender.toLowerCase());
            if (!allowed || currentAccount() !== accountId || generation !== thisGeneration) continue;
            if (db.prepare('SELECT 1 FROM emails WHERE account_id = ? AND message_id = ?').get(accountId, item.id)) continue;
            const full = await graphFetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(item.id)}?$select=id,body`, headers, controller.signal, fetchImpl, waitImpl, onInteractionRequired);
            if (controller.signal.aborted || generation !== thisGeneration || currentAccount() !== accountId || !db.prepare('SELECT 1 FROM senders WHERE account_id = ? AND normalized_address = ?').get(accountId, messageSender.toLowerCase())) continue;
            const recipients = [
              ...(item.toRecipients || []).map((recipient) => ({ type: 'To', recipient })),
              ...(item.ccRecipients || []).map((recipient) => ({ type: 'Cc', recipient })),
              ...(item.bccRecipients || []).map((recipient) => ({ type: 'Bcc', recipient })),
            ].map(({ type, recipient }) => ({ type, name: recipient.emailAddress?.name || '', address: recipient.emailAddress?.address || '' }));
            db.prepare('INSERT OR IGNORE INTO emails(account_id,message_id,run_id,sender_address,sender_name,recipients,subject,received_at,preview,body,has_attachments) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(accountId, item.id, runId, messageSender, item.from?.emailAddress?.name || '', JSON.stringify(recipients), item.subject || '', item.receivedDateTime, item.bodyPreview || '', full.body?.content || '', item.hasAttachments ? 1 : 0);
          }
          next = page['@odata.nextLink'] ? new URL(page['@odata.nextLink']) : null;
        }
      }
      if (generation === thisGeneration && currentAccount() === accountId) db.prepare("UPDATE runs SET last_success_at = ?, status = 'running', error = NULL WHERE id = ?").run(now(), runId);
    } catch (error) {
      if (generation !== thisGeneration || currentAccount() !== accountId) return;
      lastError = safeError(error);
      console.error(JSON.stringify({ level: 'error', event: 'collection_failed', message: lastError }));
      db.prepare('UPDATE runs SET error = ? WHERE id = ?').run(lastError, runId);
      throw error;
    } finally {
      if (activeAbortController === controller) activeAbortController = null;
      active = false;
      if (rerunRequested) { rerunRequested = false; queueMicrotask(() => collect().catch(() => {})); }
    }
  }
  return { runId, state, begin, stop, collect };
}

async function graphFetch(url, headers, signal, fetchImpl, waitImpl, onInteractionRequired) {
  let delay = 1000;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (signal.aborted) throw new Error('Collection cancelled.');
    let response;
    try { response = await fetchImpl(url, { headers, signal }); }
    catch (error) { if (signal.aborted) throw error; if (attempt === 4) throw new Error(`Microsoft Graph connection failed: ${error.message}`); await waitImpl(delay, signal); delay = Math.min(delay * 2, 30_000); continue; }
    if (response.ok) return response.json();
    if (response.status === 401) { onInteractionRequired(); throw new Error('Microsoft sign-in expired. Sign in again.'); }
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 4) throw new Error(`Microsoft Graph request failed (${response.status}).`);
    const retryValue = response.headers.get('retry-after');
    const retrySeconds = Number(retryValue);
    const retry = Number.isFinite(retrySeconds) ? retrySeconds : retryValue ? Math.max(0, (Date.parse(retryValue) - Date.now()) / 1000) : 0;
    await waitImpl(retry ? retry * 1000 : delay, signal);
    delay = Math.min(delay * 2, 30_000);
  }
}
function wait(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('Collection cancelled.')); return; }
    const timerId = setTimeout(finish, milliseconds);
    function finish() { signal.removeEventListener('abort', abort); resolve(); }
    function abort() { clearTimeout(timerId); signal.removeEventListener('abort', abort); reject(new Error('Collection cancelled.')); }
    signal.addEventListener('abort', abort, { once: true });
  });
}
function safeError(error) { return error?.message?.slice(0, 240) || 'Collection failed.'; }
