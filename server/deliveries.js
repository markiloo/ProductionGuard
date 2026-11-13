import { recordStockHistory } from './inventory.js';
import { randomUUID } from 'node:crypto';
import { isValidDate } from './time.js';

const MAX_QUANTITY = 1_000_000_000;
const MAX_SUPPLIER = 120;
const MAX_NOTES = 500;

const columns = `d.id, d.item_sku AS itemSku, d.quantity, d.received_quantity AS receivedQuantity, d.unit, d.expected_arrival AS expectedArrival, d.supplier,
  d.status, d.received_at AS receivedAt, d.po_id AS poId, d.notes, d.created_at AS createdAt, d.updated_at AS updatedAt,
  p.mime_type AS proofMimeType, p.file_name AS proofFileName, p.created_at AS proofCreatedAt,
  dp.mime_type AS deliveryProofMimeType, dp.file_name AS deliveryProofFileName, dp.created_at AS deliveryProofCreatedAt,
  r.mime_type AS receiptMimeType, r.file_name AS receiptFileName, r.created_at AS receiptCreatedAt`;

const from = `FROM incoming_deliveries d
  LEFT JOIN po_proofs p ON p.account_id = d.account_id AND p.po_id = d.po_id
  LEFT JOIN delivery_proofs dp ON dp.account_id = d.account_id AND dp.delivery_id = d.id
  LEFT JOIN delivery_receipts r ON r.account_id = d.account_id AND r.delivery_id = d.id`;

function mapDelivery(row) {
  if (!row) return null;
  const {
    proofMimeType, proofFileName, proofCreatedAt,
    deliveryProofMimeType, deliveryProofFileName, deliveryProofCreatedAt,
    receiptMimeType, receiptFileName, receiptCreatedAt,
    ...delivery
  } = row;
  const proof = proofMimeType
    ? { mimeType: proofMimeType, fileName: proofFileName, createdAt: proofCreatedAt }
    : deliveryProofMimeType
      ? { mimeType: deliveryProofMimeType, fileName: deliveryProofFileName, createdAt: deliveryProofCreatedAt }
      : null;
  return {
    ...delivery,
    proof,
    receipt: receiptMimeType ? { mimeType: receiptMimeType, fileName: receiptFileName, createdAt: receiptCreatedAt } : null,
  };
}

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
  return db.prepare(`SELECT ${columns} ${from} WHERE d.account_id=?
    ORDER BY CASE d.status WHEN 'incoming' THEN 0 ELSE 1 END, d.expected_arrival, d.id`).all(accountId).map(mapDelivery);
}

function getDelivery(db, accountId, id) {
  return mapDelivery(db.prepare(`SELECT ${columns} ${from} WHERE d.account_id=? AND d.id=?`).get(accountId, id));
}

