import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, isoNow, releaseInstanceLock } from './db.js';
import { restoreGmail, connectGmail, authState, signOut } from './auth.js';
import { beginCollector, stopCollector, collectionState, startupCutoff, collect } from './collector.js';
import { normalizeSender, isValidSender } from './rules.js';
import { parsePagination, listEmails, getEmail, clearSavedEmails } from './email-queries.js';
import { listInventory, createInventoryItem, updateInventoryItem, deleteInventoryItem, parseInventoryInput } from './inventory.js';
import { listProductionRuns, createProductionRun, updateProductionRun, deleteProductionRun, nextProductionRunNumber, parseProductionInput } from './production.js';
import { listItemDefinitions, createItemDefinition, updateItemDefinition, deleteItemDefinition, parseItemDefinitionInput } from './item-definitions.js';
import { listProductionItems, createProductionItem, updateProductionItem, deleteProductionItem, parseProductionItemInput } from './production-items.js';
import { listPos, getPo, transitionPo, correctPo, authorizeQueuedMail } from './pos.js';
import { listDeliveries, createDelivery, updateDelivery, receiveDelivery, parseDeliveryInput } from './deliveries.js';
import { resetAccountData } from './reset.js';
import { getPlantTimeZone, plantToday, resolveTimeZone, setPlantTimeZone } from './time.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

const authReady = restoreGmail();

app.use('/api', (req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.get('origin');
    const allowedOrigins = new Set([`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`, 'http://127.0.0.1:5173', 'http://localhost:5173']);
    if (!origin || !allowedOrigins.has(origin)) return res.status(403).json({ error: 'Cross-origin requests are not allowed.' });
  }
  next();
});
const PORT = Number(process.env.PORT || 4174);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
const accountId = () => { syncAccount(); return authState().account?.id || ''; };

function readInventoryInput(body, res) {
  try {
    return parseInventoryInput(body, { requireSku: true });
  } catch (failure) {
    res.status(400).json({ error: failure.message || 'Invalid inventory item.' });
    return null;
  }
}

function readProductionInput(body, res) {
  try {
    return parseProductionInput(body);
  } catch (failure) {
    res.status(400).json({ error: failure.message || 'Invalid production run.' });
    return null;
  }
}

