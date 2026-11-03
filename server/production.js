import { randomUUID } from 'node:crypto';

const MAX_RUN_NUMBER = 40;
const MAX_ITEM = 120;
const MAX_UNIT = 20;
const MAX_NOTES = 500;
const MAX_QUANTITY = 1_000_000_000;
const STATUSES = new Set(['scheduled', 'in_progress', 'completed', 'on_hold']);

const columns = 'id, run_number AS runNumber, item, quantity, unit, status, scheduled_date AS scheduledDate, notes, created_at AS createdAt, updated_at AS updatedAt';

function text(value) {
  return String(value ?? '').trim();
}

function conflict(message) {
  const error = new Error(message);
  error.status = 409;
  return error;
}

/** Validate and normalize a production run create or update request. */
export function parseProductionInput(body) {
  const value = body && typeof body === 'object' ? body : {};
  const runNumber = text(value.runNumber);
  const item = text(value.item);
  const unit = text(value.unit);
  const status = text(value.status).toLowerCase().replace(/\s+/g, '_') || 'scheduled';
  const scheduledDate = text(value.scheduledDate);
  const notes = text(value.notes);
  const quantityValue = value.quantity;

  if (!runNumber) throw new Error('Enter a run number.');
  if (runNumber.length > MAX_RUN_NUMBER) throw new Error(`Run numbers must be ${MAX_RUN_NUMBER} characters or fewer.`);
  if (!item) throw new Error('Enter an item name.');
  if (item.length > MAX_ITEM) throw new Error(`Item names must be ${MAX_ITEM} characters or fewer.`);
  if (!unit) throw new Error('Enter a unit.');
  if (unit.length > MAX_UNIT) throw new Error(`Units must be ${MAX_UNIT} characters or fewer.`);
  if (!STATUSES.has(status)) throw new Error('Choose a valid production status.');
  if (notes.length > MAX_NOTES) throw new Error(`Notes must be ${MAX_NOTES} characters or fewer.`);

  if (!scheduledDate) throw new Error('Choose a scheduled date.');
  const parsedDate = new Date(`${scheduledDate}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== scheduledDate) {
    throw new Error('Choose a valid scheduled date.');
  }

  if (quantityValue === '' || quantityValue === null || quantityValue === undefined) throw new Error('Enter the production quantity.');
  if (typeof quantityValue !== 'number' && typeof quantityValue !== 'string') throw new Error('Quantity must be a whole number greater than 0.');
  const quantity = Number(quantityValue);
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) throw new Error('Quantity must be a whole number greater than 0.');

  return { runNumber, item, quantity, unit, status, scheduledDate, notes };
}

/** List the connected account's production runs, active work first and then by date. */
export function listProductionRuns(db, accountId) {
  return db.prepare(`SELECT ${columns} FROM production_runs WHERE account_id = ?
    ORDER BY CASE status WHEN 'in_progress' THEN 0 WHEN 'scheduled' THEN 1 WHEN 'on_hold' THEN 2 ELSE 3 END,
      scheduled_date ASC, run_number COLLATE NOCASE`).all(accountId);
}

function getProductionRun(db, accountId, id) {
  return db.prepare(`SELECT ${columns} FROM production_runs WHERE account_id = ? AND id = ?`).get(accountId, id) || null;
}

function runNumberTaken(db, accountId, runNumber, excludeId = '') {
  return Boolean(db.prepare('SELECT 1 FROM production_runs WHERE account_id = ? AND run_number = ? COLLATE NOCASE AND id <> ?').get(accountId, runNumber, excludeId));
}

/** Create a production run for one account. */
export function createProductionRun(db, accountId, input, now) {
  if (runNumberTaken(db, accountId, input.runNumber)) throw conflict('That run number is already in use.');
  const id = randomUUID();
  db.prepare('INSERT INTO production_runs(account_id,id,run_number,item,quantity,unit,status,scheduled_date,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(
    accountId, id, input.runNumber, input.item, input.quantity, input.unit, input.status, input.scheduledDate, input.notes, now, now,
  );
  return getProductionRun(db, accountId, id);
}

/** Update an account-owned production run; returns null when the run is missing or owned by another account. */
export function updateProductionRun(db, accountId, id, input, now) {
  if (runNumberTaken(db, accountId, input.runNumber, id)) throw conflict('That run number is already in use.');
  const result = db.prepare('UPDATE production_runs SET run_number=?, item=?, quantity=?, unit=?, status=?, scheduled_date=?, notes=?, updated_at=? WHERE account_id=? AND id=?').run(
    input.runNumber, input.item, input.quantity, input.unit, input.status, input.scheduledDate, input.notes, now, accountId, id,
  );
  return result.changes ? getProductionRun(db, accountId, id) : null;
}
