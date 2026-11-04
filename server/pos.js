import { randomUUID } from 'node:crypto';
import { assessPo } from './assessment.js';
import { parseEtaDays } from './po.js';
import { normalizeSender } from './rules.js';
import { addDays, isValidDate } from './time.js';

const PO_COLUMNS = `message_id AS id, po_id AS poId, po_state AS state, po_status AS poStatus, po_error AS poError,
  item, mapped_sku AS mappedSku, quantity, unit, eta, eta_days AS etaDays, supplier,
  expected_arrival AS expectedArrival, ordered_at AS orderedAt, sender_address AS senderAddress,
  sender_name AS senderName, subject, received_at AS receivedAt, preview, body, has_attachments AS hasAttachments`;
const STATES = new Set(['unverified', 'pending_review', 'approved', 'ordered', 'rejected']);

function fail(message, status = 409) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/** Suggest the next sequential PO ID for an account. */
export function nextPoId(db, accountId) {
  const row = db.prepare("SELECT po_id FROM emails WHERE account_id=? AND po_id IS NOT NULL ORDER BY po_id DESC LIMIT 1").get(accountId);
  const last = row ? Number(String(row.po_id).replace(/\D/g, '')) : 0;
  return `PO-${String(last + 1).padStart(4, '0')}`;
}

function inventoryRows(db, accountId) {
  return db.prepare('SELECT id, item, sku, quantity, unit, updated_at AS updatedAt FROM inventory WHERE account_id=? ORDER BY item COLLATE NOCASE').all(accountId);
}

function deliveryRows(db, accountId) {
  return db.prepare(`SELECT id, item_sku AS itemSku, quantity, unit, expected_arrival AS expectedArrival, supplier,
    status, received_at AS receivedAt, po_id AS poId, notes FROM incoming_deliveries WHERE account_id=? ORDER BY expected_arrival, id`).all(accountId);
}

function requirementRows(db, accountId) {
  return db.prepare(`SELECT r.id, r.run_id AS runId, p.run_number AS runNumber, r.item_sku AS itemSku, r.quantity, r.unit,
    r.status, p.scheduled_date AS scheduledDate, p.status AS runStatus
    FROM production_requirements r
    JOIN production_runs p ON p.account_id = r.account_id AND p.id = r.run_id
    WHERE r.account_id=? ORDER BY p.scheduled_date, p.run_number`).all(accountId);
}

function effectiveSku(po, inventoryBySku) {
  if (po.mappedSku) return po.mappedSku;
  return inventoryBySku.get(String(po.item || '').toLowerCase())?.sku || null;
}

/** Build the assessment input shared by every PO for one account. */
export function buildContext(db, accountId, today) {
  const inventory = inventoryRows(db, accountId);
  const inventoryBySku = new Map();
  for (const item of inventory) {
    if (item.sku && !inventoryBySku.has(item.sku.toLowerCase())) inventoryBySku.set(item.sku.toLowerCase(), item);
  }
  const deliveries = deliveryRows(db, accountId);
  const requirements = requirementRows(db, accountId);
  const pos = db.prepare(`SELECT ${PO_COLUMNS} FROM emails WHERE account_id=? AND po_state IS NOT NULL ORDER BY received_at, po_id`).all(accountId);
  const enriched = pos.map((po) => {
    const sku = effectiveSku(po, inventoryBySku);
    return { ...po, sku, arrival: po.state === 'ordered' ? po.expectedArrival : addDays(today, po.etaDays) };
  });
  return { inventory, inventoryBySku, deliveries, requirements, pos: enriched };
}

/** Assess one PO using an existing account context. */
export function assessWithContext(context, po, today) {
  const sku = po.sku || '';
  const key = sku.toLowerCase();
  const inventory = context.inventoryBySku.get(key) || null;
  const unit = inventory?.unit;
  const deliveries = context.deliveries.filter((delivery) => delivery.itemSku.toLowerCase() === key);
  const requirements = context.requirements.filter((requirement) => requirement.itemSku.toLowerCase() === key);
  const earlierPos = context.pos.filter((candidate) => {
    if (candidate.id === po.id) return false;
    if (candidate.state !== 'pending_review' && candidate.state !== 'approved') return false;
    if (!candidate.sku || candidate.sku.toLowerCase() !== key) return false;
    if (!isValidDate(candidate.arrival)) return false;
    if (String(candidate.unit).toLowerCase() !== String(unit || '').toLowerCase()) return false;
    const order = String(candidate.receivedAt).localeCompare(String(po.receivedAt)) || String(candidate.poId).localeCompare(String(po.poId));
    return order < 0;
  }).map((candidate) => ({ poId: candidate.poId, quantity: candidate.quantity, arrival: candidate.arrival, state: candidate.state }));
  return assessPo({ po, inventory, deliveries, requirements, earlierPos, today });
}

