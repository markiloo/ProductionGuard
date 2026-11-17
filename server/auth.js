import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ImapFlow } from 'imapflow';

const dataDir = process.env.DATA_DIR || path.resolve('data');
const credentialPath = path.join(dataDir, 'gmail-credential.dpapi');
let credential = null;
let authError = null;

export function protectWithWindowsUser(value, encrypt) {
  if (process.platform !== 'win32') throw new Error('This local build requires Windows credential protection.');
  const operation = encrypt
    ? '$result=[Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($value),$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($result))'
    : '$result=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($value),$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Text.Encoding]::UTF8.GetString($result))';
  // The entropy text is fixed DPAPI key material from the original product name.
  // Changing it makes every previously saved app password undecryptable, so it
  // stays as-is even though the product is now Prod. Guard.
  const script = `Add-Type -AssemblyName System.Security;$value=[Console]::In.ReadToEnd();$entropy=[Text.Encoding]::UTF8.GetBytes('PO Checker Gmail local credential');${operation}`;
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (part) => { output += part; });
    child.on('error', () => reject(new Error('Windows credential protection is unavailable.')));
    child.on('close', (code) => code === 0 ? resolve(output) : reject(new Error('Windows credential protection failed.')));
    child.stdin.end(value);
  });
}

export async function restoreGmail() {
  if (!fs.existsSync(credentialPath)) return;
  try {
    credential = JSON.parse(await protectWithWindowsUser(fs.readFileSync(credentialPath, 'utf8'), false));
    authError = null;
  } catch {
    credential = null;
    authError = 'Saved Gmail credentials could not be opened by this Windows user. Connect again.';
  }
}

export function authState() {
  return {
    configured: Boolean(credential), connected: Boolean(credential),
    account: credential ? { id: `gmail:${credential.email.toLowerCase()}`, name: '', username: credential.email } : null,
    signingIn: false, needsInteractiveSignIn: false, error: authError,
  };
}

export function getCredentials() { return credential; }

export async function connectGmail(email, appPassword) {
  const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user: email, pass: appPassword }, logger: false });
  client.on('error', () => { /* Sign-in failures surface through connect(). */ });
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    lock.release();
    await client.logout();
  } catch (error) {
    try { client.close(); } catch { /* Connection may already be closed. */ }
    const isAuthError = /AUTHENTICATIONFAILED|Invalid credentials|Application-specific password|Login failed|Invalid login/i.test(String(error?.message || ''));
    throw new Error(isAuthError
      ? 'Gmail rejected the sign-in. Check the address, app password, and 2-Step Verification.'
      : 'Could not reach Gmail or open Inbox. Check the network connection and try again.');
  }
  const protectedValue = await protectWithWindowsUser(JSON.stringify({ email, password: appPassword }), true);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(credentialPath, protectedValue, { encoding: 'utf8', mode: 0o600 });
  credential = { email, password: appPassword };
  authError = null;
}

export function signOut() {
  credential = null;
  authError = null;
  fs.rmSync(credentialPath, { force: true });
}
