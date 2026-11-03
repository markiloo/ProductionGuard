import { randomUUID } from 'node:crypto';
import { isValidDate } from './time.js';

const MAX_QUANTITY = 1_000_000_000;
const MAX_SUPPLIER = 120;
const MAX_NOTES = 500;

const columns = `id, item_sku AS itemSku, quantity, unit, expected_arrival AS expectedArrival, supplier,
  status, received_at AS receivedAt, po_id AS poId, notes, created_at AS createdAt, updated_at AS updatedAt`;

function text(value) { return String(value ?? '').trim(); }

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function inventoryItem(db, accountId, sku) {
  return db.prepare('SELECT id, item, sku, quantity, unit FROM inventory WHERE account_id=? AND sku=? COLLATE NOCASE AND trim(sku) <> \'\'').get(accountId, sku) || null;
}

/** Validate a manual delivery create or update request against the mapped inventory item. */
export function parseDeliveryInput(db, accountId, body) {
  const value = body && typeof body === 'object' ? body : {};
  const skuInput = text(value.itemSku ?? value.sku);
  const inventory = skuInput ? inventoryItem(db, accountId, skuInput) : null;
  const quantity = Number(value.quantity);
  const unit = text(value.unit);
  const expectedArrival = text(value.expectedArrival);
  const supplier = text(value.supplier);
  const notes = text(value.notes);
  if (!skuInput) throw fail('Choose an inventory SKU.');
  if (!inventory) throw fail('Choose an existing inventory SKU.');
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) throw fail('Quantity must be a whole number greater than 0.');
  if (!unit) throw fail('Enter a unit.');
  if (unit.toLowerCase() !== String(inventory.unit).toLowerCase()) throw fail(`Unit must match inventory (${inventory.unit}).`);
  if (!isValidDate(expectedArrival)) throw fail('Choose a valid expected arrival date.');
  if (supplier.length > MAX_SUPPLIER) throw fail(`Suppliers must be ${MAX_SUPPLIER} characters or fewer.`);
  if (notes.length > MAX_NOTES) throw fail(`Notes must be ${MAX_NOTES} characters or fewer.`);
  return { itemSku: inventory.sku, quantity, unit: inventory.unit, expectedArrival, supplier, notes };
}

/** List the connected account's incoming deliveries, unreceived first. */
export function listDeliveries(db, accountId) {
  return db.prepare(`SELECT ${columns} FROM incoming_deliveries WHERE account_id=?
    ORDER BY CASE status WHEN 'incoming' THEN 0 ELSE 1 END, expected_arrival, id`).all(accountId);
}

function getDelivery(db, accountId, id) {
  return db.prepare(`SELECT ${columns} FROM incoming_deliveries WHERE account_id=? AND id=?`).get(accountId, id) || null;
}

/** Create one account-scoped incoming delivery. */
export function createDelivery(db, accountId, input, now) {
  const id = randomUUID();
  db.prepare(`INSERT INTO incoming_deliveries(account_id,id,item_sku,quantity,unit,expected_arrival,supplier,status,received_at,po_id,notes,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(accountId, id, input.itemSku, input.quantity, input.unit, input.expectedArrival, input.supplier, 'incoming', null, null, input.notes, now, now);
  return getDelivery(db, accountId, id);
}

/** Update an unreceived delivery; received deliveries stay immutable. */
export function updateDelivery(db, accountId, id, input, now) {
  const existing = getDelivery(db, accountId, id);
  if (!existing) return null;
  if (existing.status === 'received') throw fail('Received deliveries cannot be edited. Correct stock through inventory instead.', 409);
  db.prepare(`UPDATE incoming_deliveries SET item_sku=?, quantity=?, unit=?, expected_arrival=?, supplier=?, notes=?, updated_at=?
    WHERE account_id=? AND id=?`).run(input.itemSku, input.quantity, input.unit, input.expectedArrival, input.supplier, input.notes, now, accountId, id);
  if (existing.poId) {
    db.prepare('UPDATE emails SET expected_arrival=? WHERE account_id=? AND po_id=?').run(input.expectedArrival, accountId, existing.poId);
  }
  return getDelivery(db, accountId, id);
}

/** Receive a delivery exactly once, adding its quantity to on-hand stock in the same transaction. */
export function receiveDelivery(db, accountId, id, now) {
  return db.transaction(() => {
    const delivery = getDelivery(db, accountId, id);
    if (!delivery) return null;
    if (delivery.status === 'received') return { delivery, alreadyReceived: true };
    const inventory = db.prepare('SELECT id, quantity FROM inventory WHERE account_id=? AND sku=? COLLATE NOCASE').get(accountId, delivery.itemSku);
    if (!inventory) throw fail('The mapped inventory item no longer exists.', 409);
    db.prepare('UPDATE incoming_deliveries SET status=\'received\', received_at=?, updated_at=? WHERE account_id=? AND id=?').run(now, now, accountId, id);
    db.prepare('UPDATE inventory SET quantity=quantity+?, updated_at=? WHERE account_id=? AND id=?').run(delivery.quantity, now, accountId, inventory.id);
    return { delivery: getDelivery(db, accountId, id), alreadyReceived: false };
  })();
}

/** Fetch one account-scoped delivery. */
export function getDeliveryRecord(db, accountId, id) {
  return getDelivery(db, accountId, id);
}
