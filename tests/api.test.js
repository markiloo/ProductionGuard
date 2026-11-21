import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import Database from 'better-sqlite3';
import { protectWithWindowsUser } from '../server/auth.js';

async function availablePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => listener.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = listener.address();
  await new Promise((resolve) => listener.close(resolve));
  return port;
}

test('local API validates setup, connection state, and cross-origin writes', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'po-checker-api-'));
  const port = await availablePort();
  const launch = () => spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: { ...process.env, DATA_DIR: directory, PORT: String(port) },
    stdio: 'ignore',
  });
  let child = launch();
  const base = `http://127.0.0.1:${port}`;
  try {
    const waitUntilReady = async () => {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        if (child.exitCode !== null) throw new Error(`Server exited with ${child.exitCode}`);
        try { const response = await fetch(`${base}/api/status`); await response.arrayBuffer(); if (response.ok) return; } catch { /* Wait for loopback listener. */ }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error('Server did not become available.');
    };
    await waitUntilReady();
    const status = await (await fetch(`${base}/api/status`)).json();
    assert.ok(Number.isFinite(Date.parse(status.collection.cutoff)));
    assert.equal(status.auth.connected, false);
    assert.equal(status.features.clearSavedInbox, true);
    const duplicate = spawn(process.execPath, ['--input-type=module', '-e', "import('./server/db.js')"], {
      cwd: process.cwd(), env: { ...process.env, DATA_DIR: directory }, stdio: ['ignore', 'ignore', 'pipe'],
    });
    let duplicateError = '';
    duplicate.stderr.setEncoding('utf8');
    duplicate.stderr.on('data', (chunk) => { duplicateError += chunk; });
    const [duplicateCode] = await once(duplicate, 'exit');
    assert.notEqual(duplicateCode, 0, 'a second server cannot acquire the same data-directory lock');
    assert.match(duplicateError, /already using this data directory/i);
    const refreshed = await (await fetch(`${base}/api/status`)).json();
    assert.equal(refreshed.collection.cutoff, status.collection.cutoff, 'status refresh must preserve the startup cutoff');

    const invalidSetup = await fetch(`${base}/api/setup`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'bad', appPassword: '' }) });
    assert.equal(invalidSetup.status, 400);
    assert.deepEqual(await invalidSetup.json(), { error: 'Enter a Gmail address and app password.' });

    const deniedOrigin = await fetch(`${base}/api/sign-out`, { method: 'POST', headers: { Origin: 'https://attacker.invalid', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(deniedOrigin.status, 403);
    await deniedOrigin.arrayBuffer();
    const missingOrigin = await fetch(`${base}/api/sign-out`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(missingOrigin.status, 403);
    await missingOrigin.arrayBuffer();

    const unauthenticatedPos = await fetch(`${base}/api/pos`);
    assert.equal(unauthenticatedPos.status, 401);
    await unauthenticatedPos.arrayBuffer();
    const unauthenticatedClear = await fetch(`${base}/api/emails`, { method: 'DELETE', headers: { Origin: base } });
    assert.equal(unauthenticatedClear.status, 401);
    await unauthenticatedClear.arrayBuffer();
    const unauthenticatedDashboard = await fetch(`${base}/api/dashboard`);
    assert.equal(unauthenticatedDashboard.status, 401);
    await unauthenticatedDashboard.arrayBuffer();

    const stopped = once(child, 'exit');
    child.kill('SIGTERM');
    await stopped;
    await new Promise((resolve) => setTimeout(resolve, 10));
    const fakeCredential = await protectWithWindowsUser(JSON.stringify({ email: 'test@gmail.com', password: 'dummy' }), true);
    fs.writeFileSync(path.join(directory, 'gmail-credential.dpapi'), fakeCredential);
    const seeded = new Database(path.join(directory, 'po-checker.db'));
    seeded.prepare('INSERT INTO accounts(id,display_name,email,created_at) VALUES(?,?,?,?)').run('gmail:test@gmail.com', '', 'test@gmail.com', status.collection.cutoff);
    seeded.prepare('INSERT INTO runs(id,account_id,cutoff,started_at,status) VALUES(?,?,?,?,?)').run('seed-run', 'gmail:test@gmail.com', status.collection.cutoff, status.collection.cutoff, 'stopped');
    seeded.prepare('INSERT INTO emails(account_id,message_id,run_id,sender_address,received_at,subject,po_status) VALUES(?,?,?,?,?,?,?)').run('gmail:test@gmail.com', 'seed-message', 'seed-run', 'sender@example.com', status.collection.cutoff, 'PO', 'needs_review');
    seeded.prepare('INSERT INTO inventory(account_id,id,item,sku,quantity,unit,supplier,reorder_level,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('gmail:test@gmail.com', 'seed-inventory', 'Widget Item', 'SKU-W', 10, 'units', '', null, '', status.collection.cutoff, status.collection.cutoff);
    seeded.close();
    child = launch();
    await waitUntilReady();
    let restarted;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      restarted = await (await fetch(`${base}/api/status`)).json();
      if (restarted.auth.connected) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(restarted.auth.connected, true);
    assert.notEqual(restarted.collection.cutoff, status.collection.cutoff, 'restart must establish a fresh cutoff');
    assert.equal(restarted.totalCount, 1);
    const dashboard = await (await fetch(`${base}/api/dashboard`)).json();
    assert.deepEqual(dashboard.widgets, []);
    assert.deepEqual(dashboard.incoming, []);
    assert.deepEqual(dashboard.runs, []);
    const deniedWidget = await fetch(`${base}/api/dashboard/widgets`, { method: 'POST', headers: { Origin: 'https://attacker.invalid', 'Content-Type': 'application/json' }, body: JSON.stringify({ sku: 'SKU-W', horizonDays: 30 }) });
    assert.equal(deniedWidget.status, 403);
    await deniedWidget.arrayBuffer();
    const invalidWidget = await fetch(`${base}/api/dashboard/widgets`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ sku: 'SKU-W', horizonDays: 0 }) });
    assert.equal(invalidWidget.status, 400);
    assert.match((await invalidWidget.json()).error, /between 1 and 365/);
    const createdWidget = await fetch(`${base}/api/dashboard/widgets`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ sku: 'sku-w', horizonDays: 30 }) });
    assert.equal(createdWidget.status, 201);
    const { widget } = await createdWidget.json();
    assert.equal(widget.sku, 'SKU-W');
    const withWidget = await (await fetch(`${base}/api/dashboard`)).json();
    assert.equal(withWidget.widgets.length, 1);
    assert.equal(withWidget.widgets[0].projection.currentBalance, 10);
    assert.equal(withWidget.widgets[0].projection.points.length, 31);
    const deletedWidget = await fetch(`${base}/api/dashboard/widgets/${encodeURIComponent(widget.id)}`, { method: 'DELETE', headers: { Origin: base } });
    assert.equal(deletedWidget.status, 200);
    assert.deepEqual((await (await fetch(`${base}/api/dashboard`)).json()).widgets, []);

    const jsonHeaders = { Origin: base, 'Content-Type': 'application/json' };
    const deliveryInput = { itemSku: 'SKU-W', quantity: 100, unit: 'units', expectedArrival: '2026-12-15', supplier: 'Supplier', notes: '' };
    const createdDelivery = await fetch(`${base}/api/deliveries`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(deliveryInput) });
    assert.equal(createdDelivery.status, 201);
    const delivery = (await createdDelivery.json()).item;
    const deliveryUrl = `${base}/api/deliveries/${delivery.id}`;
    const dependencies = await (await fetch(`${base}/api/inventory/seed-inventory/unit-dependencies`)).json();
    assert.deepEqual(dependencies.dependencies.map(({ id, quantity }) => [id, quantity]), [[delivery.id, 100]]);
    const unitConflict = await fetch(`${base}/api/inventory/seed-inventory`, {
      method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ item: 'Widget Item', sku: 'SKU-W', quantity: 0, unit: 'boxes' }),
    });
    assert.equal(unitConflict.status, 409);
    assert.equal((await unitConflict.json()).unitDependencies.blockers[0].id, delivery.id);

    const picture = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const receiptHeaders = { Origin: base, 'Content-Type': 'image/png', 'X-Received-Quantity': '60', 'X-Expected-Received-Quantity': '0' };
    const sendReceipt = (headers) => fetch(`${deliveryUrl}/receive`, { method: 'POST', headers, body: picture });
    const missingRequestId = await sendReceipt(receiptHeaders);
    assert.equal(missingRequestId.status, 400);
    assert.match((await missingRequestId.json()).error, /request ID/);
    const receipt = await sendReceipt({ ...receiptHeaders, 'X-Receipt-Request-ID': 'receipt-a' });
    assert.equal(receipt.status, 200);
    const recorded = await receipt.json();
    assert.equal(recorded.delivery.receivedQuantity, 60);
    assert.equal(recorded.delivery.remainingQuantity, 40);
    const replay = await sendReceipt({ ...receiptHeaders, 'X-Receipt-Request-ID': 'receipt-a' });
    assert.equal((await replay.json()).alreadyReceived, true);
    const stale = await sendReceipt({ ...receiptHeaders, 'X-Receipt-Request-ID': 'receipt-b' });
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).delivery.remainingQuantity, 40);
    for (const endpoint of ['receipt', 'receipts/receipt-a']) {
      const storedPicture = await fetch(`${deliveryUrl}/${endpoint}`);
      assert.equal(storedPicture.status, 200);
      assert.deepEqual(Buffer.from(await storedPicture.arrayBuffer()), picture);
    }
    const shifted = await fetch(deliveryUrl, {
      method: 'PUT', headers: jsonHeaders,
      body: JSON.stringify({ ...deliveryInput, expectedArrival: '2026-12-20', correctionNote: 'Second truck', expectedReceived: 60 }),
    });
    assert.equal(shifted.status, 200);
    assert.equal((await shifted.json()).item.scheduleNote, 'Second truck');
    const projected = await (await fetch(`${base}/api/dashboard`)).json();
    assert.deepEqual(projected.incoming.map(({ quantity, expectedArrival }) => [quantity, expectedArrival]), [[40, '2026-12-20']]);
    const denyClose = await fetch(`${deliveryUrl}/close`, { method: 'POST', headers: { ...jsonHeaders, Origin: 'https://attacker.invalid' }, body: '{}' });
    assert.equal(denyClose.status, 403);
    const missingReason = await fetch(`${deliveryUrl}/close`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ reason: ' ', expectedReceived: 60 }) });
    assert.equal(missingReason.status, 400);
    const closedDelivery = await fetch(`${deliveryUrl}/close`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ reason: 'Remainder canceled by supplier', expectedReceived: 60 }) });
    assert.equal(closedDelivery.status, 200);
    const closed = (await closedDelivery.json()).item;
    assert.deepEqual([closed.status, closed.receivedQuantity, closed.canceledQuantity, closed.remainingQuantity], ['canceled', 60, 40, 0]);
    assert.equal((await (await fetch(`${base}/api/inventory`)).json()).items[0].quantity, 70);
    assert.deepEqual((await (await fetch(`${base}/api/dashboard`)).json()).incoming, []);

    const clear = await fetch(`${base}/api/emails`, { method: 'DELETE', headers: { Origin: base } });
    assert.equal(clear.status, 200);
    assert.deepEqual(await clear.json(), { ok: true, deletedCount: 1 });
    const cleared = await (await fetch(`${base}/api/status`)).json();
    assert.equal(cleared.totalCount, 0);
    const clearedDatabase = new Database(path.join(directory, 'po-checker.db'), { readonly: true });
    assert.ok(clearedDatabase.prepare('SELECT cleared_at FROM account_clears WHERE account_id=?').get('gmail:test@gmail.com').cleared_at);
    clearedDatabase.close();
  } finally {
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      const timedOut = await Promise.race([exited.then(() => false), new Promise((resolve) => setTimeout(() => resolve(true), 3000))]);
      if (timedOut) { child.kill('SIGKILL'); await exited; }
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