function summary(assessment) {
  return {
    flag: assessment.flag,
    decision: assessment.decision,
    reason: assessment.reason,
    requirement: assessment.requirement,
    difference: assessment.difference,
    arrival: assessment.arrival,
    provisional: assessment.provisional,
    planningEnd: assessment.planningEnd,
    needDate: assessment.needDate,
    daysEarly: assessment.daysEarly,
    warnings: assessment.warnings,
    coveredAmount: assessment.coveredAmount,
    stockoutDates: assessment.stockoutDates,
  };
}

/** List account POs with their assessment, filter, search, sort, and pagination. */
export function listPos(db, { accountId, state = 'pending_review', sort = 'desc', query = '', limit = 25, offset = 0, today }) {
  const context = buildContext(db, accountId, today);
  const needle = String(query || '').trim().toLowerCase();
  let rows = context.pos;
  if (state && state !== 'all') rows = rows.filter((po) => po.state === state);
  if (needle) {
    rows = rows.filter((po) => [po.poId, po.item, po.sku, po.supplier, po.senderAddress, po.senderName, po.subject, po.mappedSku,
      po.receivedAt, po.expectedArrival, po.eta].some((value) => String(value || '').toLowerCase().includes(needle)));
  }
  rows = [...rows].sort((left, right) => {
    const byTime = String(left.receivedAt).localeCompare(String(right.receivedAt)) || String(left.poId).localeCompare(String(right.poId));
    return sort === 'asc' ? byTime : -byTime;
  });
  const total = rows.length;
  const page = rows.slice(offset, offset + limit).map((po) => {
    const assessment = assessWithContext(context, po, today);
    return {
      id: po.id,
      poId: po.poId,
      state: po.state,
      poStatus: po.poStatus,
      poError: po.poError,
      item: po.item,
      sku: po.sku,
      mappedSku: po.mappedSku,
      quantity: po.quantity,
      unit: po.unit,
      eta: po.eta,
      etaDays: po.etaDays,
      supplier: po.supplier,
      expectedArrival: po.expectedArrival,
      orderedAt: po.orderedAt,
      senderAddress: po.senderAddress,
      senderName: po.senderName,
      receivedAt: po.receivedAt,
      hasAttachments: po.hasAttachments,
      assessment: summary(assessment),
    };
  });
  const counts = { all: context.pos.length };
  for (const po of context.pos) counts[po.state] = (counts[po.state] || 0) + 1;
  return { items: page, total, counts };
}

/** Fetch one PO with its full assessment breakdown and event history. */
export function getPo(db, accountId, poId, today) {
  const context = buildContext(db, accountId, today);
  const po = context.pos.find((row) => row.poId === poId || row.id === poId);
  if (!po) return null;
  const assessment = assessWithContext(context, po, today);
  const events = db.prepare('SELECT id, type, reason, created_at AS createdAt FROM po_events WHERE account_id=? AND po_id=? ORDER BY created_at, id').all(accountId, po.poId);
  const delivery = db.prepare(`SELECT id, item_sku AS itemSku, quantity, unit, expected_arrival AS expectedArrival, supplier, status, received_at AS receivedAt
    FROM incoming_deliveries WHERE account_id=? AND po_id=?`).get(accountId, po.poId) || null;
  const proof = db.prepare('SELECT mime_type AS mimeType, file_name AS fileName, created_at AS createdAt FROM po_proofs WHERE account_id=? AND po_id=?').get(accountId, po.poId) || null;
  return { ...po, assessment, events, delivery, proof };
}