function sendProductionError(res, failure) {
  if (failure.status === 409) return res.status(409).json({ error: failure.message });
  if (failure.status === 400) return res.status(400).json({ error: failure.message });
  if (String(failure.code || '').startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({ error: 'That run number is already in use.' });
  return res.status(500).json({ error: 'Could not save production run.' });
}

app.get('/api/status', (_req, res) => {
  const state = authState();
  const account = state.account;
  const senders = account ? db.prepare('SELECT address FROM senders WHERE account_id = ? ORDER BY normalized_address').all(account.id).map((row) => row.address) : [];
  const total = account ? db.prepare('SELECT COUNT(*) AS count FROM emails WHERE account_id = ? AND po_status IS NOT NULL').get(account.id).count : 0;
  const counts = {};
  if (account) for (const row of db.prepare('SELECT po_state AS state, COUNT(*) AS count FROM emails WHERE account_id = ? AND po_state IS NOT NULL GROUP BY po_state').all(account.id)) counts[row.state] = row.count;
  const timeZone = getPlantTimeZone(db);
  res.json({ auth: state, collection: collectionState(), senders, totalCount: total, counts, plantTimeZone: timeZone, today: plantToday(timeZone), features: { clearSavedInbox: true } });
});
app.post('/api/setup', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const appPassword = String(req.body?.appPassword || '').replace(/\s/g, '');
  if (!isValidSender(email) || !appPassword || appPassword.length > 200) return res.status(400).json({ error: 'Enter a Gmail address and app password.' });
  try { await connectGmail(email, appPassword); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  stopCollector();
  syncAccount();
  beginCollector();
  res.json({ ok: true });
});
app.post('/api/sign-out', (_req, res) => { stopCollector(); signOut(); res.json({ ok: true }); });
app.post('/api/senders', (req, res) => {
  const address = String(req.body?.address || '').trim();
  const normalized = normalizeSender(address);
  if (!isValidSender(address)) return res.status(400).json({ error: 'Enter a valid email address.' });
  const aid = accountId(); if (!aid) return res.status(401).json({ error: 'Connect your Gmail account first.' });
  try { db.prepare('INSERT INTO senders(account_id,address,normalized_address,created_at) VALUES(?,?,?,?)').run(aid, address, normalized, isoNow()); }
  catch { return res.status(409).json({ error: 'That sender is already on the list.' }); }
  authorizeQueuedMail(db, aid, normalized);
  collect({ rerunIfActive: true }).catch(() => {}); res.json({ ok: true });
});
app.delete('/api/senders/:address', (req, res) => {
  if (!accountId()) return res.status(401).json({ error: 'Connect your Gmail account first.' });
  db.prepare('DELETE FROM senders WHERE account_id = ? AND normalized_address = ?').run(accountId(), req.params.address.toLowerCase());
  res.json({ ok: true });
});
app.get('/api/emails', (req, res) => {
  const aid = accountId(); if (!aid) return res.status(401).json({ error: 'Connect your Gmail account first.' });
  const { limit, offset } = parsePagination(req.query.limit, req.query.offset);
  const query = String(req.query.q || '').trim().slice(0, 200);
  const scope = req.query.scope === 'all' ? 'all' : 'current';
  res.json(listEmails(db, { accountId: aid, cutoff: startupCutoff, scope, query, limit, offset }));
});
app.delete('/api/emails', (_req, res) => {
  const aid = accountId(); if (!aid) return res.status(401).json({ error: 'Connect your Gmail account first.' });
  const deletedCount = clearSavedEmails(db, aid, isoNow());
  res.json({ ok: true, deletedCount });
});
app.get('/api/emails/:id', (req, res) => {
  const row = getEmail(db, accountId(), req.params.id);
  if (!row) return res.status(404).json({ error: 'Message not found.' });
  res.json(row);
});

app.get('/api/inventory', (_req, res) => {
  const aid = accountId(); if (!aid) return res.status(401).json({ error: 'Connect your Gmail account first.' });
  res.json({ items: listInventory(db, aid) });
});
app.post('/api/inventory', (req, res) => {
  const aid = accountId(); if (!aid) return res.status(401).json({ error: 'Connect your Gmail account first.' });
  const input = readInventoryInput(req.body, res); if (!input) return;
  try {
    res.status(201).json({ ok: true, item: createInventoryItem(db, aid, input, isoNow()) });
  } catch (failure) {
    res.status(failure.status || 500).json({ error: failure.message || 'Could not save inventory item.' });
  }
});
app.put('/api/inventory/:id', (req, res) => {
  const aid = accountId(); if (!aid) return res.status(401).json({ error: 'Connect your Gmail account first.' });
  const input = readInventoryInput(req.body, res); if (!input) return;
  try {
    const item = updateInventoryItem(db, aid, req.params.id, input, isoNow());
    if (!item) return res.status(404).json({ error: 'Inventory item not found.' });
    res.json({ ok: true, item });
  } catch (failure) {
    res.status(failure.status || 500).json({ error: failure.message || 'Could not save inventory item.' });
  }
});
app.delete('/api/inventory/:id', (req, res) => {
  const aid = accountId(); if (!aid) return res.status(401).json({ error: 'Connect your Gmail account first.' });
  if (!deleteInventoryItem(db, aid, req.params.id)) return res.status(404).json({ error: 'Inventory item not found.' });
  res.json({ ok: true });
});

app.get('/api/item-definitions', (_req, res) => {
  const aid = accountId(); if (!aid) return res.status(401).json({ error: 'Connect your Gmail account first.' });
  res.json({ items: listItemDefinitions(db, aid) });
});
app.post('/api/item-definitions', (req, res) => {
  const aid = accountId(); if (!aid) return res.status(401).json({ error: 'Connect your Gmail account first.' });
  try {
    const input = parseItemDefinitionInput(req.body);
    res.status(201).json({ ok: true, item: createItemDefinition(db, aid, input, isoNow()) });
  } catch (failure) {
    sendActionError(res, failure, 'Could not save the item definition.');
  }
});
app.put('/api/item-definitions/:id', (req, res) => {
  const aid = accountId(); if (!aid) return res.status(401).json({ error: 'Connect your Gmail account first.' });
  try {
    const input = parseItemDefinitionInput(req.body);
    const item = updateItemDefinition(db, aid, req.params.id, input, isoNow());
    if (!item) return res.status(404).json({ error: 'Item definition not found.' });
    res.json({ ok: true, item });
  } catch (failure) {
    sendActionError(res, failure, 'Could not save the item definition.');
  }
});
app.delete('/api/item-definitions/:id', (req, res) => {
  const aid = accountId(); if (!aid) return res.status(401).json({ error: 'Connect your Gmail account first.' });
  try {
    if (!deleteItemDefinition(db, aid, req.params.id)) return res.status(404).json({ error: 'Item definition not found.' });
    res.json({ ok: true });
  } catch (failure) {
    sendActionError(res, failure, 'Could not delete the item definition.');
  }
});

app.get('/api/production-items', (_req, res) => {
  const aid = accountId(); if (!aid) return res.status(401).json({ error: 'Connect your Gmail account first.' });
  res.json({ items: listProductionItems(db, aid) });
});
app.post('/api/production-items', (req, res) => {
  const aid = accountId(); if (!aid) return res.status(401).json({ error: 'Connect your Gmail account first.' });
  try {
    const input = parseProductionItemInput(req.body);
    res.status(201).json({ ok: true, item: createProductionItem(db, aid, input, isoNow()) });
  } catch (failure) {
    sendActionError(res, failure, 'Could not save the production item.');
  }
});
app.put('/api/production-items/:id', (req, res) => {
  const aid = accountId(); if (!aid) return res.status(401).json({ error: 'Connect your Gmail account first.' });
  try {
    const input = parseProductionItemInput(req.body);
    const item = updateProductionItem(db, aid, req.params.id, input, isoNow());
    if (!item) return res.status(404).json({ error: 'Production item not found.' });
    res.json({ ok: true, item });
  } catch (failure) {
    sendActionError(res, failure, 'Could not save the production item.');
  }
});
app.delete('/api/production-items/:id', (req, res) => {
  const aid = accountId(); if (!aid) return res.status(401).json({ error: 'Connect your Gmail account first.' });
  try {
    if (!deleteProductionItem(db, aid, req.params.id)) return res.status(404).json({ error: 'Production item not found.' });
    res.json({ ok: true });
  } catch (failure) {
    sendActionError(res, failure, 'Could not delete the production item.');
  }
});

app.get('/api/production-runs/next-number', (_req, res) => {
  const aid = accountId(); if (!aid) return res.status(401).json({ error: 'Connect your Gmail account first.' });
  res.json({ runNumber: nextProductionRunNumber(db, aid) });
});

app.get('/api/production-runs', (_req, res) => {
  const aid = accountId(); if (!aid) return res.status(401).json({ error: 'Connect your Gmail account first.' });
  res.json({ items: listProductionRuns(db, aid) });
});
app.post('/api/production-runs', (req, res) => {
  const aid = accountId(); if (!aid) return res.status(401).json({ error: 'Connect your Gmail account first.' });
  const input = readProductionInput(req.body, res); if (!input) return;
  try {
    res.status(201).json({ ok: true, item: createProductionRun(db, aid, input, isoNow()) });
  } catch (failure) {
    sendProductionError(res, failure);
  }
});
app.put('/api/production-runs/:id', (req, res) => {
  const aid = accountId(); if (!aid) return res.status(401).json({ error: 'Connect your Gmail account first.' });
  const input = readProductionInput(req.body, res); if (!input) return;
  try {
    const item = updateProductionRun(db, aid, req.params.id, input, isoNow());
    if (!item) return res.status(404).json({ error: 'Production run not found.' });
    res.json({ ok: true, item });
  } catch (failure) {
    sendProductionError(res, failure);
  }
});
app.delete('/api/production-runs/:id', (req, res) => {
  const aid = accountId(); if (!aid) return res.status(401).json({ error: 'Connect your Gmail account first.' });
  if (!deleteProductionRun(db, aid, req.params.id)) return res.status(404).json({ error: 'Production run not found.' });
  res.json({ ok: true });
});

function nowAndToday() {
  const timeZone = getPlantTimeZone(db);
  return { timeZone, today: plantToday(timeZone), now: isoNow() };
}

function sendActionError(res, failure, fallback) {
  res.status(failure.status || 500).json({ error: failure.status && failure.status < 500 ? failure.message : fallback });
}

app.get('/api/pos', (req, res) => {
  const aid = accountId(); if (!aid) return res.status(401).json({ error: 'Connect your Gmail account first.' });
  const { limit, offset } = parsePagination(req.query.limit, req.query.offset);
  const state = String(req.query.state || 'pending_review');
  const allowed = new Set(['all', 'pending_review', 'unverified', 'approved', 'ordered', 'rejected']);
  const query = String(req.query.q || '').trim().slice(0, 200);
  const sort = req.query.sort === 'asc' ? 'asc' : 'desc';
  const { today } = nowAndToday();
  res.json(listPos(db, { accountId: aid, state: allowed.has(state) ? state : 'pending_review', sort, query, limit, offset, today }));
});

app.get('/api/pos/:poId', (req, res) => {
  const aid = accountId(); if (!aid) return res.status(401).json({ error: 'Connect your Gmail account first.' });
  const { today } = nowAndToday();
  const po = getPo(db, aid, req.params.poId, today);
  if (!po) return res.status(404).json({ error: 'Purchase order not found.' });
  res.json(po);
});

app.patch('/api/pos/:poId', (req, res) => {
  const aid = accountId(); if (!aid) return res.status(401).json({ error: 'Connect your Gmail account first.' });
  const { today, now } = nowAndToday();
  try {
    const po = correctPo(db, aid, req.params.poId, req.body, { today, now });
    if (!po) return res.status(404).json({ error: 'Purchase order not found.' });
    res.json({ ok: true, po });
  } catch (failure) {
    sendActionError(res, failure, 'Could not correct the purchase order.');
  }
});

app.post('/api/pos/:poId/:action', (req, res) => {
  const aid = accountId(); if (!aid) return res.status(401).json({ error: 'Connect your Gmail account first.' });
  const action = String(req.params.action || '');
  if (!['approve', 'reject', 'order', 'resubmit'].includes(action)) return res.status(400).json({ error: 'Unknown purchase order action.' });
  const { today, now } = nowAndToday();
  try {
    const po = transitionPo(db, aid, req.params.poId, action, { reason: req.body?.reason, today, now });
    if (!po) return res.status(404).json({ error: 'Purchase order not found.' });
    res.json({ ok: true, po });
  } catch (failure) {
    sendActionError(res, failure, 'Could not update the purchase order.');
  }
});

app.get('/api/deliveries', (_req, res) => {
  const aid = accountId(); if (!aid) return res.status(401).json({ error: 'Connect your Gmail account first.' });
  res.json({ items: listDeliveries(db, aid) });
});

app.post('/api/deliveries', (req, res) => {
  const aid = accountId(); if (!aid) return res.status(401).json({ error: 'Connect your Gmail account first.' });
  try {
    const input = parseDeliveryInput(db, aid, req.body);
    res.status(201).json({ ok: true, item: createDelivery(db, aid, input, isoNow()) });
  } catch (failure) {
    sendActionError(res, failure, 'Could not add the delivery.');
  }
});

app.put('/api/deliveries/:id', (req, res) => {
  const aid = accountId(); if (!aid) return res.status(401).json({ error: 'Connect your Gmail account first.' });
  try {
    const input = parseDeliveryInput(db, aid, req.body);
    const item = updateDelivery(db, aid, req.params.id, input, isoNow());
    if (!item) return res.status(404).json({ error: 'Delivery not found.' });
    res.json({ ok: true, item });
  } catch (failure) {
    sendActionError(res, failure, 'Could not save the delivery.');
  }
});

app.post('/api/deliveries/:id/receive', (req, res) => {
  const aid = accountId(); if (!aid) return res.status(401).json({ error: 'Connect your Gmail account first.' });
  try {
    const result = receiveDelivery(db, aid, req.params.id, isoNow());
    if (!result) return res.status(404).json({ error: 'Delivery not found.' });
    res.json({ ok: true, ...result });
  } catch (failure) {
    sendActionError(res, failure, 'Could not receive the delivery.');
  }
});

app.get('/api/settings', (_req, res) => {
  const timeZone = getPlantTimeZone(db);
  res.json({ plantTimeZone: timeZone, today: plantToday(timeZone) });
});

app.put('/api/settings', (req, res) => {
  const requested = String(req.body?.plantTimeZone || '').trim();
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: requested });
  } catch {
    return res.status(400).json({ error: 'Choose a valid IANA time zone.' });
  }
  const timeZone = setPlantTimeZone(db, resolveTimeZone(requested));
  res.json({ ok: true, plantTimeZone: timeZone, today: plantToday(timeZone) });
});

