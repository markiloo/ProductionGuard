import { db } from './db.js';
import { authState, getAccessToken, requireInteractiveSignIn } from './auth.js';
import { createCollector } from './collector-core.js';

/** Fresh UTC cutoff is recorded on module load, before setup or sign-in is complete. */
export const startupCutoff = new Date().toISOString();
const collector = createCollector({
  db,
  cutoff: startupCutoff,
  getAccessToken,
  getAccountId: () => authState().account?.id || null,
  onInteractionRequired: requireInteractiveSignIn,
});

export const collectionState = () => collector.state();
export const beginCollector = () => collector.begin();
export const stopCollector = () => collector.stop();
export const collect = (options) => collector.collect(options);