/** Create one account-scoped incoming delivery. */
export function createDelivery(db, accountId, input, now) {
  const id = randomUUID();
  db.prepare(`INSERT INTO incoming_deliveries(account_id,id,item_sku,quantity,unit,expected_arrival,supplier,status,received_at,po_id,notes,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(accountId, id, input.itemSku, input.quantity, input.unit, input.expectedArrival, input.supplier, 'incoming', null, null, input.notes, now, now);
  return getDelivery(db, accountId, id);
}

/** Update an unreceived delivery; received deliveries stay immutable. */
export function updateDelivery(db, accountId, id, input, now, correctionNote = '') {
  const existing = getDelivery(db, accountId, id);
  if (!existing) return null;
  if (existing.status === 'received') throw fail('Received deliveries cannot be edited. Correct stock through inventory instead.', 409);
  if (existing.poId && input.itemSku.toLowerCase() !== existing.itemSku.toLowerCase()) throw fail('A delivery linked to an ordered PO must keep its item SKU.', 409);
  const note = String(correctionNote || '').trim();
  const dateChanged = input.expectedArrival !== existing.expectedArrival;
  if (dateChanged && existing.poId && !note) throw fail('Enter a note for the delivery date change.');
  if (note.length > 500) throw fail('The correction note must be 500 characters or fewer.');
  return db.transaction(() => {
    db.prepare(`UPDATE incoming_deliveries SET item_sku=?, quantity=?, unit=?, expected_arrival=?, supplier=?, notes=?, updated_at=?
      WHERE account_id=? AND id=?`).run(input.itemSku, input.quantity, input.unit, input.expectedArrival, input.supplier, input.notes, now, accountId, id);
    if (existing.poId) {
      db.prepare('UPDATE emails SET expected_arrival=?, quantity=?, unit=?, supplier=? WHERE account_id=? AND po_id=?').run(
        input.expectedArrival, input.quantity, input.unit, input.supplier, accountId, existing.poId,
      );
      if (dateChanged) {
        db.prepare('INSERT INTO po_events(account_id,id,po_id,type,reason,created_at) VALUES(?,?,?,?,?,?)').run(
          accountId, randomUUID(), existing.poId, 'corrected',
          `Delivery date changed from ${existing.expectedArrival} to ${input.expectedArrival} — ${note}`, now,
        );
      }
    }
    return getDelivery(db, accountId, id);
  })();
}

/** Create one manual delivery together with its incoming proof picture. */
export function createDeliveryWithProof(db, accountId, input, proof, now) {
  if (!proof?.data?.length) throw fail('Upload a picture of proof that the delivery is incoming.');
  return db.transaction(() => {
    const delivery = createDelivery(db, accountId, input, now);
    db.prepare('INSERT INTO delivery_proofs(account_id,delivery_id,mime_type,file_name,data,created_at) VALUES(?,?,?,?,?,?)')
      .run(accountId, delivery.id, proof.mimeType || 'image/jpeg', proof.fileName || '', proof.data, now);
    return getDelivery(db, accountId, delivery.id);
  })();
}

/** Replace the incoming proof picture for a manual delivery. */
export function setDeliveryProof(db, accountId, deliveryId, proof, now) {
  if (!proof?.data?.length) throw fail('Upload a picture of proof that the delivery is incoming.');
  const delivery = getDelivery(db, accountId, deliveryId);
  if (!delivery) return null;
  if (delivery.poId) throw fail('Linked deliveries use the PO incoming proof.', 409);
  db.prepare(`INSERT INTO delivery_proofs(account_id,delivery_id,mime_type,file_name,data,created_at) VALUES(?,?,?,?,?,?)
    ON CONFLICT(account_id,delivery_id) DO UPDATE SET mime_type=excluded.mime_type, file_name=excluded.file_name, data=excluded.data, created_at=excluded.created_at`)
    .run(accountId, deliveryId, proof.mimeType || 'image/jpeg', proof.fileName || '', proof.data, now);
  return getDelivery(db, accountId, deliveryId);
}

/** Read the incoming proof bytes for a delivery, falling back to its linked PO proof. */
export function getDeliveryProof(db, accountId, deliveryId) {
  const delivery = getDelivery(db, accountId, deliveryId);
  if (!delivery) return null;
  const row = db.prepare('SELECT mime_type, data FROM delivery_proofs WHERE account_id=? AND delivery_id=?').get(accountId, deliveryId);
  if (row) return row;
  if (delivery.poId) return db.prepare('SELECT mime_type, data FROM po_proofs WHERE account_id=? AND po_id=?').get(accountId, delivery.poId) || null;
  return null;
}

/** Receive a delivery exactly once with the confirmed quantity and a receipt picture. */
export function receiveDelivery(db, accountId, id, now, { quantity, proof } = {}) {
  return db.transaction(() => {
    const delivery = getDelivery(db, accountId, id);
    if (!delivery) return null;
    if (delivery.status === 'received') return { delivery, alreadyReceived: true };
    const receivedQuantity = quantity == null ? delivery.quantity : Number(quantity);
    if (!Number.isInteger(receivedQuantity) || receivedQuantity <= 0 || receivedQuantity > MAX_QUANTITY) throw fail('Received quantity must be a whole number greater than 0.');
    if (!proof?.data?.length) throw fail('Upload a picture of proof that the delivery was received.');
    const inventory = db.prepare('SELECT id, quantity, unit FROM inventory WHERE account_id=? AND sku=? COLLATE NOCASE').get(accountId, delivery.itemSku);
    if (!inventory) throw fail('The mapped inventory item no longer exists.', 409);
    if (String(inventory.unit).toLowerCase() !== String(delivery.unit).toLowerCase()) throw fail(`Unit must match inventory (${inventory.unit}) before receiving.`, 409);
    db.prepare('UPDATE incoming_deliveries SET status=\'received\', received_at=?, received_quantity=?, updated_at=? WHERE account_id=? AND id=?').run(now, receivedQuantity, now, accountId, id);
    recordStockHistory(db, accountId, inventory.id, 'Delivery received', inventory, { quantity: inventory.quantity + receivedQuantity, unit: inventory.unit }, now, delivery);
    db.prepare('UPDATE inventory SET quantity=quantity+?, updated_at=? WHERE account_id=? AND id=?').run(receivedQuantity, now, accountId, inventory.id);
    db.prepare(`INSERT INTO delivery_receipts(account_id,delivery_id,mime_type,file_name,data,created_at) VALUES(?,?,?,?,?,?)
      ON CONFLICT(account_id,delivery_id) DO UPDATE SET mime_type=excluded.mime_type, file_name=excluded.file_name, data=excluded.data, created_at=excluded.created_at`)
      .run(accountId, id, proof.mimeType || 'image/jpeg', proof.fileName || '', proof.data, now);
    return { delivery: getDelivery(db, accountId, id), alreadyReceived: false };
  })();
}

/** Fetch one account-scoped delivery. */
export function getDeliveryRecord(db, accountId, id) {
  return getDelivery(db, accountId, id);
}
