import { randomUUID } from 'node:crypto';

const MAX_SKU = 60;
const MAX_ITEM = 120;
const MAX_UNIT = 20;

const columns = 'id, sku, item, unit, created_at AS createdAt, updated_at AS updatedAt';

function text(value) { return String(value ?? '').trim(); }

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function hasTable(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

/** Validate an item definition create or update request. */
export function parseItemDefinitionInput(body) {
  const value = body && typeof body === 'object' ? body : {};
  const sku = text(value.sku);
  const item = text(value.item);
  const unit = text(value.unit);
  if (!sku) throw fail('Enter an item code (SKU).');
  if (sku.length > MAX_SKU) throw fail(`SKUs must be ${MAX_SKU} characters or fewer.`);
  if (!item) throw fail('Enter an item name.');
  if (item.length > MAX_ITEM) throw fail(`Item names must be ${MAX_ITEM} characters or fewer.`);
  if (!unit) throw fail('Enter a unit.');
  if (unit.length > MAX_UNIT) throw fail(`Units must be ${MAX_UNIT} characters or fewer.`);
  return { sku, item, unit };
}

/** List the connected account's defined SKUs and items. */
export function listItemDefinitions(db, accountId) {
  return db.prepare(`SELECT ${columns} FROM item_definitions WHERE account_id=? ORDER BY item COLLATE NOCASE, sku COLLATE NOCASE`).all(accountId);
}

/** Find one definition by SKU, case-insensitively. */
export function findItemDefinition(db, accountId, sku) {
  if (!hasTable(db, 'item_definitions')) return null;
  return db.prepare(`SELECT ${columns} FROM item_definitions WHERE account_id=? AND sku=? COLLATE NOCASE`).get(accountId, text(sku)) || null;
}

function getItemDefinition(db, accountId, id) {
  return db.prepare(`SELECT ${columns} FROM item_definitions WHERE account_id=? AND id=?`).get(accountId, id) || null;
}

function skuTaken(db, accountId, sku, excludeId = '') {
  return Boolean(db.prepare('SELECT 1 FROM item_definitions WHERE account_id=? AND sku=? COLLATE NOCASE AND id<>?').get(accountId, sku, excludeId));
}

/** Create one defined SKU/item pair. */
export function createItemDefinition(db, accountId, input, now) {
  if (skuTaken(db, accountId, input.sku)) throw fail('That SKU is already defined.', 409);
  const id = randomUUID();
  db.prepare('INSERT INTO item_definitions(account_id,id,sku,item,unit,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(accountId, id, input.sku, input.item, input.unit, now, now);
  return getItemDefinition(db, accountId, id);
}

/** Update an account-owned definition; the SKU stays fixed because it is the join key. */
export function updateItemDefinition(db, accountId, id, input, now) {
  const existing = getItemDefinition(db, accountId, id);
  if (!existing) return null;
  if (input.sku.toLowerCase() !== existing.sku.toLowerCase()) throw fail('The SKU cannot be changed; create a new definition instead.', 409);
  if (skuTaken(db, accountId, input.sku, id)) throw fail('That SKU is already defined.', 409);
  db.transaction(() => {
    db.prepare('UPDATE item_definitions SET item=?, unit=?, updated_at=? WHERE account_id=? AND id=?').run(input.item, input.unit, now, accountId, id);
    if (hasTable(db, 'inventory')) {
      db.prepare('UPDATE inventory SET item=?, unit=?, updated_at=? WHERE account_id=? AND sku=? COLLATE NOCASE').run(input.item, input.unit, now, accountId, existing.sku);
    }
  })();
  return getItemDefinition(db, accountId, id);
}

/** Delete a definition only when no stock, delivery, demand, or PO mapping uses it. */
export function deleteItemDefinition(db, accountId, id) {
  const existing = getItemDefinition(db, accountId, id);
  if (!existing) return false;
  const key = existing.sku;
  const references = [];
  if (hasTable(db, 'inventory') && db.prepare('SELECT 1 FROM inventory WHERE account_id=? AND sku=? COLLATE NOCASE').get(accountId, key)) references.push('inventory');
  if (hasTable(db, 'incoming_deliveries') && db.prepare('SELECT 1 FROM incoming_deliveries WHERE account_id=? AND item_sku=? COLLATE NOCASE').get(accountId, key)) references.push('deliveries');
  if (hasTable(db, 'production_requirements') && db.prepare('SELECT 1 FROM production_requirements WHERE account_id=? AND item_sku=? COLLATE NOCASE').get(accountId, key)) references.push('production demand');
  if (hasTable(db, 'production_item_requirements') && db.prepare('SELECT 1 FROM production_item_requirements WHERE account_id=? AND item_sku=? COLLATE NOCASE').get(accountId, key)) references.push('production item definitions');
  if (hasTable(db, 'emails') && db.prepare('SELECT 1 FROM emails WHERE account_id=? AND (mapped_sku=? COLLATE NOCASE OR item=? COLLATE NOCASE) AND po_state IS NOT NULL').get(accountId, key, key)) references.push('purchase orders');
  if (references.length) throw fail(`This SKU is still used by ${references.join(', ')}. Remove those references first.`, 409);
  db.prepare('DELETE FROM item_definitions WHERE account_id=? AND id=?').run(accountId, id);
  return true;
}
