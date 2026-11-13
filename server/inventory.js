import { randomUUID } from 'node:crypto';

const MAX_ITEM = 120;
const MAX_SKU = 60;
const MAX_UNIT = 20;
const MAX_SUPPLIER = 120;
const MAX_NOTES = 500;
const MAX_QUANTITY = 1_000_000_000;

const columns = 'id, item, sku, quantity, unit, supplier, reorder_level AS reorderLevel, notes, created_at AS createdAt, updated_at AS updatedAt';

function text(value) {
  return String(value ?? '').trim();
}

/** Validate and normalize an inventory create or update request. */
export function parseInventoryInput(body, { requireSku = false } = {}) {
  const value = body && typeof body === 'object' ? body : {};
  const item = text(value.item);
  const sku = text(value.sku);
  const unit = text(value.unit);
  const supplier = text(value.supplier);
  const notes = text(value.notes);
  const quantityValue = value.quantity;
  const reorderValue = value.reorderLevel;

  if (!item) throw new Error('Enter an item name.');
  if (item.length > MAX_ITEM) throw new Error(`Item names must be ${MAX_ITEM} characters or fewer.`);
  if (requireSku && !sku) throw new Error('Enter an item code (SKU); POs, deliveries, and demand join on it.');
  if (sku.length > MAX_SKU) throw new Error(`SKUs must be ${MAX_SKU} characters or fewer.`);
  if (!unit) throw new Error('Enter a unit.');
  if (unit.length > MAX_UNIT) throw new Error(`Units must be ${MAX_UNIT} characters or fewer.`);
  if (supplier.length > MAX_SUPPLIER) throw new Error(`Suppliers must be ${MAX_SUPPLIER} characters or fewer.`);
  if (notes.length > MAX_NOTES) throw new Error(`Notes must be ${MAX_NOTES} characters or fewer.`);

  if (quantityValue === '' || quantityValue === null || quantityValue === undefined) throw new Error('Enter the quantity on hand.');
  if (typeof quantityValue !== 'number' && typeof quantityValue !== 'string') throw new Error('Quantity must be a whole number of 0 or more.');
  const quantity = Number(quantityValue);
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_QUANTITY) throw new Error('Quantity must be a whole number of 0 or more.');

  let reorderLevel = null;
  if (reorderValue !== '' && reorderValue !== null && reorderValue !== undefined) {
    if (typeof reorderValue !== 'number' && typeof reorderValue !== 'string') throw new Error('Reorder level must be a whole number of 0 or more.');
    reorderLevel = Number(reorderValue);
    if (!Number.isInteger(reorderLevel) || reorderLevel < 0 || reorderLevel > MAX_QUANTITY) throw new Error('Reorder level must be a whole number of 0 or more.');
  }

  return { item, sku, unit, supplier, notes, quantity, reorderLevel };
}

/** List the connected account's inventory alphabetically. */
export function listInventory(db, accountId) {
  return db.prepare(`SELECT ${columns} FROM inventory WHERE account_id = ? ORDER BY item COLLATE NOCASE, id`).all(accountId);
}

function getInventoryItem(db, accountId, id) {
  return db.prepare(`SELECT ${columns} FROM inventory WHERE account_id = ? AND id = ?`).get(accountId, id) || null;
}

function skuTaken(db, accountId, sku, excludeId = '') {
  if (!sku) return false;
  return Boolean(db.prepare('SELECT 1 FROM inventory WHERE account_id=? AND sku=? COLLATE NOCASE AND id<>?').get(accountId, sku, excludeId));
}

function skuConflict() {
  const error = new Error('That SKU is already used by another inventory item.');
  error.status = 409;
  return error;
}

