/** Delete an account's local mail and record a cutoff so older Inbox mail stays cleared. */
export function clearSavedEmails(db, accountId, clearedAt) {
  return db.transaction(() => {
    db.prepare('INSERT INTO account_clears(account_id,cleared_at) VALUES(?,?) ON CONFLICT(account_id) DO UPDATE SET cleared_at=max(account_clears.cleared_at,excluded.cleared_at)').run(accountId, clearedAt);
    try { db.prepare('DELETE FROM po_events WHERE account_id=?').run(accountId); } catch { /* Older schemas have no event history. */ }
    try { db.prepare('DELETE FROM po_proofs WHERE account_id=?').run(accountId); } catch { /* Older schemas have no proof pictures. */ }
    return db.prepare('DELETE FROM emails WHERE account_id=? AND po_status IS NOT NULL').run(accountId).changes;
  })();
}
