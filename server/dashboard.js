import { randomUUID } from 'node:crypto';
import { addDays, isValidDate } from './time.js';

export const DEFAULT_HORIZON_DAYS = 30;
export const MAX_HORIZON_DAYS = 365;

const widgetColumns = 'id, type, sku, horizon_days AS horizonDays, position, created_at AS createdAt, updated_at AS updatedAt';

function text(value) { return String(value ?? '').trim(); }

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function inventoryItem(db, accountId, sku) {
  return db.prepare(`SELECT id, item, sku, quantity, unit, reorder_level AS reorderLevel, updated_at AS updatedAt
    FROM inventory WHERE account_id=? AND sku=? COLLATE NOCASE AND trim(sku) <> ''`).get(accountId, sku) || null;
}

/** Validate a Home visualization request against the account inventory. */
export function parseWidgetInput(db, accountId, body) {
  const value = body && typeof body === 'object' ? body : {};
  const sku = text(value.sku ?? value.itemSku);
  const horizonDays = Number(value.horizonDays);
  if (!sku) throw fail('Choose an inventory SKU.');
  const item = inventoryItem(db, accountId, sku);
  if (!item) throw fail('Choose an existing inventory SKU.');
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > MAX_HORIZON_DAYS) {
    throw fail(`Choose a horizon between 1 and ${MAX_HORIZON_DAYS} days.`);
  }
  return { sku: item.sku, horizonDays };
}

/** List an account's Home visualizations in display order. */
export function listDashboardWidgets(db, accountId) {
  return db.prepare(`SELECT ${widgetColumns} FROM dashboard_widgets WHERE account_id=? ORDER BY position, created_at, id`).all(accountId);
}

function getDashboardWidget(db, accountId, id) {
  return db.prepare(`SELECT ${widgetColumns} FROM dashboard_widgets WHERE account_id=? AND id=?`).get(accountId, id) || null;
}

/** Append one visualization to the account dashboard. */
export function createDashboardWidget(db, accountId, input, now) {
  const id = randomUUID();
  const position = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM dashboard_widgets WHERE account_id=?').get(accountId).next;
  db.prepare(`INSERT INTO dashboard_widgets(account_id,id,type,sku,horizon_days,position,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?)`).run(accountId, id, 'inventory_projection', input.sku, input.horizonDays, position, now, now);
  return getDashboardWidget(db, accountId, id);
}

/** Update one account-owned visualization; returns null when it is missing. */
export function updateDashboardWidget(db, accountId, id, input, now) {
  const result = db.prepare('UPDATE dashboard_widgets SET sku=?, horizon_days=?, updated_at=? WHERE account_id=? AND id=?')
    .run(input.sku, input.horizonDays, now, accountId, id);
  return result.changes ? getDashboardWidget(db, accountId, id) : null;
}

/** Delete one account-owned visualization; returns false when it is missing. */
export function deleteDashboardWidget(db, accountId, id) {
  return db.prepare('DELETE FROM dashboard_widgets WHERE account_id=? AND id=?').run(accountId, id).changes > 0;
}

function sameUnit(left, right) {
  return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();
}

/**
 * Project one item's on-hand balance from plant-local today through the horizon.
 * Confirmed supply only: stock on hand plus unreceived deliveries, minus
 * outstanding demand from runs that are not completed. Records whose unit does
 * not match inventory are excluded rather than converted.
 */
