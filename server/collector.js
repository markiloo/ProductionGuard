import { db } from './db.js';
import { authState, getCredentials } from './auth.js';
import { createCollector } from './collector-core.js';

/** Fresh UTC cutoff is recorded on module load, before Gmail setup is complete. */
export const startupCutoff = new Date().toISOString();
const collector = createCollector({
  db,
  cutoff: startupCutoff,
  getCredentials,
  getAccountId: () => authState().account?.id || null,
});

export const collectionState = () => collector.state();
export const beginCollector = () => collector.begin();
export const stopCollector = () => collector.stop();
export const collect = (options) => collector.collect(options);
