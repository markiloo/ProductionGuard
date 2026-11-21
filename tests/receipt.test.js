import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('receiving uses the confirmed quantity, stores a receipt picture, and adds stock once', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'po-checker-receipt-'));
  const prior = process.env.DATA_DIR;
  process.env.DATA_DIR = directory;
  let loaded;
  try {
    loaded = await import('../server/db.js?receipt-test');
    const { db, isoNow, releaseInstanceLock } = loaded;
    const { getDeliveryReceipt, receiveDelivery, listDeliveries } = await import('../server/deliveries.js');

    const account = 'gmail:test@example.com';
    const now = isoNow();
    db.prepare('INSERT INTO accounts(id,display_name,email,created_at) VALUES(?,?,?,?)').run(account, '', 'test@example.com', now);
    db.prepare('INSERT INTO inventory(account_id,id,item,sku,quantity,unit,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(account, 'inv-1', 'Carton Glue', 'SKU-0001', 0, 'units', now, now);
    db.prepare(`INSERT INTO incoming_deliveries(account_id,id,item_sku,quantity,unit,expected_arrival,supplier,status,received_at,po_id,notes,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(account, 'del-1', 'SKU-0001', 10, 'units', '2026-11-10', 'Supplier', 'incoming', null, null, '', now, now);

    const proof = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    assert.throws(() => receiveDelivery(db, account, 'del-1', now, { quantity: 8 }), /Upload a picture of proof/);
    assert.equal(db.prepare('SELECT status FROM incoming_deliveries WHERE account_id=? AND id=?').get(account, 'del-1').status, 'incoming');
    assert.equal(db.prepare('SELECT quantity FROM inventory WHERE account_id=? AND sku=?').get(account, 'SKU-0001').quantity, 0);

    const firstBatch = { quantity: 8, requestId: 'first-batch', expectedReceived: 0, proof: { mimeType: 'image/png', fileName: 'receipt.png', data: proof } };
    const first = receiveDelivery(db, account, 'del-1', now, firstBatch);
    assert.equal(first.delivery.status, 'incoming');
    assert.equal(first.delivery.remainingQuantity, 2);
    assert.equal(first.delivery.expectedArrival, '2026-11-10');
    assert.equal(first.alreadyReceived, false);
    const event = db.prepare('SELECT * FROM inventory_history').get();
    assert.equal(event.before_quantity, 0);
    assert.equal(event.after_quantity, 8);
    assert.equal(event.kind, 'Delivery received');
    assert.equal(receiveDelivery(db, account, 'del-1', now, firstBatch).alreadyReceived, true);
    assert.throws(() => receiveDelivery(db, account, 'del-1', now, { ...firstBatch, requestId: 'stale-batch' }), /review the updated balance/i);
    assert.equal(db.prepare('SELECT count(*) n FROM inventory_history').get().n, 1);
    const { updateInventoryItem, inventoryHistory } = await import('../server/inventory.js');
    const input = { item: 'Carton Glue', sku: 'SKU-0001', quantity: 3, unit: 'units', supplier: '', reorderLevel: null, notes: '' };
    updateInventoryItem(db, account, 'inv-1', input, now);
    const history = inventoryHistory(db, account, 'inv-1', 25, 0);
    assert.equal(history.items[0].before_quantity, 8);
    assert.equal(history.items[0].after_quantity, 3);
    assert.equal(inventoryHistory(db, 'other', 'inv-1', 25, 0), null);
    updateInventoryItem(db, account, 'inv-1', input, now);
    assert.equal(inventoryHistory(db, account, 'inv-1', 25, 0).total, 2);
    updateInventoryItem(db, account, 'inv-1', { ...input, quantity: 8 }, now);
    assert.equal(first.delivery.status, 'incoming');
    assert.equal(first.delivery.receivedQuantity, 8);
    assert.equal(first.delivery.receipt.mimeType, 'image/png');
    assert.equal(first.delivery.receipt.fileName, 'receipt.png');
    assert.equal(db.prepare('SELECT quantity FROM inventory WHERE account_id=? AND sku=?').get(account, 'SKU-0001').quantity, 8);

    const secondPicture = Buffer.concat([proof, Buffer.from([1])]);
    const second = receiveDelivery(db, account, 'del-1', now, { ...firstBatch, quantity: 3, requestId: 'second-batch', expectedReceived: 8, proof: { ...firstBatch.proof, fileName: 'again.png', data: secondPicture } });
    assert.equal(second.delivery.status, 'received');
    assert.equal(second.delivery.remainingQuantity, 0);
    assert.equal(second.delivery.receivedQuantity, 11);
    assert.equal(db.prepare('SELECT quantity FROM inventory WHERE account_id=? AND sku=?').get(account, 'SKU-0001').quantity, 11);
    assert.equal(db.prepare('SELECT count(*) n FROM delivery_receipts WHERE account_id=? AND delivery_id=?').get(account, 'del-1').n, 2);
    assert.deepEqual(getDeliveryReceipt(db, account, 'del-1', 'first-batch').data, proof);
    assert.deepEqual(getDeliveryReceipt(db, account, 'del-1').data, secondPicture);
    assert.equal(getDeliveryReceipt(db, 'other-account', 'del-1', 'first-batch'), undefined);
    assert.equal(receiveDelivery(db, account, 'del-1', now, firstBatch).receipt.id, 'first-batch');

    const listed = listDeliveries(db, account)[0];
    assert.equal(listed.receivedQuantity, 11);
    assert.deepEqual(listed.receipts.map(({ quantity, fileName }) => [quantity, fileName]), [[8, 'receipt.png'], [3, 'again.png']]);
    assert.equal(listed.receipt.mimeType, 'image/png');

    db.close();
    releaseInstanceLock();
  } finally {
    try { loaded?.db.close(); } catch { /* Already closed. */ }
    try { loaded?.releaseInstanceLock(); } catch { /* Already released. */ }
    if (prior === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = prior;
    try { fs.rmSync(directory, { recursive: true, force: true }); } catch { /* Cleanup after Windows releases SQLite handles. */ }
  }
});
