import { randomUUID } from 'node:crypto';

const MAX_NAME = 120;
const MAX_UNIT = 20;
const MAX_NOTES = 500;
const MAX_QUANTITY = 1_000_000_000;

const columns = 'id, name, unit, notes, created_at AS createdAt, updated_at AS updatedAt';

function text(value) { return String(value ?? '').trim(); }

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function hasTable(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

function hasColumn(db, table, column) {
  if (!hasTable(db, table)) return false;
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

function parseRequirement(value, index) {
  const row = value && typeof value === 'object' ? value : {};
  const itemSku = text(row.itemSku ?? row.sku);
  const unit = text(row.unit);
  const quantity = Number(row.quantity);
  if (!itemSku) throw fail(`Requirement ${index + 1}: choose an item SKU.`);
  if (itemSku.length > MAX_NAME) throw fail(`Requirement ${index + 1}: SKUs must be ${MAX_NAME} characters or fewer.`);
  if (!unit) throw fail(`Requirement ${index + 1}: enter a unit.`);
  if (unit.length > MAX_UNIT) throw fail(`Requirement ${index + 1}: units must be ${MAX_UNIT} characters or fewer.`);
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) throw fail(`Requirement ${index + 1}: quantity must be a whole number greater than 0.`);
  return { itemSku, quantity, unit };
}

/** Validate a production item definition request and its material requirements. */
export function parseProductionItemInput(body) {
  const value = body && typeof body === 'object' ? body : {};
  const name = text(value.name);
  const unit = text(value.unit);
  const notes = text(value.notes);
  if (!name) throw fail('Enter the item to produce.');
  if (name.length > MAX_NAME) throw fail(`Item names must be ${MAX_NAME} characters or fewer.`);
  if (!unit) throw fail('Enter a unit.');
  if (unit.length > MAX_UNIT) throw fail(`Units must be ${MAX_UNIT} characters or fewer.`);
  if (notes.length > MAX_NOTES) throw fail(`Notes must be ${MAX_NOTES} characters or fewer.`);
  const requirements = Array.isArray(value.requirements) ? value.requirements.map(parseRequirement) : [];
  return { name, unit, notes, requirements };
}

function requirementsFor(db, accountId) {
  if (!hasTable(db, 'production_item_requirements')) return [];
  return db.prepare(`SELECT id, production_item_id AS productionItemId, item_sku AS itemSku, quantity, unit
    FROM production_item_requirements WHERE account_id=? ORDER BY item_sku COLLATE NOCASE`).all(accountId);
}

function validateMaterials(db, accountId, requirements) {
  if (!requirements.length) return;
  if (hasTable(db, 'item_definitions')) {
    for (const requirement of requirements) {
      const defined = db.prepare('SELECT sku, unit FROM item_definitions WHERE account_id=? AND sku=? COLLATE NOCASE').get(accountId, requirement.itemSku);
      if (!defined) throw fail(`Define the SKU ${requirement.itemSku} in Item definition first.`);
      if (String(defined.unit).toLowerCase() !== String(requirement.unit).toLowerCase()) throw fail(`Unit must match the definition for ${defined.sku} (${defined.unit}).`);
    }
  }
}

/** List production items and their material requirements. */
export function listProductionItems(db, accountId) {
  const items = db.prepare(`SELECT ${columns} FROM production_items WHERE account_id=? ORDER BY name COLLATE NOCASE`).all(accountId);
  const byItem = new Map();
  for (const requirement of requirementsFor(db, accountId)) {
    if (!byItem.has(requirement.productionItemId)) byItem.set(requirement.productionItemId, []);
    byItem.get(requirement.productionItemId).push(requirement);
  }
  return items.map((item) => ({ ...item, requirements: byItem.get(item.id) || [] }));
}

/** Fetch one production item definition by ID. */
export function getProductionItem(db, accountId, id) {
  if (!hasTable(db, 'production_items')) return null;
  const item = db.prepare(`SELECT ${columns} FROM production_items WHERE account_id=? AND id=?`).get(accountId, id);
  if (!item) return null;
  return { ...item, requirements: requirementsFor(db, accountId).filter((requirement) => requirement.productionItemId === id) };
}

function saveRequirements(db, accountId, productionItemId, requirements, now) {
  if (!hasTable(db, 'production_item_requirements')) return;
  db.prepare('DELETE FROM production_item_requirements WHERE account_id=? AND production_item_id=?').run(accountId, productionItemId);
  const insert = db.prepare('INSERT INTO production_item_requirements(account_id,id,production_item_id,item_sku,quantity,unit,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)');
  for (const requirement of requirements) insert.run(accountId, randomUUID(), productionItemId, requirement.itemSku, requirement.quantity, requirement.unit, now, now);
}

/** Create a production item and its material requirements. */
export function createProductionItem(db, accountId, input, now) {
  const taken = db.prepare('SELECT 1 FROM production_items WHERE account_id=? AND name=? COLLATE NOCASE').get(accountId, input.name);
  if (taken) throw fail('That production item is already defined.', 409);
  validateMaterials(db, accountId, input.requirements);
  const id = randomUUID();
  return db.transaction(() => {
    db.prepare('INSERT INTO production_items(account_id,id,name,unit,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(accountId, id, input.name, input.unit, input.notes, now, now);
    saveRequirements(db, accountId, id, input.requirements, now);
    return getProductionItem(db, accountId, id);
  })();
}

/** Update a production item and replace its material requirements. */
export function updateProductionItem(db, accountId, id, input, now) {
  if (!getProductionItem(db, accountId, id)) return null;
  const taken = db.prepare('SELECT 1 FROM production_items WHERE account_id=? AND name=? COLLATE NOCASE AND id<>?').get(accountId, input.name, id);
  if (taken) throw fail('That production item is already defined.', 409);
  validateMaterials(db, accountId, input.requirements);
  return db.transaction(() => {
    db.prepare('UPDATE production_items SET name=?, unit=?, notes=?, updated_at=? WHERE account_id=? AND id=?').run(input.name, input.unit, input.notes, now, accountId, id);
    saveRequirements(db, accountId, id, input.requirements, now);
    return getProductionItem(db, accountId, id);
  })();
}

/** Delete a production item when no production run references it. */
export function deleteProductionItem(db, accountId, id) {
  if (!getProductionItem(db, accountId, id)) return false;
  if (hasColumn(db, 'production_runs', 'production_item_id') && db.prepare('SELECT 1 FROM production_runs WHERE account_id=? AND production_item_id=?').get(accountId, id)) {
    throw fail('This production item is used by a production run. Remove or reassign those runs first.', 409);
  }
  db.prepare('DELETE FROM production_items WHERE account_id=? AND id=?').run(accountId, id);
  return true;
}
