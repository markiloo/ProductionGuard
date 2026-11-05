import { randomUUID } from 'node:crypto';
import { getProductionItem } from './production-items.js';

const MAX_RUN_NUMBER = 40;
const MAX_ITEM = 120;
const MAX_UNIT = 20;
const MAX_NOTES = 500;
const MAX_QUANTITY = 1_000_000_000;
const STATUSES = new Set(['scheduled', 'in_progress', 'completed', 'on_hold']);
const REQUIREMENT_STATUSES = new Set(['outstanding', 'completed']);

const columns = 'completed_quantity AS completedQuantity, id, run_number AS runNumber, item, quantity, unit, status, scheduled_date AS scheduledDate, notes, production_item_id AS productionItemId, created_at AS createdAt, updated_at AS updatedAt';

function text(value) {
  return String(value ?? '').trim();
}

function conflict(message) {
  const error = new Error(message);
  error.status = 409;
  return error;
}

function hasTable(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

function parseRequirementRow(value, index) {
  const row = value && typeof value === 'object' ? value : {};
  const itemSku = text(row.itemSku ?? row.sku);
  const unit = text(row.unit);
  const status = text(row.status).toLowerCase() || 'outstanding';
  const quantity = Number(row.quantity);
  if (!itemSku) throw new Error(`Requirement ${index + 1}: choose an inventory SKU.`);
  if (itemSku.length > MAX_ITEM) throw new Error(`Requirement ${index + 1}: SKUs must be ${MAX_ITEM} characters or fewer.`);
  if (!unit) throw new Error(`Requirement ${index + 1}: enter a unit.`);
  if (unit.length > MAX_UNIT) throw new Error(`Requirement ${index + 1}: units must be ${MAX_UNIT} characters or fewer.`);
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) throw new Error(`Requirement ${index + 1}: quantity must be a whole number greater than 0.`);
  if (!REQUIREMENT_STATUSES.has(status)) throw new Error(`Requirement ${index + 1}: choose a valid demand status.`);
  return { itemSku, quantity, unit, status };
}

