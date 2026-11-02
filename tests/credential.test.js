import test from 'node:test';
import assert from 'node:assert/strict';
import { protectWithWindowsUser } from '../server/auth.js';

test('Gmail app password storage uses Windows current-user encryption', { skip: process.platform !== 'win32' }, async () => {
  const sample = JSON.stringify({ email: 'test@gmail.com', password: 'example-app-password' });
  const protectedText = await protectWithWindowsUser(sample, true);
  assert.ok(protectedText.length > 20);
  assert.equal(protectedText.includes('example-app-password'), false);
  assert.equal(await protectWithWindowsUser(protectedText, false), sample);
});