app.post('/api/reset', (req, res) => {
  const aid = accountId(); if (!aid) return res.status(401).json({ error: 'Connect your Gmail account first.' });
  if (req.body?.confirm !== true) return res.status(400).json({ error: 'Confirm the reset before clearing data.' });
  res.json({ ok: true, ...resetAccountData(db, aid, isoNow()) });
});

const dist = path.resolve(__dirname, '../dist');
app.use(express.static(dist));
app.get('*path', (_req, res, next) => res.sendFile(path.join(dist, 'index.html'), (error) => { if (error) next(); }));
app.use((error, _req, res, _next) => {
  const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
  console.error(JSON.stringify({ level: 'error', event: 'request_failed', status }));
  res.status(status).json({ error: error?.message && status < 500 ? error.message : 'Unexpected server error.' });
});

function syncAccount() {
  const a = authState().account;
  if (!a) return;
  db.prepare('INSERT INTO accounts(id,display_name,email,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,email=excluded.email').run(a.id, a.name, a.username, isoNow());
  db.prepare('UPDATE runs SET account_id = ? WHERE id = ?').run(a.id, collectionState().runId);
}
const server = app.listen(PORT, '127.0.0.1', () => { console.log(JSON.stringify({ level: 'info', event: 'server_started', address: `http://127.0.0.1:${PORT}`, cutoff: startupCutoff })); authReady.then(() => { syncAccount(); if (authState().connected) beginCollector(); }); });
function shutdown() { stopCollector(); db.prepare("UPDATE runs SET status = 'stopped' WHERE id = ?").run(collectionState().runId); server.close(() => { db.close(); releaseInstanceLock(); process.exit(0); }); server.closeAllConnections(); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