/** Validate and normalize a production run create or update request. */
export function parseProductionInput(body) {
  const value = body && typeof body === 'object' ? body : {};
  const runNumber = text(value.runNumber);
  const status = text(value.status).toLowerCase().replace(/\s+/g, '_') || 'scheduled';
  const scheduledDate = text(value.scheduledDate);
  const notes = text(value.notes);
  const requirementInputs = Array.isArray(value.requirements) ? value.requirements.map(parseRequirementRow) : null;
  const productionItemId = text(value.productionItemId);
  let item = text(value.item);
  let unit = text(value.unit);
  let quantityValue = value.quantity;
  if (requirementInputs?.length) {
    if (!item) item = requirementInputs[0].itemSku;
    if (!unit) unit = requirementInputs[0].unit;
    if (quantityValue === '' || quantityValue === null || quantityValue === undefined) quantityValue = requirementInputs[0].quantity;
  }

  if (!runNumber) throw new Error('Enter a run number.');
  if (runNumber.length > MAX_RUN_NUMBER) throw new Error(`Run numbers must be ${MAX_RUN_NUMBER} characters or fewer.`);
  if (!item && !productionItemId) throw new Error('Enter an item name.');
  if (item.length > MAX_ITEM) throw new Error(`Item names must be ${MAX_ITEM} characters or fewer.`);
  if (!unit && !productionItemId) throw new Error('Enter a unit.');
  if (unit.length > MAX_UNIT) throw new Error(`Units must be ${MAX_UNIT} characters or fewer.`);
  if (!STATUSES.has(status)) throw new Error('Choose a valid production status.');
  if (notes.length > MAX_NOTES) throw new Error(`Notes must be ${MAX_NOTES} characters or fewer.`);

  if (!scheduledDate) throw new Error('Choose a scheduled date.');
  const parsedDate = new Date(`${scheduledDate}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== scheduledDate) {
    throw new Error('Choose a valid scheduled date.');
  }

  if (quantityValue === '' || quantityValue === null || quantityValue === undefined) {
    if (productionItemId) quantityValue = 1;
    else throw new Error('Enter the production quantity.');
  }
  if (typeof quantityValue !== 'number' && typeof quantityValue !== 'string') throw new Error('Quantity must be a whole number greater than 0.');
  const quantity = Number(quantityValue);
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) throw new Error('Quantity must be a whole number greater than 0.');

  const result = { runNumber, item, quantity, unit, status, scheduledDate, notes };
  if (productionItemId) result.productionItemId = productionItemId;
  const requirements = requirementInputs?.length ? requirementInputs : [{ itemSku: item, quantity, unit, status: status === 'completed' ? 'completed' : 'outstanding' }];
  if (requirementInputs?.length) result.requirements = requirements;
  Object.defineProperty(result, 'effectiveRequirements', { value: requirements, enumerable: false });
  return result;
}

function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function resolveProductionItem(db, accountId, input, previousRequirements = []) {
  if (!input.productionItemId) return { ...input, effectiveRequirements: input.effectiveRequirements || [], productionItemId: null };
  const productionItem = getProductionItem(db, accountId, input.productionItemId);
  if (!productionItem) {
    throw invalid('Choose a defined assembly from Assemblies.');
  }
  const previous = new Map(previousRequirements.map((requirement) => [requirement.itemSku.toLowerCase(), requirement]));
  const requirements = productionItem.requirements.map((requirement) => {
    const scaled = requirement.quantity * input.quantity;
    if (!Number.isSafeInteger(scaled) || scaled <= 0 || scaled > MAX_QUANTITY) {
      throw invalid(`Requirement quantity for ${requirement.itemSku} is too large.`);
    }
    const prior = previous.get(requirement.itemSku.toLowerCase());
    return {
      itemSku: requirement.itemSku,
      quantity: scaled,
      unit: requirement.unit,
      status: prior && prior.quantity === scaled ? prior.status : 'outstanding',
    };
  });
  return { ...input, item: productionItem.name, unit: productionItem.unit, effectiveRequirements: requirements, productionItemId: productionItem.id };
}

function validateRequirements(db, accountId, requirements) {
  if (!requirements.length) return;
  if (!hasTable(db, 'inventory')) return;
  for (const requirement of requirements) {
    const inventory = db.prepare('SELECT sku, unit FROM inventory WHERE account_id=? AND sku=? COLLATE NOCASE').get(accountId, requirement.itemSku);
    if (!inventory) throw invalid(`Add the SKU ${requirement.itemSku} to Inventory first.`);
    if (String(inventory.unit).toLowerCase() !== String(requirement.unit).toLowerCase()) throw invalid(`Unit must match inventory for ${inventory.sku} (${inventory.unit}).`);
  }
}

function requirementsFor(db, accountId) {
  if (!hasTable(db, 'production_requirements')) return [];
  return db.prepare(`SELECT id, run_id AS runId, item_sku AS itemSku, quantity, unit, status, created_at AS createdAt, updated_at AS updatedAt
    FROM production_requirements WHERE account_id=? ORDER BY created_at, itemSku`).all(accountId);
}

/** List the connected account's production runs with their requirement rows. */
export function listProductionRuns(db, accountId) {
  const runs = db.prepare(`SELECT ${columns} FROM production_runs WHERE account_id = ?
    ORDER BY CASE status WHEN 'in_progress' THEN 0 WHEN 'scheduled' THEN 1 WHEN 'on_hold' THEN 2 ELSE 3 END,
      scheduled_date ASC, run_number COLLATE NOCASE`).all(accountId);
  const byRun = new Map();
  for (const requirement of requirementsFor(db, accountId)) {
    if (!byRun.has(requirement.runId)) byRun.set(requirement.runId, []);
    byRun.get(requirement.runId).push(requirement);
  }
  return runs.map((run) => ({ ...run, requirements: byRun.get(run.id) || [] }));
}

function getProductionRun(db, accountId, id) {
  const run = db.prepare(`SELECT ${columns} FROM production_runs WHERE account_id = ? AND id = ?`).get(accountId, id);
  if (!run) return null;
  return { ...run, requirements: requirementsFor(db, accountId).filter((requirement) => requirement.runId === id) };
}

function runNumberTaken(db, accountId, runNumber, excludeId = '') {
  return Boolean(db.prepare('SELECT 1 FROM production_runs WHERE account_id = ? AND run_number = ? COLLATE NOCASE AND id <> ?').get(accountId, runNumber, excludeId));
}

function saveRequirements(db, accountId, runId, requirements, now) {
  if (!hasTable(db, 'production_requirements')) return;
  db.prepare('DELETE FROM production_requirements WHERE account_id=? AND run_id=?').run(accountId, runId);
  const insert = db.prepare('INSERT INTO production_requirements(account_id,id,run_id,item_sku,quantity,unit,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)');
  for (const requirement of requirements) insert.run(accountId, randomUUID(), runId, requirement.itemSku, requirement.quantity, requirement.unit, requirement.status, now, now);
}

/** Create a production run and its requirement rows for one account. */
export function createProductionRun(db, accountId, input, now) {
  if (runNumberTaken(db, accountId, input.runNumber)) throw conflict('That run number is already in use.');
  const resolved = resolveProductionItem(db, accountId, input);
  validateRequirements(db, accountId, resolved.effectiveRequirements || []);
  const id = randomUUID();
  return db.transaction(() => {
    db.prepare('INSERT INTO production_runs(account_id,id,run_number,item,quantity,unit,status,scheduled_date,notes,production_item_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(
      accountId, id, resolved.runNumber, resolved.item, resolved.quantity, resolved.unit, resolved.status, resolved.scheduledDate, resolved.notes, resolved.productionItemId, now, now,
    );
    saveRequirements(db, accountId, id, resolved.effectiveRequirements || [], now);
    return getProductionRun(db, accountId, id);
  })();
}

/** Update an account-owned production run and replace its requirement rows. */
export function updateProductionRun(db, accountId, id, input, now) {
  if (runNumberTaken(db, accountId, input.runNumber, id)) throw conflict('That run number is already in use.');
  const existing = getProductionRun(db, accountId, id);
  if (!existing) return null;
  if (input.quantity < existing.completedQuantity) throw invalid('Planned quantity cannot be less than completed units.');
  const resolved = resolveProductionItem(db, accountId, input, existing.requirements || []);
  validateRequirements(db, accountId, resolved.effectiveRequirements || []);
  return db.transaction(() => {
    const result = db.prepare('UPDATE production_runs SET run_number=?, item=?, quantity=?, unit=?, status=?, scheduled_date=?, notes=?, production_item_id=?, updated_at=? WHERE account_id=? AND id=?').run(
      resolved.runNumber, resolved.item, resolved.quantity, resolved.unit, resolved.status, resolved.scheduledDate, resolved.notes, resolved.productionItemId, now, accountId, id,
    );
    if (!result.changes) return null;
    saveRequirements(db, accountId, id, resolved.effectiveRequirements || [], now);
    return getProductionRun(db, accountId, id);
  })();
}

/** Delete an account-owned production run and its requirement rows. */
export function deleteProductionRun(db, accountId, id) {
  return db.prepare('DELETE FROM production_runs WHERE account_id = ? AND id = ?').run(accountId, id).changes > 0;
}

/** Suggest the next sequential PR-#### run number for one account. */
export function nextProductionRunNumber(db, accountId) {
  let maximum = 0;
  for (const row of db.prepare('SELECT run_number FROM production_runs WHERE account_id = ?').all(accountId)) {
    const match = /^PR-(\d+)$/i.exec(row.run_number);
    if (match) maximum = Math.max(maximum, Number(match[1]));
  }
  return `PR-${String(maximum + 1).padStart(4, '0')}`;
}

/** Today's scheduled work plus every in-progress run, scoped to the account. */
export function listActiveProductionRuns(db, accountId, today) {
  return listProductionRuns(db, accountId).filter((run) =>
    run.status === 'in_progress' || (run.status === 'scheduled' && run.scheduledDate === today));
}

/** Record floor progress; reaching the planned quantity completes the run automatically. */
export function updateProductionProgress(db, accountId, id, input, now) {
  const existing = getProductionRun(db, accountId, id);
  if (!existing) return null;
  const completed = input?.completedQuantity;
  if (typeof completed !== 'number' || !Number.isInteger(completed) || completed < 0 || completed > existing.quantity) {
    throw invalid('Completed units must be a whole number between 0 and the planned quantity.');
  }
  const status = completed === existing.quantity ? 'completed' : existing.status;
  db.prepare('UPDATE production_runs SET completed_quantity=?, status=?, updated_at=? WHERE account_id=? AND id=?')
    .run(completed, status, now, accountId, id);
  return getProductionRun(db, accountId, id);
}