function hasTable(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

/** Create an inventory item for one account. Adding it defines the SKU, name, and unit. */
export function createInventoryItem(db, accountId, input, now) {
  if (skuTaken(db, accountId, input.sku)) throw skuConflict();
  const id = randomUUID();
  return db.transaction(() => {
  db.prepare('INSERT INTO inventory(account_id,id,item,sku,quantity,unit,supplier,reorder_level,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(
    accountId, id, input.item, input.sku, input.quantity, input.unit, input.supplier, input.reorderLevel, input.notes, now, now,
  );
  recordStockHistory(db, accountId, id, 'Item added', { quantity: 0, unit: input.unit }, input, now);
  return getInventoryItem(db, accountId, id);
  })();
}

/** Update an account-owned inventory item; returns null when the item is missing or owned by another account. */
export function updateInventoryItem(db, accountId, id, input, now) {
  return db.transaction(() => {
  const existing = getInventoryItem(db, accountId, id);
  if (!existing) return null;
  if (existing.sku && existing.sku.toLowerCase() !== input.sku.toLowerCase()) {
    const error = new Error('The SKU cannot be changed on an existing inventory item.');
    error.status = 409;
    throw error;
  }
  if (skuTaken(db, accountId, input.sku, id)) throw skuConflict();
  const result = db.prepare('UPDATE inventory SET item=?, sku=?, quantity=?, unit=?, supplier=?, reorder_level=?, notes=?, updated_at=? WHERE account_id=? AND id=?').run(
    input.item, input.sku, input.quantity, input.unit, input.supplier, input.reorderLevel, input.notes, now, accountId, id,
  );
  if (existing.quantity !== input.quantity) recordStockHistory(db, accountId, id, 'Quantity edited', existing, input, now);
  return result.changes ? getInventoryItem(db, accountId, id) : null;
  })();
}

/** Delete an account-owned inventory item only when nothing still references its SKU. */
export function deleteInventoryItem(db, accountId, id) {
  const existing = getInventoryItem(db, accountId, id);
  if (!existing) return false;
  const sku = existing.sku;
  const references = [];
  if (hasTable(db, 'production_item_requirements') && db.prepare('SELECT 1 FROM production_item_requirements WHERE account_id=? AND item_sku=? COLLATE NOCASE').get(accountId, sku)) references.push('assemblies');
  if (hasTable(db, 'production_requirements') && db.prepare('SELECT 1 FROM production_requirements WHERE account_id=? AND item_sku=? COLLATE NOCASE').get(accountId, sku)) references.push('production demand');
  if (hasTable(db, 'incoming_deliveries') && db.prepare('SELECT 1 FROM incoming_deliveries WHERE account_id=? AND item_sku=? COLLATE NOCASE').get(accountId, sku)) references.push('deliveries');
  if (hasTable(db, 'emails') && db.prepare('SELECT 1 FROM emails WHERE account_id=? AND (mapped_sku=? COLLATE NOCASE OR item=? COLLATE NOCASE) AND po_state IS NOT NULL').get(accountId, sku, sku)) references.push('purchase orders');
  if (references.length) {
    const error = new Error(`This inventory item is still used by ${references.join(', ')}. Remove those references first.`);
    error.status = 409;
    throw error;
  }
  return db.transaction(() => {
  if (hasTable(db, 'inventory_history')) db.prepare('DELETE FROM inventory_history WHERE account_id=? AND inventory_id=?').run(accountId,id);
  return db.prepare('DELETE FROM inventory WHERE account_id = ? AND id = ?').run(accountId, id).changes > 0;
  })();
}

export function recordStockHistory(db, accountId, id, kind, before, after, now, delivery = {}) {
  if (!hasTable(db, 'inventory_history')) return;
  db.prepare(`INSERT INTO inventory_history(account_id,inventory_id,kind,before_quantity,after_quantity,before_unit,unit,delivery_id,po_id,supplier,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(accountId,id,kind,before.quantity,after.quantity,before.unit,after.unit,delivery.id || null,delivery.poId || null,delivery.supplier || '',now);
}
export function inventoryHistory(db, accountId, id, limit, offset) {
  const item = getInventoryItem(db, accountId, id);
  if (!item) return null;
  const total = db.prepare('SELECT count(*) total FROM inventory_history WHERE account_id=? AND inventory_id=?').get(accountId,id).total;
  const items = db.prepare('SELECT * FROM inventory_history WHERE account_id=? AND inventory_id=? ORDER BY id DESC LIMIT ? OFFSET ?').all(accountId,id,limit,offset);
  return { item, items, total, limit, offset };
}