export function projectStock(db, accountId, sku, horizonDays, today) {
  const inventory = inventoryItem(db, accountId, sku);
  if (!inventory) return null;
  const horizon = Math.min(MAX_HORIZON_DAYS, Math.max(1, Number(horizonDays) || DEFAULT_HORIZON_DAYS));
  const endDate = addDays(today, horizon);
  if (!endDate) return null;

  const deliveries = db.prepare(`SELECT id, quantity, unit, expected_arrival AS expectedArrival, supplier, po_id AS poId
    FROM incoming_deliveries WHERE account_id=? AND item_sku=? COLLATE NOCASE AND status='incoming' AND expected_arrival <= ?
    ORDER BY expected_arrival, id`).all(accountId, inventory.sku, endDate)
    .filter((delivery) => isValidDate(delivery.expectedArrival));
  const requirements = db.prepare(`SELECT r.id, r.quantity, r.unit, p.scheduled_date AS scheduledDate, p.run_number AS runNumber
    FROM production_requirements r
    JOIN production_runs p ON p.account_id=r.account_id AND p.id=r.run_id
    WHERE r.account_id=? AND r.item_sku=? COLLATE NOCASE AND r.status='outstanding' AND p.status <> 'completed' AND p.scheduled_date <= ?
    ORDER BY p.scheduled_date, p.run_number`).all(accountId, inventory.sku, endDate)
    .filter((requirement) => isValidDate(requirement.scheduledDate));

  const includedDeliveries = deliveries.filter((delivery) => sameUnit(delivery.unit, inventory.unit));
  const includedRequirements = requirements.filter((requirement) => sameUnit(requirement.unit, inventory.unit));
  const excluded = {
    deliveries: deliveries.length - includedDeliveries.length,
    requirements: requirements.length - includedRequirements.length,
  };

  const deliveriesByDate = new Map();
  for (const delivery of includedDeliveries) {
    if (!deliveriesByDate.has(delivery.expectedArrival)) deliveriesByDate.set(delivery.expectedArrival, []);
    deliveriesByDate.get(delivery.expectedArrival).push(delivery);
  }
  const demandByDate = new Map();
  for (const requirement of includedRequirements) {
    if (!demandByDate.has(requirement.scheduledDate)) demandByDate.set(requirement.scheduledDate, []);
    demandByDate.get(requirement.scheduledDate).push(requirement);
  }

  let balance = inventory.quantity;
  for (const delivery of includedDeliveries) if (delivery.expectedArrival < today) balance += delivery.quantity;
  for (const requirement of includedRequirements) if (requirement.scheduledDate < today) balance -= requirement.quantity;

  const points = [];
  const stockoutDates = [];
  for (let offset = 0; offset <= horizon; offset += 1) {
    const date = addDays(today, offset);
    for (const delivery of deliveriesByDate.get(date) || []) balance += delivery.quantity;
    for (const requirement of demandByDate.get(date) || []) balance -= requirement.quantity;
    points.push({ date, balance });
    if (balance < 0) stockoutDates.push({ date, balance });
  }

  const balances = points.map((point) => point.balance);
  return {
    sku: inventory.sku,
    item: inventory.item,
    unit: inventory.unit,
    startDate: today,
    endDate,
    horizonDays: horizon,
    currentBalance: points[0].balance,
    endBalance: balances[balances.length - 1],
    minBalance: Math.min(...balances),
    reorderLevel: inventory.reorderLevel,
    nextArrival: includedDeliveries.length ? includedDeliveries[0].expectedArrival : null,
    stockoutDates,
    excluded,
    points,
  };
}

/** Build the Home dashboard payload: widgets, the next arrivals, and active runs. */
export function buildHome(db, accountId, today) {
  const widgets = listDashboardWidgets(db, accountId).map((widget) => ({
    ...widget,
    projection: projectStock(db, accountId, widget.sku, widget.horizonDays, today),
  })).filter((widget) => widget.projection);

  const incoming = db.prepare(`SELECT d.id, d.item_sku AS itemSku, i.item AS itemName, d.quantity, d.unit,
    d.expected_arrival AS expectedArrival, d.supplier, d.po_id AS poId
    FROM incoming_deliveries d
    LEFT JOIN inventory i ON i.account_id = d.account_id AND i.sku = d.item_sku COLLATE NOCASE
    WHERE d.account_id=? AND d.status='incoming'
    ORDER BY d.expected_arrival, d.id`).all(accountId)
    .map((delivery) => ({ ...delivery, overdue: delivery.expectedArrival < today }));

  const runs = db.prepare(`SELECT id, run_number AS runNumber, item, quantity, unit, status,
    scheduled_date AS scheduledDate, completed_quantity AS completedQuantity
    FROM production_runs
    WHERE account_id=? AND (status='in_progress' OR (status='scheduled' AND scheduled_date=?))
    ORDER BY CASE status WHEN 'in_progress' THEN 0 ELSE 1 END, scheduled_date, run_number`).all(accountId, today)
    .map((run) => ({
      ...run,
      percent: run.quantity > 0 ? Math.min(100, Math.round((run.completedQuantity / run.quantity) * 100)) : 0,
    }));

  return { today, widgets, incoming, runs };
}
