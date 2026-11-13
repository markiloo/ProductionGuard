import { randomUUID } from 'node:crypto';
import { deleteInventoryItem, recordStockHistory } from './inventory.js';

const MAX_NAME = 120;
const MAX_SKU = 60;
const MAX_UNIT = 20;
const MAX_NOTES = 500;
const MAX_QUANTITY = 1_000_000_000;

const columns = `p.id, p.name, p.unit, p.notes, p.sku, p.inventory_id AS inventoryId,
  i.quantity AS stock, p.created_at AS createdAt, p.updated_at AS updatedAt`;
const from = `FROM production_items p
  LEFT JOIN inventory i ON i.account_id = p.account_id AND i.id = p.inventory_id`;

function text(value) { return String(value ?? '').trim(); }

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function hasTable(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
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

/** Validate an assembly definition request, its finished-good SKU, and its materials. */
export function parseProductionItemInput(body, { requireSku = true } = {}) {
  const value = body && typeof body === 'object' ? body : {};
  const name = text(value.name);
  const sku = text(value.sku);
  const unit = text(value.unit);
  const notes = text(value.notes);
  if (!name) throw fail('Enter the assembly name.');
  if (name.length > MAX_NAME) throw fail(`Assembly names must be ${MAX_NAME} characters or fewer.`);
  if (requireSku && !sku) throw fail('Enter the finished-good item code (SKU) for this assembly.');
  if (sku.length > MAX_SKU) throw fail(`SKUs must be ${MAX_SKU} characters or fewer.`);
  if (!unit) throw fail('Enter a unit.');
  if (unit.length > MAX_UNIT) throw fail(`Units must be ${MAX_UNIT} characters or fewer.`);
  if (notes.length > MAX_NOTES) throw fail(`Notes must be ${MAX_NOTES} characters or fewer.`);
  const requirements = Array.isArray(value.requirements) ? value.requirements.map(parseRequirement) : [];
  if (sku && requirements.some((requirement) => requirement.itemSku.toLowerCase() === sku.toLowerCase())) {
    throw fail('An assembly cannot use its own finished-good SKU as a material.');
  }
  return { name, sku, unit, notes, requirements };
}

function skuTaken(db, accountId, sku, excludeId = '') {
  if (!sku) return false;
  if (db.prepare('SELECT 1 FROM inventory WHERE account_id=? AND sku=? COLLATE NOCASE').get(accountId, sku)) return true;
  return Boolean(db.prepare('SELECT 1 FROM production_items WHERE account_id=? AND sku=? COLLATE NOCASE AND id<>?').get(accountId, sku, excludeId));
}

function requirementsFor(db, accountId) {
  if (!hasTable(db, 'production_item_requirements')) return [];
  return db.prepare(`SELECT id, production_item_id AS productionItemId, item_sku AS itemSku, quantity, unit
    FROM production_item_requirements WHERE account_id=? ORDER BY item_sku COLLATE NOCASE`).all(accountId);
}

function validateMaterials(db, accountId, requirements) {
  if (!requirements.length) return;
  if (!hasTable(db, 'inventory')) return;
  for (const requirement of requirements) {
    const inventory = db.prepare('SELECT sku, unit FROM inventory WHERE account_id=? AND sku=? COLLATE NOCASE').get(accountId, requirement.itemSku);
    if (!inventory) throw fail(`Add the SKU ${requirement.itemSku} to Inventory first.`);
    if (String(inventory.unit).toLowerCase() !== String(requirement.unit).toLowerCase()) throw fail(`Unit must match inventory for ${inventory.sku} (${inventory.unit}).`);
  }
}

/** List assemblies with their finished-good stock and material requirements. */
export function listProductionItems(db, accountId) {
  const items = db.prepare(`SELECT ${columns} ${from} WHERE p.account_id=? ORDER BY p.name COLLATE NOCASE`).all(accountId);
  const byItem = new Map();
  for (const requirement of requirementsFor(db, accountId)) {
    if (!byItem.has(requirement.productionItemId)) byItem.set(requirement.productionItemId, []);
    byItem.get(requirement.productionItemId).push(requirement);
  }
  return items.map((item) => ({ ...item, stock: item.stock ?? 0, requirements: byItem.get(item.id) || [] }));
}

/** Fetch one assembly definition by ID. */
export function getProductionItem(db, accountId, id) {
  if (!hasTable(db, 'production_items')) return null;
  const item = db.prepare(`SELECT ${columns} ${from} WHERE p.account_id=? AND p.id=?`).get(accountId, id);
  if (!item) return null;
  return { ...item, stock: item.stock ?? 0, requirements: requirementsFor(db, accountId).filter((requirement) => requirement.productionItemId === id) };
}

function saveRequirements(db, accountId, productionItemId, requirements, now) {
  if (!hasTable(db, 'production_item_requirements')) return;
  db.prepare('DELETE FROM production_item_requirements WHERE account_id=? AND production_item_id=?').run(accountId, productionItemId);
  const insert = db.prepare('INSERT INTO production_item_requirements(account_id,id,production_item_id,item_sku,quantity,unit,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)');
  for (const requirement of requirements) insert.run(accountId, randomUUID(), productionItemId, requirement.itemSku, requirement.quantity, requirement.unit, now, now);
}

/** Create an assembly, its finished-good inventory row, and its material requirements. */
export function createProductionItem(db, accountId, input, now) {
  const taken = db.prepare('SELECT 1 FROM production_items WHERE account_id=? AND name=? COLLATE NOCASE').get(accountId, input.name);
  if (taken) throw fail('That assembly is already defined.', 409);
  if (skuTaken(db, accountId, input.sku)) throw fail('That SKU is already used by another item.', 409);
  validateMaterials(db, accountId, input.requirements);
  const id = randomUUID();
  const inventoryId = randomUUID();
  return db.transaction(() => {
    db.prepare('INSERT INTO inventory(account_id,id,item,sku,quantity,unit,supplier,reorder_level,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(accountId, inventoryId, input.name, input.sku, 0, input.unit, '', null, 'Produced by assembly', now, now);
    recordStockHistory(db, accountId, inventoryId, 'Starting balance', { quantity: 0, unit: input.unit }, { quantity: 0, unit: input.unit }, now);
    db.prepare('INSERT INTO production_items(account_id,id,name,unit,notes,sku,inventory_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(accountId, id, input.name, input.unit, input.notes, input.sku, inventoryId, now, now);
    saveRequirements(db, accountId, id, input.requirements, now);
    return getProductionItem(db, accountId, id);
  })();
}

/** Update an assembly, sync its finished-good inventory row, and replace its materials. */
export function updateProductionItem(db, accountId, id, input, now) {
  const existing = getProductionItem(db, accountId, id);
  if (!existing) return null;
  const taken = db.prepare('SELECT 1 FROM production_items WHERE account_id=? AND name=? COLLATE NOCASE AND id<>?').get(accountId, input.name, id);
  if (taken) throw fail('That assembly is already defined.', 409);
  if (existing.sku && input.sku && existing.sku.toLowerCase() !== input.sku.toLowerCase()) {
    throw fail('The SKU cannot be changed on an existing assembly.', 409);
  }
  if (existing.unit.toLowerCase() !== input.unit.toLowerCase() && existing.stock > 0) {
    throw fail(`Change the unit only while ${existing.name} has zero stock in Inventory.`, 409);
  }
  if (existing.sku && input.requirements.some((requirement) => requirement.itemSku.toLowerCase() === existing.sku.toLowerCase())) {
    throw fail('An assembly cannot use its own finished-good SKU as a material.');
  }
  validateMaterials(db, accountId, input.requirements);
  return db.transaction(() => {
    db.prepare('UPDATE production_items SET name=?, unit=?, notes=?, updated_at=? WHERE account_id=? AND id=?')
      .run(input.name, input.unit, input.notes, now, accountId, id);
    if (existing.inventoryId) {
      db.prepare('UPDATE inventory SET item=?, unit=?, updated_at=? WHERE account_id=? AND id=?')
        .run(input.name, input.unit, now, accountId, existing.inventoryId);
    }
    saveRequirements(db, accountId, id, input.requirements, now);
    return getProductionItem(db, accountId, id);
  })();
}

/** Delete an assembly only when no run references it and its finished-good stock is zero. */
export function deleteProductionItem(db, accountId, id) {
  const existing = getProductionItem(db, accountId, id);
  if (!existing) return false;
  if (hasTable(db, 'production_runs') && db.prepare('SELECT 1 FROM production_runs WHERE account_id=? AND production_item_id=?').get(accountId, id)) {
    throw fail('This assembly is used by a production run. Remove or reassign those runs first.', 409);
  }
  if (existing.inventoryId && existing.stock > 0) {
    throw fail(`This assembly still has ${existing.stock} ${existing.unit} in Inventory. Reduce that stock to zero before deleting it.`, 409);
  }
  return db.transaction(() => {
    const deleted = db.prepare('DELETE FROM production_items WHERE account_id=? AND id=?').run(accountId, id).changes > 0;
    if (!deleted) return false;
    if (existing.inventoryId) deleteInventoryItem(db, accountId, existing.inventoryId);
    return true;
  })();
}
