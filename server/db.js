import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { isPoSubject, parsePo } from './po.js';

const dataDir = process.env.DATA_DIR || path.resolve('data');
fs.mkdirSync(dataDir, { recursive: true });
export const db = new Database(path.join(dataDir, 'po-checker.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
const lockPath = path.join(dataDir, 'app.lock');
let lockFd;
try { lockFd = fs.openSync(lockPath, 'wx'); }
catch (error) {
  if (error.code !== 'EEXIST') throw error;
  let pid = 0;
  try { pid = Number(fs.readFileSync(lockPath, 'utf8')); } catch { /* Treat unreadable lock as stale. */ }
  let running = false;
  if (Number.isInteger(pid) && pid > 0) { try { process.kill(pid, 0); running = true; } catch (probeError) { running = probeError.code === 'EPERM'; } }
  if (running) throw new Error('Another PO Checker server is already using this data directory.');
  fs.rmSync(lockPath, { force: true });
  lockFd = fs.openSync(lockPath, 'wx');
}
fs.writeSync(lockFd, String(process.pid));
export function releaseInstanceLock() {
  try { fs.closeSync(lockFd); } catch { /* Already closed. */ }
  try { fs.unlinkSync(lockPath); } catch { /* Process may already have removed it. */ }
}

/** Apply ordered schema migrations exactly once. */
export function migrate() {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`);
  const done = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version));
  const migrations = [
    `CREATE TABLE accounts (id TEXT PRIMARY KEY, display_name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
     CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
     CREATE TABLE senders (account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, address TEXT NOT NULL, normalized_address TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(account_id, normalized_address));
     CREATE TABLE runs (id TEXT PRIMARY KEY, account_id TEXT REFERENCES accounts(id), cutoff TEXT NOT NULL, started_at TEXT NOT NULL, last_success_at TEXT, error TEXT, status TEXT NOT NULL);
     CREATE TABLE emails (account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, message_id TEXT NOT NULL, run_id TEXT NOT NULL REFERENCES runs(id), sender_address TEXT NOT NULL, sender_name TEXT NOT NULL DEFAULT '', recipients TEXT NOT NULL DEFAULT '[]', subject TEXT NOT NULL DEFAULT '', received_at TEXT NOT NULL, preview TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', has_attachments INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(account_id, message_id));
     CREATE INDEX emails_received ON emails(account_id, received_at DESC);
     CREATE INDEX emails_run ON emails(account_id, run_id);`,
    `CREATE TABLE account_clears (account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE, cleared_at TEXT NOT NULL);`,
    `ALTER TABLE emails ADD COLUMN item TEXT;
     ALTER TABLE emails ADD COLUMN quantity INTEGER;
     ALTER TABLE emails ADD COLUMN unit TEXT;
     ALTER TABLE emails ADD COLUMN eta TEXT;
     ALTER TABLE emails ADD COLUMN po_status TEXT;
     ALTER TABLE emails ADD COLUMN po_error TEXT;`,
    `ALTER TABLE emails ADD COLUMN supplier TEXT;`,
  ];
  for (let i = 0; i < migrations.length; i += 1) {
    const version = i + 1;
    if (!done.has(version)) db.transaction(() => {
      db.exec(migrations[i]);
      if (version === 3) {
        const update = db.prepare('UPDATE emails SET item=?,quantity=?,unit=?,eta=?,po_status=?,po_error=? WHERE account_id=? AND message_id=?');
        for (const row of db.prepare('SELECT account_id,message_id,subject,body FROM emails').all()) if (isPoSubject(row.subject)) {
          const po = parsePo(row.body);
          update.run(po.item, po.quantity, po.unit, po.eta, po.poStatus, po.poError, row.account_id, row.message_id);
        }
      }
      if (version === 4) {
        const update = db.prepare('UPDATE emails SET item=?,quantity=?,unit=?,eta=?,supplier=?,po_status=?,po_error=? WHERE account_id=? AND message_id=?');
        for (const row of db.prepare('SELECT account_id,message_id,subject,body FROM emails').all()) if (isPoSubject(row.subject)) {
          const po = parsePo(row.body);
          update.run(po.item, po.quantity, po.unit, po.eta, po.supplier, po.poStatus, po.poError, row.account_id, row.message_id);
        }
      }
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(version, new Date().toISOString());
    })();
  }
}

migrate();

export const isoNow = () => new Date().toISOString();
