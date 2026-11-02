import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, isoNow, releaseInstanceLock } from './db.js';
import { configureAuth, authState, beginSignIn, cancelSignIn, signOut } from './auth.js';
import { beginCollector, stopCollector, collectionState, startupCutoff, collect } from './collector.js';
import { normalizeSender, isValidSender, isValidClientId } from './rules.js';
import { parsePagination, listEmails, getEmail } from './email-queries.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

const clientSetting = db.prepare("SELECT value FROM settings WHERE key = 'client_id'").get()?.value || '';
let authError = null;
const authReady = clientSetting ? configureAuth(clientSetting).catch((error) => { authError = `Secure token cache unavailable: ${error.message}`; }) : configureAuth('');

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

app.get('/api/status', (_req, res) => {
  const state = authState();
  const account = state.account;
  const senders = account ? db.prepare('SELECT address FROM senders WHERE account_id = ? ORDER BY normalized_address').all(account.id).map((row) => row.address) : [];
  const total = account ? db.prepare('SELECT COUNT(*) AS count FROM emails WHERE account_id = ?').get(account.id).count : 0;
  res.json({ auth: { ...state, error: authError }, collection: collectionState(), senders, totalCount: total });
});
app.post('/api/setup', async (req, res) => {
  const clientId = String(req.body?.clientId || '').trim();
  if (!isValidClientId(clientId)) return res.status(400).json({ error: 'Enter a valid Microsoft application client ID.' });
  const savedClientId = db.prepare("SELECT value FROM settings WHERE key = 'client_id'").get()?.value || '';
  if (authState().connected && clientId !== savedClientId) return res.status(409).json({ error: 'Sign out before changing the Microsoft application client ID.' });
  if (clientId === savedClientId) return res.json({ ok: true });
  try { await configureAuth(clientId); }
  catch (error) { authError = `Secure token cache unavailable: ${error.message}`; return res.status(503).json({ error: authError }); }
  db.prepare("INSERT INTO settings(key,value) VALUES('client_id',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(clientId);
  authError = null;
  res.json({ ok: true });
});
app.post('/api/sign-in', (req, res) => {
  if (!authState().configured) return res.status(400).json({ error: 'Save a Microsoft application client ID first.' });
  if (authState().signingIn) return res.status(409).json({ error: 'Sign-in is already in progress.' });
  globalThis.signInCode = null;
  globalThis.signInError = null;
  res.json({ started: true });
  const previousAccount = authState().account?.id || null;
  beginSignIn((code) => { globalThis.signInCode = code; }, (error) => {
    globalThis.signInError = error?.message === 'Sign-in was cancelled.' ? null : error?.message || null;
    if (!error) {
      if (previousAccount && previousAccount !== authState().account?.id) stopCollector();
      syncAccount();
      beginCollector();
    }
  }).catch((error) => { globalThis.signInError = error.message || 'Unable to start Microsoft sign-in.'; });
});
app.get('/api/sign-in', (_req, res) => res.json({ code: globalThis.signInCode || null, error: globalThis.signInError || null, auth: authState() }));
app.post('/api/sign-in/cancel', (_req, res) => { cancelSignIn(); globalThis.signInCode = null; res.json({ ok: true }); });
app.post('/api/sign-out', async (_req, res) => { stopCollector(); await signOut(); globalThis.signInCode = null; globalThis.signInError = null; res.json({ ok: true }); });
app.post('/api/senders', (req, res) => {
  const address = String(req.body?.address || '').trim();
  const normalized = normalizeSender(address);
  if (!isValidSender(address)) return res.status(400).json({ error: 'Enter a valid email address.' });
  const aid = accountId(); if (!aid) return res.status(401).json({ error: 'Connect your Microsoft account first.' });
  try { db.prepare('INSERT INTO senders(account_id,address,normalized_address,created_at) VALUES(?,?,?,?)').run(aid, address, normalized, isoNow()); }
  catch { return res.status(409).json({ error: 'That sender is already on the list.' }); }
  collect({ rerunIfActive: true }).catch(() => {}); res.json({ ok: true });
});
app.delete('/api/senders/:address', (req, res) => {
  if (!accountId()) return res.status(401).json({ error: 'Connect your Microsoft account first.' });
  db.prepare('DELETE FROM senders WHERE account_id = ? AND normalized_address = ?').run(accountId(), req.params.address.toLowerCase());
  res.json({ ok: true });
});
app.get('/api/emails', (req, res) => {
  const aid = accountId(); if (!aid) return res.status(401).json({ error: 'Connect your Microsoft account first.' });
  const { limit, offset } = parsePagination(req.query.limit, req.query.offset);
  const query = String(req.query.q || '').trim().slice(0, 200);
  const scope = req.query.scope === 'all' ? 'all' : 'current';
  res.json(listEmails(db, { accountId: aid, cutoff: startupCutoff, scope, query, limit, offset }));
});
app.get('/api/emails/:id', (req, res) => {
  const row = getEmail(db, accountId(), req.params.id);
  if (!row) return res.status(404).json({ error: 'Message not found.' });
  res.json(row);
});

const dist = path.resolve(__dirname, '../dist');
app.use(express.static(dist));
app.get('*path', (_req, res, next) => res.sendFile(path.join(dist, 'index.html'), (error) => { if (error) next(); }));
app.use((error, _req, res, _next) => {
  const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
  console.error(JSON.stringify({ level: 'error', event: 'request_failed', status, message: String(error?.message || 'unknown error').slice(0, 200) }));
  res.status(status).json({ error: status === 400 ? 'Invalid request.' : 'Unexpected server error.' });
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
