import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('reset clears one account business data, keeps settings, and isolates other accounts', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'po-checker-reset-'));
  const prior = process.env.DATA_DIR;
  process.env.DATA_DIR = directory;
  let loaded;
  try {
    loaded = await import('../server/db.js?reset-test');
    const { db, isoNow, releaseInstanceLock } = loaded;
    const { resetAccountData } = await import('../server/reset.js');
    const { setPlantTimeZone, getPlantTimeZone } = await import('../server/time.js');

    const now = isoNow();
    db.prepare('INSERT INTO accounts(id,display_name,email,created_at) VALUES(?,?,?,?)').run('acct-a', '', 'a@example.com', now);
    db.prepare('INSERT INTO accounts(id,display_name,email,created_at) VALUES(?,?,?,?)').run('acct-b', '', 'b@example.com', now);
    db.prepare('INSERT INTO runs(id,account_id,cutoff,started_at,last_success_at,error,status) VALUES(?,?,?,?,?,?,?)').run('run-a', 'acct-a', now, now, now, null, 'running');
    db.prepare('INSERT INTO senders(account_id,address,normalized_address,created_at) VALUES(?,?,?,?)').run('acct-a', 'orders@example.com', 'orders@example.com', now);
    db.prepare('INSERT INTO senders(account_id,address,normalized_address,created_at) VALUES(?,?,?,?)').run('acct-b', 'other@example.com', 'other@example.com', now);
    db.prepare('INSERT INTO item_definitions(account_id,id,sku,item,unit,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('acct-a', 'def-a', 'SKU-A', 'Item A', 'units', now, now);
    db.prepare('INSERT INTO item_definitions(account_id,id,sku,item,unit,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('acct-b', 'def-b', 'SKU-B', 'Item B', 'units', now, now);
    db.prepare('INSERT INTO inventory(account_id,id,item,sku,quantity,unit,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('acct-a', 'inv-a', 'Item A', 'SKU-A', 10, 'units', now, now);
    db.prepare('INSERT INTO production_items(account_id,id,name,unit,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('acct-a', 'pi-a', 'Product A', 'units', '', now, now);
    db.prepare('INSERT INTO production_item_requirements(account_id,id,production_item_id,item_sku,quantity,unit,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('acct-a', 'pir-a', 'pi-a', 'SKU-A', 2, 'units', now, now);
    db.prepare('INSERT INTO production_runs(account_id,id,run_number,item,quantity,unit,status,scheduled_date,notes,production_item_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('acct-a', 'run-1', 'PR-0001', 'Product A', 2, 'units', 'scheduled', '2026-11-10', '', 'pi-a', now, now);
    db.prepare('INSERT INTO production_requirements(account_id,id,run_id,item_sku,quantity,unit,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run('acct-a', 'pr-a', 'run-1', 'SKU-A', 4, 'units', 'outstanding', now, now);
    db.prepare('INSERT INTO incoming_deliveries(account_id,id,item_sku,quantity,unit,expected_arrival,supplier,status,received_at,po_id,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('acct-a', 'del-a', 'SKU-A', 5, 'units', '2026-11-06', '', 'incoming', null, null, '', now, now);
    db.prepare('INSERT INTO emails(account_id,message_id,run_id,sender_address,received_at,subject,po_status,po_state,po_id) VALUES(?,?,?,?,?,?,?,?,?)').run('acct-a', 'msg-a', 'run-a', 'orders@example.com', now, 'PO', 'valid', 'pending_review', 'PO-0001');
    db.prepare('INSERT INTO po_events(account_id,id,po_id,type,reason,created_at) VALUES(?,?,?,?,?,?)').run('acct-a', 'event-a', 'PO-0001', 'approved', '', now);
    setPlantTimeZone(db, 'Asia/Manila');

    const result = resetAccountData(db, 'acct-a', '2026-11-04T00:00:00.000Z');
    assert.deepEqual(result, {
      events: 1, emails: 1, deliveries: 1, inventory: 1, requirements: 1, runs: 1,
      productionItemRequirements: 1, productionItems: 1, itemDefinitions: 1, senders: 1,
      clearedAt: '2026-11-04T00:00:00.000Z',
    });

    for (const table of ['emails', 'po_events', 'inventory', 'incoming_deliveries', 'production_runs', 'production_requirements', 'production_items', 'production_item_requirements', 'item_definitions', 'senders']) {
      assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE account_id=?`).get('acct-a').count, 0, `${table} is cleared for acct-a`);
    }
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM item_definitions WHERE account_id=?').get('acct-b').count, 1, 'other accounts keep their data');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM senders WHERE account_id=?').get('acct-b').count, 1, 'other accounts keep their senders');
    assert.equal(getPlantTimeZone(db), 'Asia/Manila', 'plant time zone survives the reset');
    assert.equal(db.prepare('SELECT cleared_at AS clearedAt FROM account_clears WHERE account_id=?').get('acct-a').clearedAt, '2026-11-04T00:00:00.000Z');

    db.close();
    releaseInstanceLock();
  } finally {
    try { loaded?.db.close(); } catch { /* Already closed. */ }
    try { loaded?.releaseInstanceLock(); } catch { /* Already released. */ }
    if (prior === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = prior;
    try { fs.rmSync(directory, { recursive: true, force: true }); } catch { /* Cleanup after Windows releases SQLite handles. */ }
  }
});
