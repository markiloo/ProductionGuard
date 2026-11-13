import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { isPoSubject, parseEtaDays, parsePo } from './po.js';
import { copyItemDefinitionsToInventory } from './item-migration.js';

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
    `CREATE TABLE inventory (
       account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
       id TEXT NOT NULL,
       item TEXT NOT NULL CHECK (length(trim(item)) > 0),
       sku TEXT NOT NULL DEFAULT '',
       quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
       unit TEXT NOT NULL DEFAULT 'units' CHECK (length(trim(unit)) > 0),
       supplier TEXT NOT NULL DEFAULT '',
       reorder_level INTEGER CHECK (reorder_level IS NULL OR reorder_level >= 0),
       notes TEXT NOT NULL DEFAULT '',
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       PRIMARY KEY(account_id, id)
     );
     CREATE INDEX inventory_item ON inventory(account_id, item COLLATE NOCASE);`,
    `CREATE TABLE production_runs (
       account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
       id TEXT NOT NULL,
       run_number TEXT NOT NULL CHECK (length(trim(run_number)) > 0),
       item TEXT NOT NULL CHECK (length(trim(item)) > 0),
       quantity INTEGER NOT NULL CHECK (quantity > 0),
       unit TEXT NOT NULL CHECK (length(trim(unit)) > 0),
       status TEXT NOT NULL CHECK (status IN ('scheduled', 'in_progress', 'completed', 'on_hold')),
       scheduled_date TEXT NOT NULL,
       notes TEXT NOT NULL DEFAULT '',
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       PRIMARY KEY(account_id, id)
     );
     CREATE UNIQUE INDEX production_runs_number ON production_runs(account_id, run_number COLLATE NOCASE);
     CREATE INDEX production_runs_date ON production_runs(account_id, scheduled_date);`,
    `ALTER TABLE emails ADD COLUMN po_id TEXT;
     ALTER TABLE emails ADD COLUMN po_state TEXT;
     ALTER TABLE emails ADD COLUMN mapped_sku TEXT;
     ALTER TABLE emails ADD COLUMN eta_days INTEGER;
     ALTER TABLE emails ADD COLUMN expected_arrival TEXT;
     ALTER TABLE emails ADD COLUMN ordered_at TEXT;`,
    `CREATE UNIQUE INDEX inventory_sku ON inventory(account_id, sku COLLATE NOCASE) WHERE trim(sku) <> '';`,
    `CREATE TABLE incoming_deliveries (
       account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
       id TEXT NOT NULL,
       item_sku TEXT NOT NULL CHECK (length(trim(item_sku)) > 0),
       quantity INTEGER NOT NULL CHECK (quantity > 0),
       unit TEXT NOT NULL CHECK (length(trim(unit)) > 0),
       expected_arrival TEXT NOT NULL,
       supplier TEXT NOT NULL DEFAULT '',
       status TEXT NOT NULL CHECK (status IN ('incoming', 'received')),
       received_at TEXT,
       po_id TEXT,
       notes TEXT NOT NULL DEFAULT '',
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       PRIMARY KEY(account_id, id)
     );
     CREATE UNIQUE INDEX deliveries_po ON incoming_deliveries(account_id, po_id) WHERE po_id IS NOT NULL;
     CREATE INDEX deliveries_arrival ON incoming_deliveries(account_id, expected_arrival);
     CREATE INDEX deliveries_sku ON incoming_deliveries(account_id, item_sku COLLATE NOCASE);`,
    `CREATE TABLE production_requirements (
       account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
       id TEXT NOT NULL,
       run_id TEXT NOT NULL,
       item_sku TEXT NOT NULL CHECK (length(trim(item_sku)) > 0),
       quantity INTEGER NOT NULL CHECK (quantity > 0),
       unit TEXT NOT NULL CHECK (length(trim(unit)) > 0),
       status TEXT NOT NULL CHECK (status IN ('outstanding', 'completed')),
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       PRIMARY KEY(account_id, id),
       FOREIGN KEY(account_id, run_id) REFERENCES production_runs(account_id, id) ON DELETE CASCADE
     );
     CREATE INDEX requirements_run ON production_requirements(account_id, run_id);
     CREATE INDEX requirements_sku ON production_requirements(account_id, item_sku COLLATE NOCASE);`,
    `CREATE TABLE po_events (
       account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
       id TEXT NOT NULL,
       po_id TEXT NOT NULL,
       type TEXT NOT NULL CHECK (type IN ('approved', 'rejected', 'ordered', 'resubmitted', 'corrected')),
       reason TEXT NOT NULL DEFAULT '',
       created_at TEXT NOT NULL,
       PRIMARY KEY(account_id, id)
     );
     CREATE INDEX po_events_po ON po_events(account_id, po_id, created_at);`,
    `CREATE TABLE item_definitions (
       account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
       id TEXT NOT NULL,
       sku TEXT NOT NULL CHECK (length(trim(sku)) > 0),
       item TEXT NOT NULL CHECK (length(trim(item)) > 0),
       unit TEXT NOT NULL CHECK (length(trim(unit)) > 0),
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       PRIMARY KEY(account_id, id)
     );
     CREATE UNIQUE INDEX item_definitions_sku ON item_definitions(account_id, sku COLLATE NOCASE);
     CREATE TABLE production_items (
       account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
       id TEXT NOT NULL,
       name TEXT NOT NULL CHECK (length(trim(name)) > 0),
       unit TEXT NOT NULL CHECK (length(trim(unit)) > 0),
       notes TEXT NOT NULL DEFAULT '',
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       PRIMARY KEY(account_id, id)
     );
     CREATE UNIQUE INDEX production_items_name ON production_items(account_id, name COLLATE NOCASE);
     CREATE TABLE production_item_requirements (
       account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
       id TEXT NOT NULL,
       production_item_id TEXT NOT NULL,
       item_sku TEXT NOT NULL CHECK (length(trim(item_sku)) > 0),
       quantity INTEGER NOT NULL CHECK (quantity > 0),
       unit TEXT NOT NULL CHECK (length(trim(unit)) > 0),
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       PRIMARY KEY(account_id, id),
       FOREIGN KEY(account_id, production_item_id) REFERENCES production_items(account_id, id) ON DELETE CASCADE
     );
     CREATE INDEX production_item_requirements_item ON production_item_requirements(account_id, production_item_id);
     ALTER TABLE production_runs ADD COLUMN production_item_id TEXT;`,
    `SELECT 1;`,
    `CREATE TABLE po_proofs (
       account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
       po_id TEXT NOT NULL,
       mime_type TEXT NOT NULL,
       file_name TEXT NOT NULL DEFAULT '',
       data BLOB NOT NULL,
       created_at TEXT NOT NULL,
       PRIMARY KEY(account_id, po_id)
     );`,
    `ALTER TABLE incoming_deliveries ADD COLUMN received_quantity INTEGER;
     UPDATE incoming_deliveries SET received_quantity = quantity WHERE status = 'received';
     CREATE TABLE delivery_receipts (
       account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
       delivery_id TEXT NOT NULL,
       mime_type TEXT NOT NULL,
       file_name TEXT NOT NULL DEFAULT '',
       data BLOB NOT NULL,
       created_at TEXT NOT NULL,
       PRIMARY KEY(account_id, delivery_id)
     );`,
    `CREATE TABLE delivery_proofs (
       account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
       delivery_id TEXT NOT NULL,
       mime_type TEXT NOT NULL,
       file_name TEXT NOT NULL DEFAULT '',
       data BLOB NOT NULL,
       created_at TEXT NOT NULL,
       PRIMARY KEY(account_id, delivery_id)
     );`,
    `ALTER TABLE production_runs ADD COLUMN completed_quantity INTEGER NOT NULL DEFAULT 0 CHECK (completed_quantity >= 0);`,
    `UPDATE production_runs SET status = 'completed' WHERE completed_quantity >= quantity;`,
    `ALTER TABLE emails ADD COLUMN manual INTEGER NOT NULL DEFAULT 0;`,
    `CREATE TABLE inventory_history (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL, inventory_id TEXT NOT NULL, kind TEXT NOT NULL, before_quantity INTEGER NOT NULL, after_quantity INTEGER NOT NULL, before_unit TEXT NOT NULL, unit TEXT NOT NULL, delivery_id TEXT, po_id TEXT, supplier TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
     CREATE INDEX inventory_history_item ON inventory_history(account_id, inventory_id, id DESC);
     INSERT INTO inventory_history(account_id,inventory_id,kind,before_quantity,after_quantity,before_unit,unit,created_at) SELECT account_id,id,'Starting balance',quantity,quantity,unit,unit,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM inventory;`,
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
      if (version === 7) {
        const counters = new Map();
        const rows = db.prepare('SELECT account_id,message_id,po_status,eta,item FROM emails ORDER BY account_id,received_at,message_id').all();
        const assign = db.prepare('UPDATE emails SET po_id=?, po_state=?, eta_days=?, mapped_sku=? WHERE account_id=? AND message_id=?');
        const matchSku = db.prepare('SELECT sku FROM inventory WHERE account_id=? AND sku=? COLLATE NOCASE AND trim(sku) <> \'\' ORDER BY sku LIMIT 1');
        for (const row of rows) {
          const next = (counters.get(row.account_id) || 0) + 1;
          counters.set(row.account_id, next);
          const poId = `PO-${String(next).padStart(4, '0')}`;
          const state = row.po_status == null ? null : row.po_status === 'valid' ? 'pending_review' : 'unverified';
          const mapped = row.item ? matchSku.get(row.account_id, row.item)?.sku || null : null;
          assign.run(poId, state, parseEtaDays(row.eta), mapped, row.account_id, row.message_id);
        }
        db.exec('CREATE UNIQUE INDEX emails_po_id ON emails(account_id, po_id) WHERE po_id IS NOT NULL');
      }
      if (version === 10) {
        const now = new Date().toISOString();
        const insert = db.prepare('INSERT INTO production_requirements(account_id,id,run_id,item_sku,quantity,unit,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)');
        for (const run of db.prepare('SELECT account_id,id,item,quantity,unit,status FROM production_runs').all()) {
          insert.run(run.account_id, `legacy-${run.id}`, run.id, run.item, run.quantity, run.unit, run.status === 'completed' ? 'completed' : 'outstanding', now, now);
        }
      }
      if (version === 12) {
        const now = new Date().toISOString();
        const insert = db.prepare('INSERT OR IGNORE INTO item_definitions(account_id,id,sku,item,unit,created_at,updated_at) VALUES(?,?,?,?,?,?,?)');
        const add = (accountId, sku, item, unit) => {
          if (!String(sku || '').trim()) return;
          insert.run(accountId, `seed-${accountId}-${String(sku).toLowerCase()}`, String(sku).trim(), String(item || sku).trim() || String(sku).trim(), String(unit || 'units').trim() || 'units', now, now);
        };
        for (const row of db.prepare("SELECT account_id,sku,item,unit FROM inventory WHERE trim(sku) <> '' ORDER BY item").all()) add(row.account_id, row.sku, row.item, row.unit);
        for (const row of db.prepare('SELECT account_id,item_sku,unit FROM production_requirements').all()) add(row.account_id, row.item_sku, row.item_sku, row.unit);
        for (const row of db.prepare('SELECT account_id,item_sku,unit FROM incoming_deliveries').all()) add(row.account_id, row.item_sku, row.item_sku, row.unit);
        for (const row of db.prepare('SELECT account_id,mapped_sku,unit FROM emails WHERE mapped_sku IS NOT NULL').all()) add(row.account_id, row.mapped_sku, row.mapped_sku, row.unit);
      }
      if (version === 13) {
        copyItemDefinitionsToInventory(db);
        db.exec('DROP TABLE item_definitions');
      }
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(version, new Date().toISOString());
    })();
  }
}

migrate();

export const isoNow = () => new Date().toISOString();
