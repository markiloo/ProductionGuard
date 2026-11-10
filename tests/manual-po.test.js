import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('manual POs enter pending review and stay editable without an approved sender', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'po-checker-manual-'));
  const prior = process.env.DATA_DIR;
  process.env.DATA_DIR = directory;
  let loaded;
  try {
    loaded = await import('../server/db.js?manual-po-test');
    const { db, isoNow, releaseInstanceLock } = loaded;
    const { createManualPo, correctPo, getPo, listPos, transitionPo } = await import('../server/pos.js');

    const account = 'gmail:manual@example.com';
    const today = '2026-11-05';
    const now = isoNow();
    db.prepare('INSERT INTO accounts(id,display_name,email,created_at) VALUES(?,?,?,?)').run(account, '', 'manual@example.com', now);
    db.prepare('INSERT INTO runs(id,account_id,cutoff,started_at,last_success_at,error,status) VALUES(?,?,?,?,?,?,?)').run('run-1', account, today, now, now, null, 'running');
    db.prepare('INSERT INTO inventory(account_id,id,item,sku,quantity,unit,supplier,reorder_level,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(
      account, 'inv-1', 'Carton Glue', 'SKU-0001', 0, 'units', 'Acme', null, '', now, now,
    );

    const po = createManualPo(db, account, {
      item: 'SKU-0001', mappedSku: 'SKU-0001', quantity: 10, unit: 'units', etaDays: 5, supplier: 'Acme',
    }, { today, now, runId: 'run-1' });

    assert.equal(po.poId, 'PO-0001');
    assert.equal(po.state, 'pending_review');
    assert.equal(po.manual, true);
    assert.equal(po.sku, 'SKU-0001');
    assert.equal(po.mappedSku, 'SKU-0001');
    assert.equal(po.poStatus, 'valid');
    assert.equal(po.poError, null);
    assert.equal(po.senderAddress, '');
    assert.equal(po.senderName, 'Manual entry');
    assert.equal(po.eta, '5 days');
    assert.equal(po.etaDays, 5);
    assert.equal(po.receivedAt, now);
    assert.match(po.body, /Manually added purchase order/);
    assert.match(po.body, /ITEM: SKU-0001/);
    assert.equal(po.assessment.decision, 'Manual Review Required — No Scheduled Demand');

    const listed = listPos(db, { accountId: account, state: 'pending_review', today });
    assert.equal(listed.total, 1);
    assert.equal(listed.items[0].manual, true);
    assert.equal(listed.items[0].senderName, 'Manual entry');

    transitionPo(db, account, 'PO-0001', 'reject', { reason: 'Check the quantity', today, now });
    const corrected = correctPo(db, account, 'PO-0001', { quantity: 12 }, { today, now });
    assert.equal(corrected.state, 'rejected');
    assert.equal(corrected.poError, null);
    assert.equal(corrected.quantity, 12);

    const resubmitted = transitionPo(db, account, 'PO-0001', 'resubmit', { today, now });
    assert.equal(resubmitted.state, 'pending_review');
    assert.equal(resubmitted.quantity, 12);
    assert.equal(resubmitted.manual, true);
    assert.equal(getPo(db, account, 'PO-0001', today).state, 'pending_review');

    assert.throws(
      () => createManualPo(db, account, { item: 'SKU-0001', mappedSku: 'SKU-0001', quantity: 1, unit: 'units', etaDays: 5 }, { today, now, runId: 'run-1' }),
      /Missing supplier/,
    );
    assert.throws(
      () => createManualPo(db, account, { item: 'SKU-0001', mappedSku: 'MISSING-SKU', quantity: 1, unit: 'units', etaDays: 5, supplier: 'Acme' }, { today, now, runId: 'run-1' }),
      /Choose an existing inventory SKU/,
    );
    assert.throws(
      () => createManualPo(db, account, { item: 'SKU-0001', mappedSku: 'SKU-0001', quantity: 1, unit: 'kg', etaDays: 5, supplier: 'Acme' }, { today, now, runId: 'run-1' }),
      /Unit must match inventory for SKU-0001 \(units\)/,
    );

    // Exact T-05 scenario: two 100-unit POs due one day before 100 units of demand.
    db.prepare('DELETE FROM emails WHERE account_id=?').run(account);
    db.prepare('INSERT INTO production_runs(account_id,id,run_number,item,quantity,unit,status,scheduled_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(account, 'prod-1', 'PR-0001', 'Assembly', 1, 'units', 'scheduled', '2026-11-15', now, now);
    db.prepare('INSERT INTO production_requirements(account_id,id,run_id,item_sku,quantity,unit,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(account, 'req-1', 'prod-1', 'SKU-0001', 100, 'units', 'outstanding', now, now);
    const input = { item: 'SKU-0001', quantity: 100, unit: 'units', etaDays: 9, supplier: 'Acme' };
    const first = createManualPo(db, account, input, { today, now: '2026-11-05T01:00:00Z', runId: 'run-1' });
    const second = createManualPo(db, account, input, { today, now: '2026-11-05T02:00:00Z', runId: 'run-1' });
    assert.equal(first.assessment.decision, 'Recommended');
    const checkCovered = (provisional) => {
      const assessment = getPo(db, account, second.poId, today).assessment;
      assert.equal(assessment.requirement, 0);
      assert.equal(assessment.difference, 100);
      assert.equal(assessment.decision, 'Redundant / Overstock');
      assert.equal(assessment.coveredAmount, provisional ? 100 : 0);
      assert.equal(assessment.warnings.some(({ type }) => type === 'duplicate'), provisional);
    };
    checkCovered(true);
    transitionPo(db, account, first.poId, 'approve', { today, now });
    checkCovered(true);
    transitionPo(db, account, first.poId, 'reject', { today, now, reason: 'Duplicate purchase' });
    assert.equal(getPo(db, account, second.poId, today).assessment.decision, 'Recommended');
    transitionPo(db, account, first.poId, 'resubmit', { today, now });
    transitionPo(db, account, first.poId, 'approve', { today, now });
    transitionPo(db, account, first.poId, 'order', { today, now, proof: { mimeType: 'image/png', data: Buffer.from('test proof') } });
    checkCovered(false);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM incoming_deliveries WHERE account_id=? AND po_id=?').get(account, first.poId).count, 1);
    assert.throws(() => transitionPo(db, account, first.poId, 'order', { today, now }), /Only Approved/);
    db.close();
    releaseInstanceLock();
  } finally {
    try { loaded?.db.close(); } catch { /* Already closed. */ }
    try { loaded?.releaseInstanceLock(); } catch { /* Already released. */ }
    if (prior === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = prior;
    try { fs.rmSync(directory, { recursive: true, force: true }); } catch { /* Cleanup after Windows releases SQLite handles. */ }
  }
});
