import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { PublicClientApplication } from '@azure/msal-node';
import { PersistenceCachePlugin, PersistenceCreator, DataProtectionScope } from '@azure/msal-node-extensions';

let app;
let account = null;
let deviceFlow = null;
let cachePlugin = null;
let interactiveRequired = false;
let authGeneration = 0;

/** Create a public client with an OS encrypted cache; startup fails closed if encryption is unavailable. */
export async function configureAuth(clientId) {
  cancelSignIn('reconfigure');
  app = null;
  account = null;
  if (!clientId) return;
  const cachePath = path.join(process.env.APPDATA || os.homedir(), 'POChecker', 'msal-cache.bin');
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  const persistence = await PersistenceCreator.createPersistence({ cachePath, dataProtectionScope: DataProtectionScope.CurrentUser, usePlaintextFileOnLinux: false });
  cachePlugin = new PersistenceCachePlugin(persistence);
  const configuredApp = new PublicClientApplication({ auth: { clientId, authority: 'https://login.microsoftonline.com/consumers' }, cache: { cachePlugin } });
  const accounts = await configuredApp.getTokenCache().getAllAccounts();
  app = configuredApp;
  account = accounts[0] || null;
  interactiveRequired = false;
}

export function authState() {
  return { configured: Boolean(app), connected: Boolean(account), account: account ? { id: account.homeAccountId, name: account.name || '', username: account.username || '' } : null, signingIn: Boolean(deviceFlow), needsInteractiveSignIn: interactiveRequired };
}

export async function beginSignIn(onCode, onComplete) {
  if (!app) throw new Error('Save a Microsoft application client ID first.');
  if (deviceFlow) throw new Error('Sign-in is already in progress.');
  const client = app;
  const existingAccountId = account?.homeAccountId || null;
  const flowGeneration = ++authGeneration;
  const request = { scopes: ['Mail.Read'], cancel: false, deviceCodeCallback: (response) => onCode({ message: response.message, userCode: response.userCode, verificationUri: response.verificationUri, expiresOn: response.expiresOn }) };
  deviceFlow = request;
  try {
    const result = await client.acquireTokenByDeviceCode(request);
    if (!result) throw new Error('Sign-in was cancelled.');
    if (flowGeneration !== authGeneration) {
      if (result.account && (request.cancelReason === 'signout' || result.account.homeAccountId !== existingAccountId)) await client.getTokenCache().removeAccount(result.account);
      throw new Error('Sign-in was cancelled.');
    }
    account = result.account;
    interactiveRequired = false;
    onComplete(null);
  } catch (error) { onComplete(error); }
  finally { if (deviceFlow === request) deviceFlow = null; }
}

export function cancelSignIn(reason = 'cancel') {
  authGeneration += 1;
  if (deviceFlow) {
    deviceFlow.cancel = true;
    if (reason === 'signout' || deviceFlow.cancelReason !== 'signout') deviceFlow.cancelReason = reason;
  }
}
export function requireInteractiveSignIn() { interactiveRequired = true; }
export async function signOut() {
  cancelSignIn('signout');
  const signedAccount = account;
  account = null;
  interactiveRequired = false;
  if (app && signedAccount) await app.getTokenCache().removeAccount(signedAccount);
}
export async function getAccessToken() {
  if (!app || !account) return null;
  try { return (await app.acquireTokenSilent({ account, scopes: ['Mail.Read'] })).accessToken; }
  catch (error) { if (error.name === 'InteractionRequiredAuthError') { interactiveRequired = true; return null; } throw error; }
}
