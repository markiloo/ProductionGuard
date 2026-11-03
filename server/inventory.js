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
export function parseInventoryInput(body) {
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

/** Create an inventory item for one account. */
export function createInventoryItem(db, accountId, input, now) {
  const id = randomUUID();
  db.prepare('INSERT INTO inventory(account_id,id,item,sku,quantity,unit,supplier,reorder_level,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(
    accountId, id, input.item, input.sku, input.quantity, input.unit, input.supplier, input.reorderLevel, input.notes, now, now,
  );
  return getInventoryItem(db, accountId, id);
}

/** Update an account-owned inventory item; returns null when the item is missing or owned by another account. */
export function updateInventoryItem(db, accountId, id, input, now) {
  const result = db.prepare('UPDATE inventory SET item=?, sku=?, quantity=?, unit=?, supplier=?, reorder_level=?, notes=?, updated_at=? WHERE account_id=? AND id=?').run(
    input.item, input.sku, input.quantity, input.unit, input.supplier, input.reorderLevel, input.notes, now, accountId, id,
  );
  return result.changes ? getInventoryItem(db, accountId, id) : null;
}
