import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildHome, createDashboardWidget, deleteDashboardWidget, listDashboardWidgets, parseWidgetInput, projectStock, updateDashboardWidget } from '../server/dashboard.js';
import { deleteInventoryItem } from '../server/inventory.js';

const TODAY = '2026-11-13';
let directory;
let prior;
let loaded;

before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'po-checker-dashboard-'));
  prior = process.env.DATA_DIR;
  process.env.DATA_DIR = directory;
  loaded = await import('../server/db.js?dashboard-test');
  const { db } = loaded;
  const now = '2026-11-13T00:00:00.000Z';
  const insertInventory = db.prepare('INSERT INTO inventory(account_id,id,item,sku,quantity,unit,supplier,reorder_level,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  const insertDelivery = db.prepare('INSERT INTO incoming_deliveries(account_id,id,item_sku,quantity,unit,expected_arrival,supplier,status,received_at,po_id,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const insertRun = db.prepare('INSERT INTO production_runs(account_id,id,run_number,item,quantity,unit,status,scheduled_date,notes,production_item_id,completed_quantity,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const insertRequirement = db.prepare('INSERT INTO production_requirements(account_id,id,run_id,item_sku,quantity,unit,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)');

  db.prepare('INSERT INTO accounts(id,display_name,email,created_at) VALUES(?,?,?,?)').run('acct-a', '', 'a@example.com', now);
  db.prepare('INSERT INTO accounts(id,display_name,email,created_at) VALUES(?,?,?,?)').run('acct-b', '', 'b@example.com', now);

  insertInventory.run('acct-a', 'inv-a', 'Carton Glue', 'SKU-A', 100, 'units', 'Supplier A', 30, '', now, now);
  insertInventory.run('acct-b', 'inv-b', 'Item B', 'SKU-B', 7, 'boxes', '', null, '', now, now);

  insertDelivery.run('acct-a', 'del-1', 'SKU-A', 50, 'units', '2026-11-14', 'Supplier A', 'incoming', null, null, '', now, now);
  insertDelivery.run('acct-a', 'del-2', 'SKU-A', 20, 'units', '2026-11-23', 'Supplier A', 'incoming', null, null, '', now, now);
  insertDelivery.run('acct-a', 'del-3', 'SKU-A', 5, 'kg', '2026-11-15', '', 'incoming', null, null, '', now, now);
  insertDelivery.run('acct-a', 'del-4', 'SKU-A', 500, 'units', '2026-11-10', '', 'received', now, null, '', now, now);
  insertDelivery.run('acct-a', 'del-5', 'SKU-A', 999, 'units', '2026-11-30', '', 'incoming', null, null, '', now, now);
  insertDelivery.run('acct-a', 'del-6', 'SKU-A', 9, 'units', '2026-11-12', '', 'incoming', null, null, '', now, now);
  insertDelivery.run('acct-b', 'del-b', 'SKU-B', 3, 'boxes', '2026-11-14', '', 'incoming', null, null, '', now, now);

  insertRun.run('acct-a', 'run-1', 'PR-0001', 'Assembly A', 5, 'units', 'in_progress', '2026-11-18', '', null, 0, now, now);
  insertRun.run('acct-a', 'run-2', 'PR-0002', 'Assembly A', 5, 'units', 'completed', '2026-11-16', '', null, 5, now, now);
  insertRun.run('acct-a', 'run-3', 'PR-0003', 'Assembly A', 5, 'units', 'scheduled', '2026-11-21', '', null, 0, now, now);
  insertRun.run('acct-a', 'run-4', 'PR-0004', 'Assembly A', 5, 'units', 'scheduled', '2026-11-20', '', null, 0, now, now);
  insertRun.run('acct-a', 'run-5', 'PR-0005', 'Assembly B', 5, 'units', 'scheduled', TODAY, '', null, 2, now, now);
  insertRun.run('acct-a', 'run-6', 'PR-0006', 'Assembly C', 5, 'units', 'on_hold', TODAY, '', null, 0, now, now);
  insertRun.run('acct-b', 'run-b', 'PR-0001', 'Other', 5, 'boxes', 'in_progress', TODAY, '', null, 1, now, now);

  insertRequirement.run('acct-a', 'req-1', 'run-1', 'SKU-A', 200, 'units', 'outstanding', now, now);
  insertRequirement.run('acct-a', 'req-2', 'run-2', 'SKU-A', 40, 'units', 'outstanding', now, now);
  insertRequirement.run('acct-a', 'req-3', 'run-3', 'SKU-A', 30, 'units', 'outstanding', now, now);
  insertRequirement.run('acct-a', 'req-4', 'run-4', 'SKU-A', 7, 'kg', 'outstanding', now, now);
  insertRequirement.run('acct-b', 'req-b', 'run-b', 'SKU-B', 2, 'boxes', 'outstanding', now, now);
});

after(() => {
  try { loaded?.db.close(); } catch { /* Already closed. */ }
  try { loaded?.releaseInstanceLock(); } catch { /* Already released. */ }
  if (prior === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = prior;
  try { fs.rmSync(directory, { recursive: true, force: true }); } catch { /* Windows may hold SQLite handles briefly. */ }
});

test('dashboard migration creates account-scoped widgets', () => {
  const { db } = loaded;
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='dashboard_widgets'").get());
  assert.ok(db.prepare('SELECT 1 FROM schema_migrations WHERE version = 21').get());
});

test('projected stock counts confirmed supply and outstanding demand in the horizon', () => {
  const { db } = loaded;
  const projection = projectStock(db, 'acct-a', 'SKU-A', 10, TODAY);
  assert.equal(projection.startDate, TODAY);
  assert.equal(projection.endDate, '2026-11-23');
  assert.equal(projection.horizonDays, 10);
  assert.equal(projection.points.length, 11);
  assert.equal(projection.currentBalance, 109, 'the overdue delivery is counted from the start');
  assert.equal(projection.points[1].balance, 159, 'tomorrow delivery is counted');
  assert.equal(projection.points[5].balance, -41, 'past-due delivery and demand land on the start, not their old date');
  assert.equal(projection.points[8].balance, -71);
  assert.equal(projection.endBalance, -51);
  assert.equal(projection.minBalance, -71);
  assert.deepEqual(projection.stockoutDates.map((entry) => entry.date), [
    '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23',
  ]);
  assert.equal(projection.nextArrival, '2026-11-12', 'the overdue delivery is still the next arrival');
  assert.deepEqual(projection.excluded, { deliveries: 1, requirements: 1 });
  assert.equal(projection.reorderLevel, 30);
});

test('projection ignores completed runs, received stock, and records beyond the horizon', () => {
  const { db } = loaded;
  const projection = projectStock(db, 'acct-a', 'SKU-A', 10, TODAY);
  assert.equal(projection.points[3].balance, 159, 'completed run demand is not subtracted');
  assert.equal(projection.points[10].balance, -51, 'the 999-unit delivery beyond the horizon is excluded');
  const missing = projectStock(db, 'acct-a', 'SKU-MISSING', 10, TODAY);
  assert.equal(missing, null);
});

test('widget input validates the SKU and horizon against the account inventory', () => {
  const { db } = loaded;
  assert.deepEqual(parseWidgetInput(db, 'acct-a', { sku: 'sku-a', horizonDays: 30 }), { sku: 'SKU-A', horizonDays: 30 });
  assert.throws(() => parseWidgetInput(db, 'acct-a', { sku: '', horizonDays: 30 }), /Choose an inventory SKU/);
  assert.throws(() => parseWidgetInput(db, 'acct-a', { sku: 'SKU-MISSING', horizonDays: 30 }), /existing inventory SKU/);
  assert.throws(() => parseWidgetInput(db, 'acct-a', { sku: 'SKU-A', horizonDays: 0 }), /between 1 and 365/);
  assert.throws(() => parseWidgetInput(db, 'acct-a', { sku: 'SKU-A', horizonDays: 366 }), /between 1 and 365/);
  assert.throws(() => parseWidgetInput(db, 'acct-a', { sku: 'SKU-A', horizonDays: 7.5 }), /between 1 and 365/);
  assert.throws(() => parseWidgetInput(db, 'acct-b', { sku: 'SKU-A', horizonDays: 30 }), /existing inventory SKU/, 'other accounts cannot use this SKU');
});

test('widgets are ordered, editable, deletable, and account-scoped', () => {
  const { db } = loaded;
  const now = '2026-11-13T01:00:00.000Z';
  const first = createDashboardWidget(db, 'acct-a', parseWidgetInput(db, 'acct-a', { sku: 'SKU-A', horizonDays: 10 }), now);
  const second = createDashboardWidget(db, 'acct-a', parseWidgetInput(db, 'acct-a', { sku: 'SKU-A', horizonDays: 30 }), now);
  const other = createDashboardWidget(db, 'acct-b', parseWidgetInput(db, 'acct-b', { sku: 'SKU-B', horizonDays: 7 }), now);

  assert.deepEqual(listDashboardWidgets(db, 'acct-a').map((widget) => widget.id), [first.id, second.id]);
  assert.deepEqual(listDashboardWidgets(db, 'acct-b').map((widget) => widget.id), [other.id]);
  assert.equal(first.position, 0);
  assert.equal(second.position, 1);

  const updated = updateDashboardWidget(db, 'acct-a', first.id, { sku: 'SKU-A', horizonDays: 14 }, now);
  assert.equal(updated.horizonDays, 14);
  assert.equal(updateDashboardWidget(db, 'acct-a', other.id, { sku: 'SKU-A', horizonDays: 14 }, now), null, 'other accounts cannot edit it');
  assert.equal(deleteDashboardWidget(db, 'acct-b', first.id), false);

  assert.throws(() => deleteInventoryItem(db, 'acct-a', 'inv-a'), (failure) => failure.status === 409 && /dashboard widgets/.test(failure.message));

  assert.equal(deleteDashboardWidget(db, 'acct-a', first.id), true);
  assert.deepEqual(listDashboardWidgets(db, 'acct-a').map((widget) => widget.id), [second.id]);
  assert.equal(deleteDashboardWidget(db, 'acct-a', first.id), false);
});

test('home payload limits incoming deliveries and selects current runs', () => {
  const { db } = loaded;
  const home = buildHome(db, 'acct-a', TODAY);
  assert.equal(home.today, TODAY);
  assert.equal(home.incoming.length, 3);
  assert.deepEqual(home.incoming.map((delivery) => delivery.id), ['del-6', 'del-1', 'del-3']);
  assert.equal(home.incoming[0].overdue, true);
  assert.equal(home.incoming[1].overdue, false);
  assert.equal(home.incoming[0].itemName, 'Carton Glue');
  assert.equal(home.runs.map((run) => run.runNumber).join(','), 'PR-0001,PR-0005');
  assert.equal(home.runs[0].percent, 0);
  assert.equal(home.runs[1].percent, 40);
  assert.equal(home.runs[1].completedQuantity, 2);
  assert.ok(home.widgets.every((widget) => widget.projection && widget.projection.sku === 'SKU-A'));
  assert.equal(buildHome(db, 'acct-b', TODAY).incoming.length, 1);
  assert.ok(buildHome(db, 'acct-b', TODAY).incoming.every((delivery) => delivery.itemSku === 'SKU-B'));
});
