// Add demo inventory, assemblies, runs, deliveries, Home visualizations, and
// pending POs to the connected account. Existing records are reused by name or
// SKU, so running this again only fills in what is missing.
// Usage: start the app, then run `node scripts/seed-demo.mjs`.
const BASE = process.env.PO_CHECKER_URL || 'http://127.0.0.1:4174';

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

async function api(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Origin: BASE,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} failed (${response.status}): ${body?.error || String(text).slice(0, 160)}`);
  return body;
}

const status = await api('/api/status');
if (!status.auth.connected) {
  console.error('Connect a Gmail account in the app before seeding demo data.');
  process.exit(1);
}
const today = status.today;
const created = { inventory: 0, assemblies: 0, runs: 0, deliveries: 0, visualizations: 0, pos: 0 };
const skipped = [];

const inventoryNow = await api('/api/inventory');
const inventoryBySku = new Map(inventoryNow.items.map((item) => [item.sku.toLowerCase(), item]));
const inventorySpecs = [
  { item: 'Cardboard', sku: 'CARD', quantity: 30, unit: 'units', supplier: 'BoxCo', reorderLevel: 0, notes: 'Demo data' },
  { item: 'Glue', sku: 'GLUE', quantity: 8, unit: 'units', supplier: 'AdhesivePro', reorderLevel: 0, notes: 'Demo data' },
  { item: 'Candle Wax', sku: 'WAX', quantity: 25, unit: 'units', supplier: 'WaxWorks', reorderLevel: 0, notes: 'Demo data' },
  { item: 'Glass Case', sku: 'CASE', quantity: 4, unit: 'units', supplier: 'GlassWorks', reorderLevel: 0, notes: 'Demo data' },
  { item: 'Candle Wick', sku: 'WICK', quantity: 40, unit: 'units', supplier: 'WickSupply', reorderLevel: 0, notes: 'Demo data' },
  { item: 'Packaging Tape', sku: 'TAPE', quantity: 50, unit: 'units', supplier: 'TapeCo', reorderLevel: 0, notes: 'Demo data' },
];
for (const spec of inventorySpecs) {
  if (inventoryBySku.has(spec.sku.toLowerCase())) { skipped.push(`inventory ${spec.sku}`); continue; }
  const item = (await api('/api/inventory', { method: 'POST', body: JSON.stringify(spec) })).item;
  inventoryBySku.set(item.sku.toLowerCase(), item);
  created.inventory += 1;
}

const assembliesNow = await api('/api/production-items');
const assemblyByName = new Map(assembliesNow.items.map((item) => [item.name.toLowerCase(), item]));
const assemblySkus = new Set(assembliesNow.items.map((item) => String(item.sku || '').toLowerCase()).filter(Boolean));
function uniqueAssemblySku(base) {
  let sku = base;
  let suffix = 2;
  while (inventoryBySku.has(sku.toLowerCase()) || assemblySkus.has(sku.toLowerCase())) {
    sku = `${base}-${suffix}`;
    suffix += 1;
  }
  return sku;
}
const assemblySpecs = [
  { name: 'Packaging Box', sku: 'ASM-PACKAGING-BOX', unit: 'units', notes: 'Demo assembly', requirements: [{ itemSku: 'CARD', quantity: 2, unit: 'units' }, { itemSku: 'GLUE', quantity: 1, unit: 'units' }] },
  { name: 'Candle with a Case', sku: 'ASM-CANDLE-CASE', unit: 'units', notes: 'Demo assembly', requirements: [{ itemSku: 'WAX', quantity: 2, unit: 'units' }, { itemSku: 'CASE', quantity: 1, unit: 'units' }, { itemSku: 'WICK', quantity: 1, unit: 'units' }] },
  { name: 'Candle with no Case', sku: 'ASM-CANDLE-NO-CASE', unit: 'units', notes: 'Demo assembly', requirements: [{ itemSku: 'WAX', quantity: 1, unit: 'units' }, { itemSku: 'WICK', quantity: 1, unit: 'units' }] },
];
for (const spec of assemblySpecs) {
  if (assemblyByName.has(spec.name.toLowerCase())) { skipped.push(`assembly ${spec.name}`); continue; }
  const item = (await api('/api/production-items', { method: 'POST', body: JSON.stringify({ ...spec, sku: uniqueAssemblySku(spec.sku) }) })).item;
  assemblyByName.set(item.name.toLowerCase(), item);
  assemblySkus.add(String(item.sku).toLowerCase());
  created.assemblies += 1;
}

const runsNow = await api('/api/production-runs');
if (runsNow.items.length) {
  skipped.push('production runs');
} else {
  async function createRun({ assembly, quantity, status: runStatus, scheduledDate }) {
    const { runNumber } = await api('/api/production-runs/next-number');
    const body = { runNumber, productionItemId: assembly.id, quantity, status: runStatus, scheduledDate, notes: 'Demo run' };
    return (await api('/api/production-runs', { method: 'POST', body: JSON.stringify(body) })).item;
  }
  const runA = await createRun({ assembly: assemblyByName.get('packaging box'), quantity: 20, status: 'in_progress', scheduledDate: addDays(today, 7) });
  await createRun({ assembly: assemblyByName.get('candle with a case'), quantity: 10, status: 'scheduled', scheduledDate: today });
  await createRun({ assembly: assemblyByName.get('candle with no case'), quantity: 15, status: 'scheduled', scheduledDate: addDays(today, 14) });
  await api(`/api/production_runs/${encodeURIComponent(runA.id)}`, { method: 'PATCH', body: JSON.stringify({ completedQuantity: 12 }) });
  created.runs = 3;
}

const deliveriesNow = await api('/api/deliveries');
if (deliveriesNow.items.some((delivery) => delivery.status === 'incoming')) {
  skipped.push('incoming deliveries');
} else {
  const deliverySpecs = [
    { itemSku: 'CASE', quantity: 10, unit: 'units', expectedArrival: addDays(today, 3), supplier: 'GlassWorks', notes: 'Demo delivery' },
    { itemSku: 'GLUE', quantity: 5, unit: 'units', expectedArrival: addDays(today, 5), supplier: 'AdhesivePro', notes: 'Demo delivery' },
    { itemSku: 'WICK', quantity: 20, unit: 'units', expectedArrival: addDays(today, 8), supplier: 'WickSupply', notes: 'Demo delivery' },
  ];
  for (const spec of deliverySpecs) await api('/api/deliveries', { method: 'POST', body: JSON.stringify(spec) });
  created.deliveries = deliverySpecs.length;
}

const dashboardNow = await api('/api/dashboard');
const widgetSkus = new Set(dashboardNow.widgets.map((widget) => widget.sku.toLowerCase()));
const widgetSpecs = [
  { sku: 'GLUE', horizonDays: 30 },
  { sku: 'WAX', horizonDays: 45 },
  { sku: 'CARD', horizonDays: 14 },
  { sku: 'WICK', horizonDays: 60 },
];
for (const spec of widgetSpecs) {
  if (widgetSkus.has(spec.sku.toLowerCase())) { skipped.push(`visualization ${spec.sku}`); continue; }
  await api('/api/dashboard/widgets', { method: 'POST', body: JSON.stringify(spec) });
  widgetSkus.add(spec.sku.toLowerCase());
  created.visualizations += 1;
}

const posNow = await api('/api/pos?state=all');
if (posNow.total) {
  skipped.push('purchase orders');
} else {
  const poSpecs = [
    { item: 'GLUE', mappedSku: 'GLUE', quantity: 7, unit: 'units', etaDays: 6, supplier: 'AdhesivePro' },
    { item: 'CARD', mappedSku: 'CARD', quantity: 10, unit: 'units', etaDays: 9, supplier: 'BoxCo' },
    { item: 'WICK', mappedSku: 'WICK', quantity: 10, unit: 'units', etaDays: 5, supplier: 'WickSupply' },
  ];
  for (const spec of poSpecs) await api('/api/pos', { method: 'POST', body: JSON.stringify(spec) });
  created.pos = poSpecs.length;
}

console.log(`Demo data ready for ${status.auth.account.username} (plant date ${today}).`);
console.log(`Added: ${created.inventory} inventory · ${created.assemblies} assemblies · ${created.runs} runs · ${created.deliveries} deliveries · ${created.visualizations} visualizations · ${created.pos} POs`);
if (skipped.length) console.log(`Kept existing: ${[...new Set(skipped)].join(', ')}`);