function getStateRow(db, accountId, poId) {
  return db.prepare(`SELECT ${PO_COLUMNS} FROM emails WHERE account_id=? AND (po_id=? OR message_id=?)`).get(accountId, poId, poId) || null;
}

function recordEvent(db, accountId, poId, type, reason, now) {
  db.prepare('INSERT INTO po_events(account_id,id,po_id,type,reason,created_at) VALUES(?,?,?,?,?,?)').run(accountId, randomUUID(), poId, type, reason, now);
}

/** Replace the incoming proof picture for an ordered PO. */
export function setPoProof(db, accountId, poId, proof, now) {
  if (!proof?.data?.length) throw fail('Upload a picture of proof that this order is incoming.', 400);
  const po = db.prepare('SELECT po_state FROM emails WHERE account_id=? AND po_id=?').get(accountId, poId);
  if (po) {
    if (po.po_state !== 'ordered') throw fail('Proof can only be changed for an Ordered/Incoming PO.', 409);
  } else {
    const linked = db.prepare('SELECT 1 FROM incoming_deliveries WHERE account_id=? AND po_id=?').get(accountId, poId);
    if (!linked) return null;
  }
  db.prepare(`INSERT INTO po_proofs(account_id,po_id,mime_type,file_name,data,created_at) VALUES(?,?,?,?,?,?)
    ON CONFLICT(account_id,po_id) DO UPDATE SET mime_type=excluded.mime_type, file_name=excluded.file_name, data=excluded.data, created_at=excluded.created_at`)
    .run(accountId, poId, proof.mimeType || 'image/jpeg', proof.fileName || '', proof.data, now);
  return db.prepare('SELECT mime_type AS mimeType, file_name AS fileName, created_at AS createdAt FROM po_proofs WHERE account_id=? AND po_id=?').get(accountId, poId);
}

