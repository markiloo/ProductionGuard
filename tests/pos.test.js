import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('PO correction maps an inventory SKU and reruns assessment', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'po-checker-pos-'));
  const prior = process.env.DATA_DIR;
  process.env.DATA_DIR = directory;
  let loaded;
  try {
    loaded = await import('../server/db.js?pos-test');
    const { db, isoNow, releaseInstanceLock } = loaded;
    const { getPo, correctPo } = await import('../server/pos.js');
    const { createProductionItem, parseProductionItemInput } = await import('../server/production-items.js');
    const { createProductionRun, parseProductionInput } = await import('../server/production.js');
    const { createInventoryItem, parseInventoryInput } = await import('../server/inventory.js');

    const account = 'gmail:test@example.com';
    const today = '2026-11-03';
    const now = isoNow();
    db.prepare('INSERT INTO accounts(id,display_name,email,created_at) VALUES(?,?,?,?)').run(account, '', 'test@example.com', now);
    db.prepare('INSERT INTO runs(id,account_id,cutoff,started_at,last_success_at,error,status) VALUES(?,?,?,?,?,?,?)').run('run-1', account, today, now, now, null, 'running');
    db.prepare('INSERT INTO senders(account_id,address,normalized_address,created_at) VALUES(?,?,?,?)').run(account, 'orders@example.com', 'orders@example.com', now);

    createInventoryItem(db, account, parseInventoryInput({ item: 'Carton Glue', sku: 'SKU-0001', quantity: 0, unit: 'units' }), now);
    const productionItem = createProductionItem(db, account, parseProductionItemInput({
      name: 'Carton Packaging', sku: 'ASM-CARTON', unit: 'units',
      requirements: [{ itemSku: 'SKU-0001', quantity: 2, unit: 'units' }],
    }), now);
    assert.equal(productionItem.stock, 0, 'a new assembly starts with zero finished-good stock');
    createProductionRun(db, account, parseProductionInput({
      runNumber: 'PR-0001', productionItemId: productionItem.id, quantity: 2,
      status: 'scheduled', scheduledDate: '2026-11-10',
      requirements: [{ itemSku: 'SKU-0001', quantity: 999, unit: 'units' }],
    }), now);
    assert.equal(db.prepare('SELECT quantity FROM production_requirements WHERE account_id=?').get(account).quantity, 4, 'template quantity 2 is scaled by planned quantity 2 and client-supplied requirements are ignored');

    const body = 'ITEM: Carton Glue\nQUANTITY: 50\nUNIT: units\nETA: 5 days\nSUPPLIER: Supplier';
    db.prepare(`INSERT INTO emails(account_id,message_id,run_id,sender_address,sender_name,recipients,subject,received_at,preview,body,has_attachments,item,quantity,unit,eta,supplier,po_status,po_error,po_id,po_state,mapped_sku,eta_days)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      account, 'msg-1', 'run-1', 'orders@example.com', '', '[]', 'PO', `${today}T01:00:00.000Z`, body, body, 0,
      'Carton Glue', 50, 'units', '5 days', 'Supplier', 'valid', null, 'PO-0001', 'pending_review', null, 5,
    );

    const unmapped = getPo(db, account, 'PO-0001', today);
    assert.equal(unmapped.sku, null);
    assert.equal(unmapped.assessment.decision, 'Manual Review Required — Unmapped Item');

    const unknown = correctPo(db, account, 'PO-0001', { mappedSku: 'MISSING-SKU' }, { today, now });
    assert.match(unknown.poError, /Choose an existing inventory SKU/);
    assert.equal(unknown.assessment.decision, 'Manual Review Required — Invalid PO');

    const mapped = correctPo(db, account, 'PO-0001', { mappedSku: 'SKU-0001' }, { today, now });
    assert.equal(mapped.poError, null);
    assert.equal(mapped.sku, 'SKU-0001');
    assert.equal(mapped.mappedSku, 'SKU-0001');
    assert.equal(mapped.assessment.decision, 'Adjust Quantity');
    assert.equal(mapped.assessment.requirement, 4);
    assert.equal(mapped.assessment.difference, 46);
    assert.equal(mapped.assessment.inventory.quantity, 0);

    const mismatch = correctPo(db, account, 'PO-0001', { unit: 'kg' }, { today, now });
    assert.match(mismatch.poError, /Unit must match inventory for SKU-0001 \(units\)/);
    assert.equal(mismatch.assessment.decision, 'Manual Review Required — Invalid PO');

    const fixed = correctPo(db, account, 'PO-0001', { unit: 'units' }, { today, now });
    assert.equal(fixed.poError, null);
    assert.equal(fixed.assessment.decision, 'Adjust Quantity');

    db.close();
    releaseInstanceLock();
  } finally {
    try { loaded?.db.close(); } catch { /* Already closed. */ }
    try { loaded?.releaseInstanceLock(); } catch { /* Already released. */ }
    if (prior === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = prior;
    try { fs.rmSync(directory, { recursive: true, force: true }); } catch { /* Cleanup after Windows releases SQLite handles. */ }
  }
});
