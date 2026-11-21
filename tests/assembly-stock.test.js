import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createProductionItem, deleteProductionItem, getProductionItem, parseProductionItemInput, updateProductionItem } from '../server/production-items.js';
import { createProductionRun, deleteProductionRun, parseProductionInput, updateProductionProgress, updateProductionRun } from '../server/production.js';
import { createInventoryItem, deleteInventoryItem, inventoryHistory, inventoryUnitDependencies, parseInventoryInput, updateInventoryItem } from '../server/inventory.js';
import { closeDelivery, createDelivery } from '../server/deliveries.js';
import { buildHome, createDashboardWidget, parseWidgetInput } from '../server/dashboard.js';

const NOW = '2026-11-13T09:00:00.000Z';
const TODAY = '2026-11-13';
const ACCOUNT = 'gmail:assembly@example.com';
let directory;
let prior;
let loaded;

function assemblyInput(name, sku, unit = 'units', requirements = []) {
  return parseProductionItemInput({ name, sku, unit, requirements });
}

before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'po-checker-assembly-'));
  prior = process.env.DATA_DIR;
  process.env.DATA_DIR = directory;
  loaded = await import('../server/db.js?assembly-stock-test');
  const { db } = loaded;
  db.prepare('INSERT INTO accounts(id,display_name,email,created_at) VALUES(?,?,?,?)').run(ACCOUNT, '', 'assembly@example.com', NOW);
  for (const spec of [
    { item: 'Cardboard', sku: 'CARD', quantity: 100, unit: 'units' },
    { item: 'Glue', sku: 'GLUE', quantity: 100, unit: 'units' },
    { item: 'Wax', sku: 'WAX', quantity: 100, unit: 'kg' },
  ]) createInventoryItem(db, ACCOUNT, parseInventoryInput(spec), NOW);
});