/** Revise an approved PO's ETA or an ordered PO's delivery date, recording the reason. */
export function schedulePo(db, accountId, poId, input, { today, now }) {
  const po = getStateRow(db, accountId, poId);
  if (!po) return null;
  const note = String(input?.note || '').trim();
  if (!note) throw fail('Enter a note for the schedule change.', 400);
  if (note.length > 500) throw fail('The correction note must be 500 characters or fewer.', 400);
  if (po.state === 'approved') {
    const days = Number(input?.etaDays);
    if (!Number.isInteger(days) || days <= 0 || days > 3650) throw fail('ETA must be a whole number of days greater than 0.', 400);
    if (days === po.etaDays) throw fail('The ETA has not changed.', 400);
    db.transaction(() => {
      db.prepare('UPDATE emails SET eta=?, eta_days=? WHERE account_id=? AND po_id=?').run(`${days} days`, days, accountId, po.poId);
      recordEvent(db, accountId, po.poId, 'corrected', `ETA changed from ${po.etaDays ?? 'unknown'} days to ${days} days — ${note}`, now);
    })();
  } else if (po.state === 'ordered') {
    if (!isValidDate(input?.expectedArrival)) throw fail('Choose a valid delivery date.', 400);
    if (input.expectedArrival === po.expectedArrival) throw fail('The delivery date has not changed.', 400);
    const delivery = db.prepare('SELECT id, status FROM incoming_deliveries WHERE account_id=? AND po_id=?').get(accountId, po.poId);
    if (delivery?.status === 'received') throw fail('Received deliveries cannot be rescheduled.', 409);
    db.transaction(() => {
      db.prepare('UPDATE emails SET expected_arrival=? WHERE account_id=? AND po_id=?').run(input.expectedArrival, accountId, po.poId);
      if (delivery) db.prepare('UPDATE incoming_deliveries SET expected_arrival=?, updated_at=? WHERE account_id=? AND id=?').run(input.expectedArrival, now, accountId, delivery.id);
      recordEvent(db, accountId, po.poId, 'corrected', `Delivery date changed from ${po.expectedArrival || 'none'} to ${input.expectedArrival} — ${note}`, now);
    })();
  } else {
    throw fail('Only Approved or Ordered/Incoming POs can be rescheduled.', 409);
  }
  return getPo(db, accountId, po.poId, today);
}
export function transitionPo(db, accountId, poId, action, { reason = '', today, now, proof = null }) {
  const po = getStateRow(db, accountId, poId);
  if (!po) return null;
  const context = buildContext(db, accountId, today);
  const enriched = context.pos.find((row) => row.poId === po.poId) || po;
  if (action === 'approve') {
    if (po.state !== 'pending_review') throw fail('Only Pending Review POs can be approved.');
    db.prepare("UPDATE emails SET po_state='approved' WHERE account_id=? AND po_id=?").run(accountId, po.poId);
    recordEvent(db, accountId, po.poId, 'approved', '', now);
  } else if (action === 'reject') {
    if (po.state !== 'pending_review' && po.state !== 'approved') throw fail('Only Pending Review or Approved POs can be rejected.');
    if (!String(reason || '').trim()) throw fail('Enter a rejection reason.', 400);
    db.prepare("UPDATE emails SET po_state='rejected' WHERE account_id=? AND po_id=?").run(accountId, po.poId);
    recordEvent(db, accountId, po.poId, 'rejected', String(reason).trim(), now);
  } else if (action === 'order') {
    if (po.state !== 'approved') throw fail('Only Approved POs can be set to Ordered/Incoming.');
    if (!proof?.data?.length) throw fail('Upload a picture of proof that this order is incoming.', 400);
    if (!enriched.sku) throw fail('Map this item to an inventory SKU before ordering.');
    const inventory = context.inventoryBySku.get(enriched.sku.toLowerCase());
    if (!inventory) throw fail('The mapped inventory item no longer exists.');
    if (String(po.unit).toLowerCase() !== String(inventory.unit).toLowerCase()) throw fail(`Correct the unit mismatch before ordering (${inventory.sku} uses ${inventory.unit}).`);
    if (!Number.isInteger(po.etaDays) || po.etaDays <= 0) throw fail('This PO has no valid ETA duration.');
    const expectedArrival = addDays(today, po.etaDays);
    db.transaction(() => {
      db.prepare("UPDATE emails SET po_state='ordered', ordered_at=?, expected_arrival=? WHERE account_id=? AND po_id=?").run(now, expectedArrival, accountId, po.poId);
      const existing = db.prepare('SELECT id FROM incoming_deliveries WHERE account_id=? AND po_id=?').get(accountId, po.poId);
      if (existing) {
        db.prepare('UPDATE incoming_deliveries SET item_sku=?, quantity=?, unit=?, expected_arrival=?, supplier=?, updated_at=? WHERE account_id=? AND id=?')
          .run(enriched.sku, po.quantity, po.unit, expectedArrival, po.supplier || '', now, accountId, existing.id);
      } else {
        db.prepare(`INSERT INTO incoming_deliveries(account_id,id,item_sku,quantity,unit,expected_arrival,supplier,status,received_at,po_id,notes,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(accountId, randomUUID(), enriched.sku, po.quantity, po.unit, expectedArrival, po.supplier || '', 'incoming', null, po.poId, '', now, now);
      }
      db.prepare(`INSERT INTO po_proofs(account_id,po_id,mime_type,file_name,data,created_at) VALUES(?,?,?,?,?,?)
        ON CONFLICT(account_id,po_id) DO UPDATE SET mime_type=excluded.mime_type, file_name=excluded.file_name, data=excluded.data, created_at=excluded.created_at`)
        .run(accountId, po.poId, proof.mimeType || 'image/jpeg', proof.fileName || '', proof.data, now);
      recordEvent(db, accountId, po.poId, 'ordered', '', now);
    })();
  } else if (action === 'resubmit') {
    if (po.state !== 'rejected') throw fail('Only Rejected POs can be resubmitted.');
    if (po.poStatus !== 'valid') throw fail('Correct the PO fields before resubmitting.');
    const authorized = db.prepare('SELECT 1 FROM senders WHERE account_id=? AND normalized_address=?').get(accountId, normalizeSender(po.senderAddress));
    if (!authorized) throw fail('This sender is not authorized; resubmission cannot bypass sender authorization.');
    db.prepare("UPDATE emails SET po_state='pending_review' WHERE account_id=? AND po_id=?").run(accountId, po.poId);
    recordEvent(db, accountId, po.poId, 'resubmitted', '', now);
  } else {
    throw fail('Unknown PO action.', 400);
  }
  return getPo(db, accountId, po.poId, today);
}

function text(value) { return String(value ?? '').trim(); }

/** Correct an unverified, pending, or rejected PO while preserving its identity. */
export function correctPo(db, accountId, poId, input, { today, now }) {
  const po = getStateRow(db, accountId, poId);
  if (!po) return null;
  if (!['unverified', 'pending_review', 'rejected'].includes(po.state)) throw fail('Approved and Ordered POs must be rejected before revision.');
  const inventory = inventoryRows(db, accountId);
  const body = input && typeof input === 'object' ? input : {};
  const item = text(body.item ?? po.item);
  const quantityValue = body.quantity ?? po.quantity;
  const quantity = Number(quantityValue);
  const unit = text(body.unit ?? po.unit);
  const supplier = text(body.supplier ?? po.supplier);
  const etaDaysRaw = body.etaDays ?? (body.eta != null ? parseEtaDays(body.eta) : po.etaDays);
  const etaDays = Number(etaDaysRaw);
  const mappedInput = body.mappedSku != null ? text(body.mappedSku) : (body.sku != null ? text(body.sku) : po.mappedSku || '');
  const errors = [];
  if (!item) errors.push('Missing item');
  if (item.length > 120) errors.push('Item must be 120 characters or fewer');
  if (!Number.isInteger(quantity) || quantity <= 0) errors.push('Quantity must be a positive whole number');
  if (!unit) errors.push('Missing unit');
  if (unit.length > 20) errors.push('Unit must be 20 characters or fewer');
  if (!supplier) errors.push('Missing supplier');
  if (supplier.length > 120) errors.push('Supplier must be 120 characters or fewer');
  if (!Number.isInteger(etaDays) || etaDays <= 0) errors.push('ETA must be a whole number of days or weeks');
  let mappedSku = null;
  if (mappedInput) {
    const matched = inventory.find((row) => row.sku.toLowerCase() === mappedInput.toLowerCase());
    if (!matched) errors.push('Choose an existing inventory SKU');
    else {
      mappedSku = matched.sku;
      if (unit && String(matched.unit).toLowerCase() !== unit.toLowerCase()) errors.push(`Unit must match inventory for ${matched.sku} (${matched.unit})`);
    }
  }
  const authorized = Boolean(db.prepare('SELECT 1 FROM senders WHERE account_id=? AND normalized_address=?').get(accountId, normalizeSender(po.senderAddress)));
  if (!authorized) errors.push('Sender is not authorized');
  const valid = errors.length === 0;
  const nextState = po.state === 'unverified' ? (valid ? 'pending_review' : 'unverified') : po.state;
  db.prepare(`UPDATE emails SET item=?, quantity=?, unit=?, eta=?, eta_days=?, supplier=?, mapped_sku=?, po_status=?, po_error=?, po_state=? WHERE account_id=? AND po_id=?`)
    .run(item, Number.isInteger(quantity) && quantity > 0 ? quantity : null, unit || null, etaDays > 0 ? `${etaDays} days` : null, Number.isInteger(etaDays) && etaDays > 0 ? etaDays : null, supplier || null, mappedSku, valid ? 'valid' : 'needs_review', errors.join('; ') || null, nextState, accountId, po.poId);
  recordEvent(db, accountId, po.poId, 'corrected', '', now);
  return getPo(db, accountId, po.poId, today);
}

export function isPoState(value) { return STATES.has(value); }

/** Promote queued mail from a newly authorized sender back into Pending Review. */
export function authorizeQueuedMail(db, accountId, normalizedAddress) {
  const rows = db.prepare("SELECT message_id, po_error FROM emails WHERE account_id=? AND po_state='unverified' AND lower(sender_address)=?").all(accountId, normalizedAddress);
  const update = db.prepare('UPDATE emails SET po_state=?, po_status=?, po_error=? WHERE account_id=? AND message_id=?');
  for (const row of rows) {
    const reasons = String(row.po_error || '').split('; ').filter((reason) => reason && reason !== 'Sender is not authorized');
    const valid = reasons.length === 0;
    update.run(valid ? 'pending_review' : 'unverified', valid ? 'valid' : 'needs_review', reasons.join('; ') || null, accountId, row.message_id);
  }
}
