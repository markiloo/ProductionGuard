export function isPoSubject(subject) { return String(subject || '').trim().toLowerCase() === 'po'; }

export function parsePo(body) {
  const fields = [...String(body || '').matchAll(/^\s*(ITEM|Quantity|Unit|ETA)\s*:\s*(.*?)\s*$/gim)];
  const names = ['item', 'quantity', 'unit', 'eta'];
  const values = {};
  const errors = [];
  for (const match of fields) {
    const name = match[1].toLowerCase();
    if (Object.hasOwn(values, name)) errors.push(`Duplicate ${name}`);
    else values[name] = match[2].trim();
  }
  if (!values.item) errors.push('Missing item');
  if (!/^[1-9]\d*$/.test(values.quantity || '') || !Number.isSafeInteger(Number(values.quantity))) errors.push('Quantity must be a positive whole number');
  if (!/^(kg|units)$/i.test(values.unit || '')) errors.push('Unit must be kg or units');
  if (!/^(1 week|2 weeks)$/i.test(values.eta || '')) errors.push('ETA must be 1 week or 2 weeks');
  const ordered = fields.map((match) => match[1].toLowerCase());
  if (ordered.length === 4 && ordered.some((name, index) => name !== names[index])) errors.push('Fields must be in ITEM, Quantity, Unit, ETA order');
  return { item: values.item || null, quantity: /^[1-9]\d*$/.test(values.quantity || '') && Number.isSafeInteger(Number(values.quantity)) ? Number(values.quantity) : null, unit: /^(kg|units)$/i.test(values.unit || '') ? values.unit.toLowerCase() : null, eta: /^(1 week|2 weeks)$/i.test(values.eta || '') ? values.eta.toLowerCase() : null, poStatus: errors.length ? 'needs_review' : 'valid', poError: errors.join('; ') || null };
}