after(() => {
  try { loaded?.db.close(); } catch { /* Already closed. */ }
  try { loaded?.releaseInstanceLock(); } catch { /* Already released. */ }
  if (prior === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = prior;
  try { fs.rmSync(directory, { recursive: true, force: true }); } catch { /* Windows may hold SQLite handles briefly. */ }
});

test('creating an assembly creates its finished-good inventory item', () => {
  const { db } = loaded;
  const assembly = createProductionItem(db, ACCOUNT, assemblyInput('Packaged Box', 'ASM-BOX', 'units', [
    { itemSku: 'CARD', quantity: 2, unit: 'units' },
    { itemSku: 'GLUE', quantity: 1, unit: 'units' },
  ]), NOW);

  const inventory = db.prepare('SELECT id, item, sku, quantity, unit, notes FROM inventory WHERE account_id=? AND sku=?').get(ACCOUNT, 'ASM-BOX');
  assert.equal(assembly.sku, 'ASM-BOX');
  assert.equal(assembly.inventoryId, inventory.id);
  assert.equal(assembly.stock, 0);
  assert.deepEqual({ item: inventory.item, quantity: inventory.quantity, unit: inventory.unit, notes: inventory.notes }, {
    item: 'Packaged Box', quantity: 0, unit: 'units', notes: 'Produced by assembly',
  });
  const history = db.prepare('SELECT kind, before_quantity AS before, after_quantity AS after FROM inventory_history WHERE account_id=? AND inventory_id=?').all(ACCOUNT, inventory.id);
  assert.deepEqual(history, [{ kind: 'Starting balance', before: 0, after: 0 }]);
  assert.throws(() => deleteInventoryItem(db, ACCOUNT, inventory.id), (failure) => failure.status === 409 && /assemblies/.test(failure.message), 'the finished-good item cannot be deleted while its assembly exists');

  assert.throws(() => createProductionItem(db, ACCOUNT, assemblyInput('Duplicate SKU', 'asm-box'), NOW), (failure) => failure.status === 409 && /already used/.test(failure.message));
  assert.throws(() => createProductionItem(db, ACCOUNT, assemblyInput('Packaged Box', 'ASM-OTHER'), NOW), (failure) => failure.status === 409 && /already defined/.test(failure.message));
  assert.throws(() => createProductionItem(db, ACCOUNT, assemblyInput('Self Material', 'ASM-SELF', 'units', [{ itemSku: 'ASM-SELF', quantity: 1, unit: 'units' }]), NOW), /cannot use its own/);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM inventory WHERE account_id=? AND sku=?').get(ACCOUNT, 'ASM-SELF').count, 0, 'a rejected assembly leaves no inventory row');
});

test('assembly edits sync the inventory item and respect stock and SKU guards', () => {
  const { db } = loaded;
  const assembly = createProductionItem(db, ACCOUNT, assemblyInput('Glass Case', 'ASM-CASE', 'boxes'), NOW);
  const updated = updateProductionItem(db, ACCOUNT, assembly.id, assemblyInput('Glass Case Output', 'ASM-CASE', 'cases'), NOW);
  assert.equal(updated.name, 'Glass Case Output');
  assert.equal(updated.stock, 0);
  const inventory = db.prepare('SELECT item, unit FROM inventory WHERE account_id=? AND id=?').get(ACCOUNT, assembly.inventoryId);
  assert.deepEqual(inventory, { item: 'Glass Case Output', unit: 'cases' });

  db.prepare('UPDATE inventory SET quantity=5 WHERE account_id=? AND id=?').run(ACCOUNT, assembly.inventoryId);
  assert.throws(() => updateProductionItem(db, ACCOUNT, assembly.id, assemblyInput('Glass Case Output', 'ASM-CASE', 'units'), NOW), /zero stock/);
  const renamed = updateProductionItem(db, ACCOUNT, assembly.id, assemblyInput('Glass Case Stock', 'ASM-CASE', 'cases'), NOW);
  assert.equal(renamed.name, 'Glass Case Stock');
  assert.equal(renamed.stock, 5);
  assert.equal(db.prepare('SELECT item FROM inventory WHERE account_id=? AND id=?').get(ACCOUNT, assembly.inventoryId).item, 'Glass Case Stock');

  assert.throws(() => updateProductionItem(db, ACCOUNT, assembly.id, assemblyInput('Glass Case Stock', 'ASM-NEW', 'cases'), NOW), /SKU cannot be changed/);
  assert.throws(() => updateProductionItem(db, ACCOUNT, assembly.id, assemblyInput('Glass Case Stock', 'ASM-CASE', 'cases', [{ itemSku: 'ASM-CASE', quantity: 1, unit: 'cases' }]), NOW), /cannot use its own/);
});

test('unit changes list open deliveries, runs and assembly materials and preserve historical units', () => {
  const { db } = loaded;
  const material = createInventoryItem(db, ACCOUNT, parseInventoryInput({ item: 'Unit test stock', sku: 'UNIT-MAT', quantity: 2, unit: 'pieces' }), NOW);
  const assembly = createProductionItem(db, ACCOUNT, assemblyInput('Unit test assembly', 'ASM-UNIT', 'pieces', [
    { itemSku: material.sku, quantity: 3, unit: 'pieces' },
  ]), NOW);
  const run = createProductionRun(db, ACCOUNT, parseProductionInput({
    runNumber: 'PR-0099', productionItemId: assembly.id, quantity: 2, status: 'on_hold', scheduledDate: TODAY,
  }), NOW);
  const delivery = createDelivery(db, ACCOUNT, { itemSku: material.sku, quantity: 7, unit: 'pieces', expectedArrival: TODAY, supplier: 'Supplier', notes: '' }, NOW);
  const unrelated = 'gmail:other-units@example.com';
  db.prepare('INSERT INTO accounts(id,display_name,email,created_at) VALUES(?,?,?,?)').run(unrelated, '', 'other-units@example.com', NOW);
  createDelivery(db, unrelated, { itemSku: material.sku, quantity: 14, unit: 'pieces', expectedArrival: TODAY, supplier: 'Other account', notes: '' }, NOW);
  assert.equal(inventoryUnitDependencies(db, unrelated, material.id), null);
  assert.deepEqual(inventoryUnitDependencies(db, ACCOUNT, material.id).dependencies.map(({ kind, label, quantity }) => [kind, label, quantity]), [
    ['delivery', delivery.id, 7], ['requirement', 'PR-0099', 6], ['assembly_material', assembly.name, 3],
  ]);
  const change = { ...material, unit: 'boxes', quantity: 0 };
  assert.throws(() => updateInventoryItem(db, ACCOUNT, material.id, change, NOW),
    (failure) => failure.status === 409 && failure.unitDependencies.needsZeroStock && failure.unitDependencies.blockers.length === 3);
  const saved = updateInventoryItem(db, ACCOUNT, material.id, { ...change, unit: ' PIECES ', notes: 'Edited with dependencies' }, NOW);
  assert.equal(saved.unit, 'pieces');
  assert.equal(saved.quantity, 0);
  assert.equal(saved.notes, 'Edited with dependencies');
  assert.throws(() => updateProductionItem(db, ACCOUNT, assembly.id, assemblyInput(assembly.name, assembly.sku, 'boxes', assembly.requirements), NOW),
    (failure) => failure.status === 409 && failure.unitDependencies.blockers.some(({ kind, label }) => kind === 'assembly_run' && label === 'PR-0099'));
  closeDelivery(db, ACCOUNT, delivery.id, { reason: 'Canceled by supplier', expectedReceived: 0 }, NOW);
  updateProductionProgress(db, ACCOUNT, run.id, { completedQuantity: 2 }, NOW);
  updateProductionItem(db, ACCOUNT, assembly.id, assemblyInput(assembly.name, assembly.sku, 'pieces'), NOW);
  assert.equal(updateInventoryItem(db, ACCOUNT, material.id, change, NOW).unit, 'boxes');
  const history = inventoryHistory(db, ACCOUNT, material.id, 25, 0).items[0];
  assert.deepEqual([history.kind, history.before_unit, history.unit, history.before_quantity, history.after_quantity], ['Unit changed', 'pieces', 'boxes', 0, 0]);
  assert.equal(db.prepare('SELECT unit FROM incoming_deliveries WHERE account_id=? AND id=?').get(ACCOUNT, delivery.id).unit, 'pieces');
  assert.equal(db.prepare('SELECT unit FROM production_requirements WHERE account_id=? AND run_id=?').get(ACCOUNT, run.id).unit, 'pieces');
});

test('completed units add to and remove from assembly stock exactly once', () => {
  const { db } = loaded;
  const assembly = createProductionItem(db, ACCOUNT, assemblyInput('Widget', 'ASM-WIDGET'), NOW);
  const run = createProductionRun(db, ACCOUNT, parseProductionInput({
    runNumber: 'PR-0001', productionItemId: assembly.id, quantity: 10, status: 'scheduled', scheduledDate: TODAY,
  }), NOW);

  const stock = () => db.prepare('SELECT quantity FROM inventory WHERE account_id=? AND id=?').get(ACCOUNT, assembly.inventoryId).quantity;
  assert.equal(updateProductionProgress(db, ACCOUNT, run.id, { completedQuantity: 4 }, NOW).completedQuantity, 4);
  assert.equal(stock(), 4);
  const historyCount = db.prepare('SELECT COUNT(*) AS count FROM inventory_history WHERE account_id=? AND inventory_id=?').get(ACCOUNT, assembly.inventoryId).count;
  updateProductionProgress(db, ACCOUNT, run.id, { completedQuantity: 4 }, NOW);
  assert.equal(stock(), 4, 'saving the same completed count is a no-op');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM inventory_history WHERE account_id=? AND inventory_id=?').get(ACCOUNT, assembly.inventoryId).count, historyCount);

  updateProductionProgress(db, ACCOUNT, run.id, { completedQuantity: 7 }, NOW);
  assert.equal(stock(), 7);
  updateProductionProgress(db, ACCOUNT, run.id, { completedQuantity: 2 }, NOW);
  assert.equal(stock(), 2, 'lowering completed units removes stock');
  const kinds = db.prepare('SELECT kind FROM inventory_history WHERE account_id=? AND inventory_id=? ORDER BY id').all(ACCOUNT, assembly.inventoryId).map((row) => row.kind);
  assert.ok(kinds.includes('Assembly completed'));
  assert.ok(kinds.includes('Completion corrected'));

  db.prepare('UPDATE inventory SET quantity=1 WHERE account_id=? AND id=?').run(ACCOUNT, assembly.inventoryId);
  assert.throws(() => updateProductionProgress(db, ACCOUNT, run.id, { completedQuantity: 0 }, NOW), (failure) => failure.status === 409 && /below the 1 units/.test(failure.message));
  assert.equal(getProductionItem(db, ACCOUNT, assembly.id).stock, 1, 'a rejected correction leaves stock unchanged');
  assert.equal(db.prepare('SELECT completed_quantity AS completed FROM production_runs WHERE account_id=? AND id=?').get(ACCOUNT, run.id).completed, 2, 'a rejected correction leaves progress unchanged');
});

test('marking a run completed stocks the remainder and reopening keeps the units', () => {
  const { db } = loaded;
  const assembly = createProductionItem(db, ACCOUNT, assemblyInput('Candle', 'ASM-CANDLE'), NOW);
  const run = createProductionRun(db, ACCOUNT, parseProductionInput({
    runNumber: 'PR-0002', productionItemId: assembly.id, quantity: 10, status: 'scheduled', scheduledDate: TODAY,
  }), NOW);
  const stock = () => db.prepare('SELECT quantity FROM inventory WHERE account_id=? AND id=?').get(ACCOUNT, assembly.inventoryId).quantity;

  updateProductionProgress(db, ACCOUNT, run.id, { completedQuantity: 3 }, NOW);
  assert.equal(stock(), 3);
  const completed = updateProductionRun(db, ACCOUNT, run.id, parseProductionInput({
    runNumber: run.runNumber, productionItemId: assembly.id, quantity: 10, status: 'completed', scheduledDate: TODAY,
  }), NOW);
  assert.equal(completed.status, 'completed');
  assert.equal(completed.completedQuantity, 10);
  assert.equal(stock(), 10, 'completing fills the remaining planned units');

  const reopened = updateProductionRun(db, ACCOUNT, run.id, parseProductionInput({
    runNumber: run.runNumber, productionItemId: assembly.id, quantity: 10, status: 'in_progress', scheduledDate: TODAY,
  }), NOW);
  assert.equal(reopened.status, 'in_progress');
  assert.equal(reopened.completedQuantity, 10);
  assert.equal(stock(), 10, 'reopening keeps the produced units');

  const raised = updateProductionRun(db, ACCOUNT, run.id, parseProductionInput({
    runNumber: run.runNumber, productionItemId: assembly.id, quantity: 12, status: 'completed', scheduledDate: TODAY,
  }), NOW);
  assert.equal(raised.completedQuantity, 12);
  assert.equal(stock(), 12, 'raising a completed run stocks the added quantity');

  const direct = createProductionRun(db, ACCOUNT, parseProductionInput({
    runNumber: 'PR-0003', productionItemId: assembly.id, quantity: 4, status: 'completed', scheduledDate: TODAY,
  }), NOW);
  assert.equal(direct.completedQuantity, 4);
  assert.equal(stock(), 16, 'creating a completed run stocks its quantity');

  const legacy = createProductionRun(db, ACCOUNT, parseProductionInput({
    runNumber: 'PR-0004', item: 'CARD', quantity: 5, unit: 'units', status: 'completed', scheduledDate: TODAY,
  }), NOW);
  assert.equal(legacy.completedQuantity, 5);
  assert.equal(stock(), 16, 'a run without an assembly does not change assembly stock');

  const beforeDelete = stock();
  deleteProductionRun(db, ACCOUNT, direct.id);
  assert.equal(stock(), beforeDelete, 'deleting a run keeps produced units');
});

test('assemblies with stock or runs cannot be deleted; zero-stock assemblies remove their inventory item', () => {
  const { db } = loaded;
  const assembly = createProductionItem(db, ACCOUNT, assemblyInput('Delete Me', 'ASM-DELETE'), NOW);
  const run = createProductionRun(db, ACCOUNT, parseProductionInput({
    runNumber: 'PR-0010', productionItemId: assembly.id, quantity: 2, status: 'scheduled', scheduledDate: TODAY,
  }), NOW);
  updateProductionProgress(db, ACCOUNT, run.id, { completedQuantity: 2 }, NOW);
  assert.throws(() => deleteProductionItem(db, ACCOUNT, assembly.id), /used by a production run/);

  deleteProductionRun(db, ACCOUNT, run.id);
  assert.throws(() => deleteProductionItem(db, ACCOUNT, assembly.id), /still has 2 units/);
  db.prepare('UPDATE inventory SET quantity=0 WHERE account_id=? AND id=?').run(ACCOUNT, assembly.inventoryId);
  assert.equal(deleteProductionItem(db, ACCOUNT, assembly.id), true);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM inventory WHERE account_id=? AND id=?').get(ACCOUNT, assembly.inventoryId).count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM production_items WHERE account_id=? AND id=?').get(ACCOUNT, assembly.id).count, 0);
});

test('finished-good stock feeds inventory projections and stays account-scoped', () => {
  const { db } = loaded;
  const assembly = createProductionItem(db, ACCOUNT, assemblyInput('Projected Output', 'ASM-PROJECT'), NOW);
  db.prepare('UPDATE inventory SET quantity=7 WHERE account_id=? AND id=?').run(ACCOUNT, assembly.inventoryId);
  const widget = createDashboardWidget(db, ACCOUNT, parseWidgetInput(db, ACCOUNT, { sku: 'ASM-PROJECT', horizonDays: 10 }), NOW);
  const home = buildHome(db, ACCOUNT, TODAY);
  const saved = home.widgets.find((entry) => entry.id === widget.id);
  assert.equal(saved.projection.currentBalance, 7);
  assert.equal(saved.projection.sku, 'ASM-PROJECT');
  assert.equal(buildHome(db, 'gmail:other@example.com', TODAY).widgets.length, 0);
  assert.equal(getProductionItem(db, 'gmail:other@example.com', assembly.id), null);
});
