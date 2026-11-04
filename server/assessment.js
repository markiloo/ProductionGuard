import { addDays, daysBetween, isValidDate } from './time.js';

const MANUAL = 'Manual Review Required';
const sameUnit = (left, right) => String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();

function manual(reason, extra = {}) {
  return {
    status: 'manual',
    flag: 'manual',
    decision: reason,
    reason,
    requirement: null,
    difference: null,
    arrival: extra.arrival || null,
    provisional: extra.provisional ?? true,
    planningEnd: extra.planningEnd || null,
    needDate: null,
    daysEarly: null,
    balances: [],
    warnings: [],
    timingConflicts: [],
    stockoutDates: [],
    coveredAmount: 0,
    coverage: [],
    inventory: extra.inventory || null,
    deliveries: extra.deliveries || [],
    demand: extra.demand || [],
    note: extra.note || reason,
  };
}

/** Deterministically assess one PO against stock, deliveries, demand, and earlier POs. */
export function assessPo({ po, inventory, deliveries = [], requirements = [], earlierPos = [], today }) {
  const provisional = po.state !== 'ordered';
  const arrival = provisional ? addDays(today, po.etaDays) : po.expectedArrival;
  const base = { arrival: isValidDate(arrival) ? arrival : null, provisional };
  if (po.poStatus !== 'valid') return manual(`${MANUAL} — Invalid PO`, { ...base, note: po.poError || 'The PO data is incomplete.' });
  if (!inventory) {
    return manual(po.sku ? `${MANUAL} — Missing Inventory` : `${MANUAL} — Unmapped Item`, {
      ...base,
      note: po.sku
        ? `SKU ${po.sku} is mapped but has no inventory record. Add it in Inventory before assessment.`
        : 'Map this item to a defined SKU before assessment.',
    });
  }
  if (!sameUnit(po.unit, inventory.unit)) {
    return manual(`${MANUAL} — Unit Mismatch`, { ...base, inventory, note: `The PO uses ${po.unit || 'no unit'} but inventory for ${inventory.sku} uses ${inventory.unit}.` });
  }
  const conflictingDelivery = deliveries.find((delivery) => delivery.status !== 'received' && !sameUnit(delivery.unit, inventory.unit));
  if (conflictingDelivery) {
    return manual(`${MANUAL} — Unit Mismatch`, {
      ...base, inventory,
      note: `Delivery ${conflictingDelivery.id} uses ${conflictingDelivery.unit} but inventory for ${inventory.sku} uses ${inventory.unit}.`,
    });
  }
  const conflictingRequirement = requirements.find((requirement) => !sameUnit(requirement.unit, inventory.unit));
  if (conflictingRequirement) {
    return manual(`${MANUAL} — Unit Mismatch`, {
      ...base, inventory,
      note: `Production run ${conflictingRequirement.runNumber} uses ${conflictingRequirement.unit} but inventory for ${inventory.sku} uses ${inventory.unit}.`,
    });
  }
  if (!isValidDate(arrival)) return manual(`${MANUAL} — Invalid Arrival`, { ...base, inventory, note: 'The ETA or ordered date could not be resolved.' });

  const demand = requirements
    .filter((requirement) => requirement.status === 'outstanding' && requirement.runStatus !== 'completed')
    .sort((left, right) => left.scheduledDate.localeCompare(right.scheduledDate) || left.id.localeCompare(right.id));
  const planningEnd = demand.length ? demand[demand.length - 1].scheduledDate : null;
  if (!demand.length) {
    return manual(`${MANUAL} — No Scheduled Demand`, {
      ...base, inventory,
      note: 'This item has no outstanding production demand, so no net requirement can be calculated.',
    });
  }

  const incoming = deliveries.filter((delivery) => delivery.status === 'incoming' && isValidDate(delivery.expectedArrival));
  const coverage = earlierPos.filter((earlier) => isValidDate(earlier.arrival));

  function balanceAt(date, { includePo = true, excludeEarlier = false, excludeArrivalsOnOrAfter = null } = {}) {
    let total = inventory.quantity;
    for (const delivery of incoming) {
      if (excludeArrivalsOnOrAfter && delivery.expectedArrival >= excludeArrivalsOnOrAfter) continue;
      if (delivery.expectedArrival <= date) total += delivery.quantity;
    }
    if (!excludeEarlier) {
      for (const earlier of coverage) {
        if (excludeArrivalsOnOrAfter && earlier.arrival >= excludeArrivalsOnOrAfter) continue;
        if (earlier.arrival <= date) total += earlier.quantity;
      }
    }
    for (const requirement of demand) if (requirement.scheduledDate <= date) total -= requirement.quantity;
    if (includePo && arrival <= date) total += po.quantity;
    return total;
  }

  const runDates = demand.map((requirement) => requirement.scheduledDate);
  const evaluationDates = [...new Set([arrival, ...runDates.filter((date) => date >= arrival)])].sort();
  const balanceDates = [...new Set([arrival, ...runDates])].sort();
  const balances = balanceDates.map((date) => ({
    date,
    before: balanceAt(date, { includePo: false }),
    after: balanceAt(date, { includePo: true }),
  }));
  const lowest = Math.min(...evaluationDates.map((date) => balanceAt(date, { includePo: false })));
  const requirement = Math.max(0, -lowest);
  const difference = po.quantity - requirement;

  let decision = 'Adjust Quantity';
  let flag = 'adjust';
  if (requirement === 0) { decision = 'Redundant / Overstock'; flag = 'redundant'; }
  else if (po.quantity === requirement) { decision = 'Recommended'; flag = 'recommended'; }

  const withoutEarlier = evaluationDates.map((date) => balanceAt(date, { includePo: false, excludeEarlier: true }));
  const requirementWithoutEarlier = Math.max(0, -Math.min(...withoutEarlier));
  const coveredAmount = Math.max(0, requirementWithoutEarlier - requirement);

  const needDate = runDates.filter((date) => date >= arrival).find((date) => balanceAt(date, { includePo: false }) < 0) || null;
  const daysEarly = needDate ? daysBetween(arrival, needDate) : null;

  const warnings = [];
  const timingConflicts = [];
  for (const requirementRow of demand) {
    const runDate = requirementRow.scheduledDate;
    const withoutLate = balanceAt(runDate, { excludeArrivalsOnOrAfter: runDate, includePo: arrival < runDate });
    if (withoutLate >= 0) continue;
    const lateSources = [];
    if (arrival >= runDate) lateSources.push({ source: 'po', label: po.poId, arrival });
    for (const delivery of incoming) if (delivery.expectedArrival >= runDate) lateSources.push({ source: 'delivery', label: delivery.id, arrival: delivery.expectedArrival });
    if (!lateSources.length) continue;
    lateSources.sort((left, right) => left.arrival.localeCompare(right.arrival));
    const late = lateSources[0];
    const final = balanceAt(runDate, { includePo: true });
    timingConflicts.push({
      runDate,
      runNumber: requirementRow.runNumber,
      source: late.source,
      sourceLabel: late.label,
      sourceArrival: late.arrival,
      stockout: final < 0,
      balance: final,
    });
  }
  for (const conflict of timingConflicts) {
    warnings.push({
      type: 'timing',
      label: 'Timing Conflict / Expedite Needed',
      runDate: conflict.runDate,
      runNumber: conflict.runNumber,
      source: conflict.source,
      sourceLabel: conflict.sourceLabel,
      stockout: conflict.stockout,
    });
  }
  const stockoutDates = demand
    .filter((requirementRow) => balanceAt(requirementRow.scheduledDate, { includePo: true }) < 0)
    .map((requirementRow) => ({ runDate: requirementRow.scheduledDate, runNumber: requirementRow.runNumber, balance: balanceAt(requirementRow.scheduledDate, { includePo: true }) }));
  for (const stockout of stockoutDates) {
    warnings.push({
      type: 'stockout',
      label: 'Projected Stockout',
      runDate: stockout.runDate,
      runNumber: stockout.runNumber,
      balance: stockout.balance,
    });
  }
  if (daysEarly != null && daysEarly > 1) {
    warnings.push({ type: 'early', label: 'Arriving Early', needDate, daysEarly });
  }
  if (coveredAmount > 0) {
    warnings.push({
      type: 'duplicate',
      label: 'Potential Duplicate / Covered by Pending or Approved PO',
      coveredAmount,
    });
  }

  const parts = [];
  if (needDate) parts.push(`Needed by ${needDate}${daysEarly > 1 ? ` (${daysEarly} days early)` : daysEarly === 1 ? ' (one-day buffer met)' : ''}.`);
  parts.push(`Net requirement ${requirement}; this PO requests ${po.quantity} (${difference >= 0 ? '+' : ''}${difference}).`);
  if (timingConflicts.length) parts.push(`Late arrival is flagged for ${timingConflicts.map((conflict) => conflict.runDate).join(', ')}.`);

  return {
    status: 'assessed',
    flag,
    decision,
    reason: null,
    requirement,
    difference,
    arrival,
    provisional,
    planningEnd,
    needDate,
    daysEarly,
    balances,
    warnings,
    timingConflicts,
    stockoutDates,
    coveredAmount,
    coverage: coverage.map((earlier) => ({ poId: earlier.poId, quantity: earlier.quantity, arrival: earlier.arrival, state: earlier.state })),
    inventory,
    deliveries: incoming,
    demand: demand.map((item) => ({ id: item.id, runId: item.runId, runNumber: item.runNumber, quantity: item.quantity, unit: item.unit, scheduledDate: item.scheduledDate })),
    note: parts.join(' '),
  };
}
