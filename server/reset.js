/**
 * Remove every local business record for one account, keep the Gmail connection,
 * account settings, and the plant time zone, and suppress older Inbox mail.
 */
export function resetAccountData(db, accountId, clearedAt) {
  return db.transaction(() => {
    const counts = {
      events: db.prepare('DELETE FROM po_events WHERE account_id=?').run(accountId).changes,
      emails: db.prepare('DELETE FROM emails WHERE account_id=?').run(accountId).changes,
      deliveries: db.prepare('DELETE FROM incoming_deliveries WHERE account_id=?').run(accountId).changes,
      inventory: db.prepare('DELETE FROM inventory WHERE account_id=?').run(accountId).changes,
      requirements: db.prepare('DELETE FROM production_requirements WHERE account_id=?').run(accountId).changes,
      runs: db.prepare('DELETE FROM production_runs WHERE account_id=?').run(accountId).changes,
      productionItemRequirements: db.prepare('DELETE FROM production_item_requirements WHERE account_id=?').run(accountId).changes,
      productionItems: db.prepare('DELETE FROM production_items WHERE account_id=?').run(accountId).changes,
      itemDefinitions: db.prepare('DELETE FROM item_definitions WHERE account_id=?').run(accountId).changes,
      senders: db.prepare('DELETE FROM senders WHERE account_id=?').run(accountId).changes,
    };
    db.prepare('INSERT INTO account_clears(account_id,cleared_at) VALUES(?,?) ON CONFLICT(account_id) DO UPDATE SET cleared_at=max(account_clears.cleared_at,excluded.cleared_at)').run(accountId, clearedAt);
    return { ...counts, clearedAt };
  })();
}
