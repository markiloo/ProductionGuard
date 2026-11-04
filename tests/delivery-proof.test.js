import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('manual deliveries store an incoming proof and allow replacing it', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'po-checker-delivery-proof-'));
  const prior = process.env.DATA_DIR;
  process.env.DATA_DIR = directory;
  let loaded;
  try {
    loaded = await import('../server/db.js?delivery-proof-test');
    const { db, isoNow, releaseInstanceLock } = loaded;
    const { createDeliveryWithProof, setDeliveryProof, getDeliveryProof, listDeliveries } = await import('../server/deliveries.js');

    const account = 'gmail:test@example.com';
    const now = isoNow();
    const proof = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    db.prepare('INSERT INTO accounts(id,display_name,email,created_at) VALUES(?,?,?,?)').run(account, '', 'test@example.com', now);
    db.prepare('INSERT INTO inventory(account_id,id,item,sku,quantity,unit,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(account, 'inv-1', 'Carton Glue', 'SKU-0001', 0, 'units', now, now);

    const delivery = createDeliveryWithProof(db, account, {
      itemSku: 'SKU-0001', quantity: 5, unit: 'units', expectedArrival: '2026-11-10', supplier: 'Supplier', notes: '',
    }, { mimeType: 'image/png', fileName: 'incoming.png', data: proof }, now);
    assert.equal(delivery.poId, null);
    assert.equal(delivery.proof.mimeType, 'image/png');
    assert.equal(delivery.proof.fileName, 'incoming.png');
    assert.deepEqual(getDeliveryProof(db, account, delivery.id).data, proof);
    assert.equal(listDeliveries(db, account)[0].proof.mimeType, 'image/png');

    const replacement = Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const updated = setDeliveryProof(db, account, delivery.id, { mimeType: 'image/jpeg', fileName: 'corrected.jpg', data: replacement }, now);
    assert.equal(updated.proof.mimeType, 'image/jpeg');
    assert.deepEqual(getDeliveryProof(db, account, delivery.id).data, replacement);

    db.prepare(`INSERT INTO incoming_deliveries(account_id,id,item_sku,quantity,unit,expected_arrival,supplier,status,received_at,po_id,notes,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(account, 'linked-1', 'SKU-0001', 2, 'units', '2026-11-11', '', 'incoming', null, 'PO-0001', '', now, now);
    assert.throws(() => setDeliveryProof(db, account, 'linked-1', { mimeType: 'image/png', fileName: 'x.png', data: proof }, now), /Linked deliveries use the PO incoming proof/);

    db.close();
    releaseInstanceLock();
  } finally {
    try { loaded?.db.close(); } catch { /* Already closed. */ }
    try { loaded?.releaseInstanceLock(); } catch { /* Already released. */ }
    if (prior === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = prior;
    try { fs.rmSync(directory, { recursive: true, force: true }); } catch { /* Cleanup after Windows releases SQLite handles. */ }
  }
});
