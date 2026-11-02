import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

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

    const invalidSetup = await fetch(`${base}/api/setup`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: 'bad' }) });
    assert.equal(invalidSetup.status, 400);
    assert.deepEqual(await invalidSetup.json(), { error: 'Enter a valid Microsoft application client ID.' });

    const deniedOrigin = await fetch(`${base}/api/sign-out`, { method: 'POST', headers: { Origin: 'https://attacker.invalid', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(deniedOrigin.status, 403);
    await deniedOrigin.arrayBuffer();
    const missingOrigin = await fetch(`${base}/api/sign-out`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(missingOrigin.status, 403);
    await missingOrigin.arrayBuffer();

    const unauthenticatedEmails = await fetch(`${base}/api/emails`);
    assert.equal(unauthenticatedEmails.status, 401);
    await unauthenticatedEmails.arrayBuffer();
    const signIn = await fetch(`${base}/api/sign-in`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(signIn.status, 400);
    await signIn.arrayBuffer();

    const stopped = once(child, 'exit');
    child.kill('SIGTERM');
    await stopped;
    await new Promise((resolve) => setTimeout(resolve, 10));
    child = launch();
    await waitUntilReady();
    const restarted = await (await fetch(`${base}/api/status`)).json();
    assert.notEqual(restarted.collection.cutoff, status.collection.cutoff, 'restart must establish a fresh cutoff');
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
