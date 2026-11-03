export function isPoSubject(subject) { return String(subject || '').trim().toLowerCase() === 'po'; }

/** Convert an ETA duration such as `5 days` or `2 weeks` into whole days. */
export function parseEtaDays(eta) {
  const match = /^(\d+)\s*(day|days|week|weeks)$/i.exec(String(eta || '').trim());
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  return /^week/i.test(match[2]) ? value * 7 : value;
}

/** Validate one PO email body and return its parsed fields and review reasons. */
export function parsePo(body) {
  const fields = [...String(body || '').matchAll(/^\s*(ITEM|QUANTITY|UNIT|ETA|SUPPLIER)\s*:\s*(.*?)\s*$/gim)];
  const values = {};
  const errors = [];
  let itemCount = 0;
  for (const match of fields) {
    const name = match[1].toLowerCase();
    if (name === 'item') itemCount += 1;
    if (Object.hasOwn(values, name)) errors.push(`Duplicate ${name}`);
    else values[name] = match[2].trim();
  }
  if (itemCount > 1) errors.push('Submit a separate email for each item; only one item is allowed per PO');
  if (!values.item) errors.push('Missing item');
  else if (values.item.length > 120) errors.push('Item must be 120 characters or fewer');
  if (!/^[1-9]\d*$/.test(values.quantity || '') || !Number.isSafeInteger(Number(values.quantity))) errors.push('Quantity must be a positive whole number');
  if (!values.unit) errors.push('Missing unit');
  else if (values.unit.length > 20) errors.push('Unit must be 20 characters or fewer');
  if (!values.eta) errors.push('Missing ETA');
  else if (parseEtaDays(values.eta) == null) errors.push('ETA must be a whole number of days or weeks');
  if (!values.supplier) errors.push('Missing supplier');
  else if (values.supplier.length > 120) errors.push('Supplier must be 120 characters or fewer');
  return {
    item: values.item || null,
    quantity: /^[1-9]\d*$/.test(values.quantity || '') && Number.isSafeInteger(Number(values.quantity)) ? Number(values.quantity) : null,
    unit: values.unit ? values.unit.toLowerCase() : null,
    eta: values.eta ? values.eta.toLowerCase() : null,
    supplier: values.supplier || null,
    poStatus: errors.length ? 'needs_review' : 'valid',
    poError: errors.join('; ') || null,
  };
}
