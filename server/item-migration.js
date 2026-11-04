/**
 * Copy SKU definitions that have no inventory row into inventory at zero stock.
 * Existing inventory rows win, so a definition never overwrites real stock data.
 */
export function copyItemDefinitionsToInventory(db) {
  const result = db.prepare(`INSERT INTO inventory(account_id,id,item,sku,quantity,unit,created_at,updated_at)
    SELECT d.account_id, 'seed-' || d.id, d.item, d.sku, 0, d.unit, d.created_at, d.updated_at
    FROM item_definitions d
    WHERE NOT EXISTS (
      SELECT 1 FROM inventory i
      WHERE i.account_id = d.account_id AND i.sku = d.sku COLLATE NOCASE
    )`).run();
  return result.changes;
}
