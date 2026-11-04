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
    const { receiveDelivery, listDeliveries } = await import('../server/deliveries.js');

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

    const first = receiveDelivery(db, account, 'del-1', now, { quantity: 8, proof: { mimeType: 'image/png', fileName: 'receipt.png', data: proof } });
    assert.equal(first.alreadyReceived, false);
    assert.equal(first.delivery.status, 'received');
    assert.equal(first.delivery.receivedQuantity, 8);
    assert.equal(first.delivery.receipt.mimeType, 'image/png');
    assert.equal(first.delivery.receipt.fileName, 'receipt.png');
    assert.equal(db.prepare('SELECT quantity FROM inventory WHERE account_id=? AND sku=?').get(account, 'SKU-0001').quantity, 8);

    const second = receiveDelivery(db, account, 'del-1', now, { quantity: 20, proof: { mimeType: 'image/png', fileName: 'again.png', data: proof } });
    assert.equal(second.alreadyReceived, true);
    assert.equal(db.prepare('SELECT quantity FROM inventory WHERE account_id=? AND sku=?').get(account, 'SKU-0001').quantity, 8);
    assert.equal(db.prepare('SELECT file_name FROM delivery_receipts WHERE account_id=? AND delivery_id=?').get(account, 'del-1').file_name, 'receipt.png');

    const listed = listDeliveries(db, account)[0];
    assert.equal(listed.receivedQuantity, 8);
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
