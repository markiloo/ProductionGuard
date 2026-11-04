import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('ordering an approved PO requires and stores an incoming proof picture', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'po-checker-order-'));
  const prior = process.env.DATA_DIR;
  process.env.DATA_DIR = directory;
  let loaded;
  try {
    loaded = await import('../server/db.js?order-test');
    const { db, isoNow, releaseInstanceLock } = loaded;
    const { getPo, transitionPo, setPoProof, schedulePo } = await import('../server/pos.js');
    const { listDeliveries, updateDelivery, parseDeliveryInput } = await import('../server/deliveries.js');

    const account = 'gmail:test@example.com';
    const today = '2026-11-04';
    const now = isoNow();
    db.prepare('INSERT INTO accounts(id,display_name,email,created_at) VALUES(?,?,?,?)').run(account, '', 'test@example.com', now);
    db.prepare('INSERT INTO runs(id,account_id,cutoff,started_at,last_success_at,error,status) VALUES(?,?,?,?,?,?,?)').run('run-1', account, today, now, now, null, 'running');
    db.prepare('INSERT INTO senders(account_id,address,normalized_address,created_at) VALUES(?,?,?,?)').run(account, 'orders@example.com', 'orders@example.com', now);
    db.prepare('INSERT INTO inventory(account_id,id,item,sku,quantity,unit,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(account, 'inv-1', 'Carton Glue', 'SKU-0001', 0, 'units', now, now);
    const body = 'ITEM: Carton Glue\nQUANTITY: 10\nUNIT: units\nETA: 5 days\nSUPPLIER: Supplier';
    db.prepare(`INSERT INTO emails(account_id,message_id,run_id,sender_address,sender_name,recipients,subject,received_at,preview,body,has_attachments,item,quantity,unit,eta,supplier,po_status,po_error,po_id,po_state,mapped_sku,eta_days)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      account, 'msg-1', 'run-1', 'orders@example.com', '', '[]', 'PO', `${today}T01:00:00.000Z`, body, body, 0,
      'Carton Glue', 10, 'units', '5 days', 'Supplier', 'valid', null, 'PO-0001', 'pending_review', 'SKU-0001', 5,
    );

    transitionPo(db, account, 'PO-0001', 'approve', { today, now });
    const revisedEta = schedulePo(db, account, 'PO-0001', { etaDays: 8, note: 'Supplier delay' }, { today, now });
    assert.equal(revisedEta.etaDays, 8);
    assert.equal(revisedEta.eta, '8 days');
    assert.ok(revisedEta.events.some((event) => /ETA changed from 5 days to 8 days/.test(event.reason) && /Supplier delay/.test(event.reason)));

    assert.throws(
      () => transitionPo(db, account, 'PO-0001', 'order', { today, now }),
      (failure) => failure.status === 400 && /Upload a picture of proof/.test(failure.message),
    );

    const proof = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const ordered = transitionPo(db, account, 'PO-0001', 'order', { today, now, proof: { mimeType: 'image/png', fileName: 'proof.png', data: proof } });
    assert.equal(ordered.state, 'ordered');
    assert.equal(ordered.delivery.status, 'incoming');
    assert.equal(ordered.proof.mimeType, 'image/png');
    assert.equal(ordered.proof.fileName, 'proof.png');
    assert.ok(ordered.proof.createdAt);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM po_proofs WHERE account_id=? AND po_id=?').get(account, 'PO-0001').count, 1);
    assert.deepEqual(db.prepare('SELECT data FROM po_proofs WHERE account_id=? AND po_id=?').get(account, 'PO-0001').data, proof);

    db.prepare('INSERT INTO production_runs(account_id,id,run_number,item,quantity,unit,status,scheduled_date,notes,production_item_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(account, 'prod-run-1', 'PR-0001', 'Assembled Unit', 1, 'units', 'scheduled', '2026-11-13', '', null, now, now);
    db.prepare('INSERT INTO production_requirements(account_id,id,run_id,item_sku,quantity,unit,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(account, 'prod-req-1', 'prod-run-1', 'SKU-0001', 10, 'units', 'outstanding', now, now);
    const orderedAssessment = getPo(db, account, 'PO-0001', today).assessment;
    assert.equal(orderedAssessment.decision, 'Recommended', 'the ordered PO own delivery is counted once');
    assert.equal(orderedAssessment.requirement, 10);
    assert.equal(orderedAssessment.difference, 0);
    assert.deepEqual(orderedAssessment.balances.map((entry) => [entry.date, entry.before, entry.after]), [
      ['2026-11-12', 0, 10],
      ['2026-11-13', -10, 0],
    ]);

    const deliveries = listDeliveries(db, account);
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].poId, 'PO-0001');
    assert.equal(deliveries[0].proof.mimeType, 'image/png');
    assert.equal(deliveries[0].proof.fileName, 'proof.png');

    const revisedDate = schedulePo(db, account, 'PO-0001', { expectedArrival: '2026-11-20', note: 'Port delay' }, { today, now });
    assert.equal(revisedDate.expectedArrival, '2026-11-20');
    assert.equal(revisedDate.delivery.expectedArrival, '2026-11-20');
    assert.ok(revisedDate.events.some((event) => /Delivery date changed from .* to 2026-11-20/.test(event.reason) && /Port delay/.test(event.reason)));

    const deliveryInput = parseDeliveryInput(db, account, { itemSku: 'SKU-0001', quantity: 10, unit: 'units', expectedArrival: '2026-11-22', supplier: 'Supplier', notes: '' });
    assert.throws(() => updateDelivery(db, account, deliveries[0].id, deliveryInput, now), /Enter a note for the delivery date change/);
    const deliveryUpdated = updateDelivery(db, account, deliveries[0].id, deliveryInput, now, 'Carrier delay');
    assert.equal(deliveryUpdated.expectedArrival, '2026-11-22');
    assert.equal(getPo(db, account, 'PO-0001', today).expectedArrival, '2026-11-22');
    assert.ok(getPo(db, account, 'PO-0001', today).events.some((event) => /Delivery date changed from 2026-11-20 to 2026-11-22/.test(event.reason) && /Carrier delay/.test(event.reason)));

    const corrected = Buffer.from([0xff, 0xd8, 0xff, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const updated = setPoProof(db, account, 'PO-0001', { mimeType: 'image/jpeg', fileName: 'corrected.jpg', data: corrected }, now);
    assert.equal(updated.mimeType, 'image/jpeg');
    assert.equal(updated.fileName, 'corrected.jpg');
    assert.equal(getPo(db, account, 'PO-0001', today).proof.mimeType, 'image/jpeg');
    assert.equal(getPo(db, account, 'PO-0001', today).state, 'ordered');
    assert.deepEqual(db.prepare('SELECT data FROM po_proofs WHERE account_id=? AND po_id=?').get(account, 'PO-0001').data, corrected);

    db.prepare('DELETE FROM emails WHERE account_id=? AND po_id=?').run(account, 'PO-0001');
    const afterClear = setPoProof(db, account, 'PO-0001', { mimeType: 'image/png', fileName: 'after-clear.png', data: proof }, now);
    assert.equal(afterClear.fileName, 'after-clear.png', 'a linked delivery can keep its proof correctable after saved orders are cleared');

    db.close();
    releaseInstanceLock();
  } finally {
    try { loaded?.db.close(); } catch { /* Already closed. */ }
    try { loaded?.releaseInstanceLock(); } catch { /* Already released. */ }
    if (prior === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = prior;
    try { fs.rmSync(directory, { recursive: true, force: true }); } catch { /* Cleanup after Windows releases SQLite handles. */ }
  }
});
