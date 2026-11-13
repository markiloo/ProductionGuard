// Isolated UI preview. Never imports server modules, credentials, or SQLite.
// Run: node scripts/visual-preview.mjs; stop with Ctrl+C.
// Append ?preview=setup|empty|error|loading to any app route for state checks.
import { createServer } from 'vite';

const stamp = '2026-11-13T06:00:00.000Z';
const today = '2026-11-13';
const inventory = [
  { id: 'inv-1', sku: 'ST-204', item: 'Stainless steel mounting plate', quantity: 120, unit: 'pieces', supplier: 'Northline Materials', reorderLevel: 150, notes: 'Grade 304 · inspect surface finish', updatedAt: stamp },
  { id: 'inv-2', sku: 'BLT-M8', item: 'M8 hex bolt', quantity: 2400, unit: 'pieces', supplier: 'Precision Fasteners', reorderLevel: 500, notes: '', updatedAt: stamp },
];
const materials = [{ id: 'mat-1', itemSku: 'ST-204', quantity: 2, unit: 'pieces', status: 'outstanding' }, { id: 'mat-2', itemSku: 'BLT-M8', quantity: 8, unit: 'pieces', status: 'outstanding' }];
const assemblies = [{ id: 'assembly-1', name: 'Industrial support bracket', unit: 'assemblies', notes: 'Standard mounting assembly', requirements: materials }];
const runs = [{ id: 'run-1', runNumber: 'PR-0012', item: assemblies[0].name, productionItemId: 'assembly-1', quantity: 100, unit: 'assemblies', completedQuantity: 35, scheduledDate: today, status: 'in_progress', notes: 'Priority customer batch', updatedAt: stamp, requirements: materials.map(m => ({ ...m, quantity: m.quantity * 100 })) }];
const image = { createdAt: stamp, mimeType: 'image/svg+xml', fileName: 'preview-proof.svg' };
const deliveries = [{ id: 'delivery-1', itemSku: 'ST-204', quantity: 80, unit: 'pieces', supplier: 'Northline Materials', expectedArrival: '2026-11-15', status: 'incoming', poId: 'PO-0003', proof: image, notes: 'Inspect packaging on arrival' }, { id: 'delivery-2', itemSku: 'BLT-M8', quantity: 500, receivedQuantity: 490, unit: 'pieces', supplier: 'Precision Fasteners', expectedArrival: today, receivedAt: stamp, status: 'received', receipt: image }];
const assessment = { status: 'assessed', decision: 'Recommended', flag: 'recommended', requirement: 80, difference: 0, arrival: '2026-11-15', provisional: true, planningEnd: '2026-11-18', needDate: '2026-11-16', daysEarly: 1, note: 'Net requirement 80; this PO requests 80. Arrival meets the one-day buffer.', inventory: inventory[0], warnings: [], balances: [{ date: '2026-11-16', before: -80, after: 0 }, { date: '2026-11-18', before: -80, after: 0 }], deliveries: [], demand: [{ id: 'demand-1', runNumber: 'PR-0012', scheduledDate: '2026-11-16', quantity: 200, unit: 'pieces' }], coverage: [] };
const pos = ['pending_review', 'pending_review', 'approved', 'ordered', 'unverified', 'rejected'].map((state, i) => ({ id: `mail-${i}`, poId: `PO-${String(i + 1).padStart(4, '0')}`, state, item: i === 1 ? 'M8 hex bolt' : inventory[0].item, sku: i === 1 ? 'BLT-M8' : 'ST-204', mappedSku: 'ST-204', quantity: i === 1 ? 500 : 80, unit: 'pieces', eta: '2 days', etaDays: 2, supplier: 'Northline Materials', senderAddress: 'orders@example.test', senderName: 'Northline purchasing', receivedAt: stamp, poStatus: state === 'unverified' ? 'needs_review' : 'valid', poError: state === 'unverified' ? 'Sender is not authorized' : null, body: 'ITEM: ST-204\nQUANTITY: 80\nUNIT: pieces\nETA: 2 days\nSUPPLIER: Northline Materials', events: [], assessment: i === 1 ? { ...assessment, decision: 'Adjust Quantity', flag: 'adjust', requirement: 300, difference: 200, warnings: [{ type: 'early', daysEarly: 4, needDate: '2026-11-19' }] } : assessment }));
const counts = Object.fromEntries(['pending_review', 'approved', 'ordered', 'unverified', 'rejected'].map(state => [state, pos.filter(po => po.state === state).length]));
counts.all = pos.length;
const preview = await createServer({ server: { host: '127.0.0.1', port: 5180, strictPort: true }, plugins: [{ name: 'isolated-visual-fixtures', configureServer(server) {
  server.middlewares.use('/api', async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const path = url.pathname;
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') { res.writeHead(409, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Visual preview is read-only. No business data was changed.' })); return; }
    const scenario = new URL(req.headers.referer || '/', 'http://127.0.0.1:5180').searchParams.get('preview');
    if (scenario === 'error') { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Preview connection interrupted. Try again.' })); return; }
    if (scenario === 'loading') await new Promise(resolve => setTimeout(resolve, 8000));
    if (/\/(proof|receipt)$/.test(path)) { res.setHeader('Content-Type', 'image/svg+xml'); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#f4f4f4"/><text x="40" y="80" font-family="sans-serif" font-size="28">Illustrative incoming proof</text><text x="40" y="130" font-family="sans-serif" font-size="18">Fixture only · no real documents</text></svg>'); return; }
    let data;
    if (path === '/status') data = { auth: { connected: true, account: { id: 'preview', username: 'preview@example.test' } }, collection: { cutoff: stamp, nextCheckAt: Date.now() + 15000, lastSuccessAt: stamp, currentRunCount: 6, collecting: false }, senders: ['orders@example.test'], counts, totalCount: pos.length, today, plantTimeZone: 'Asia/Manila', features: { clearSavedInbox: true } };
    else if (path === '/pos') { const state = url.searchParams.get('state'); const query = (url.searchParams.get('q') || '').toLowerCase(); const items = pos.filter(po => (!state || state === 'all' || po.state === state) && JSON.stringify(po).toLowerCase().includes(query)); data = { items, total: items.length, counts }; }
    else if (path.startsWith('/pos/')) data = pos.find(po => po.poId === decodeURIComponent(path.split('/')[2]));
    else if (path.endsWith('/history')) data = { items: [{ id: 1, kind: 'Starting balance', beforeQuantity: 120, afterQuantity: 120, beforeUnit: 'pieces', unit: 'pieces', createdAt: stamp }], total: 1, item: inventory[0] };
    else if (path === '/inventory') data = { items: inventory };
    else if (path === '/deliveries') data = { items: deliveries };
    else if (path === '/production-items') data = { items: assemblies };
    else if (path === '/production-runs/next-number') data = { runNumber: 'PR-0013' };
    else if (path === '/production-runs' || path === '/production_runs') data = { items: runs, today };
    if (scenario === 'setup' && path === '/status') data = { ...data, auth: { connected: false, account: null }, senders: [], counts: {}, totalCount: 0 };
    if (scenario === 'empty') {
      if (Array.isArray(data?.items)) data = { ...data, items: [], total: 0, counts: {} };
      if (path === '/status') data = { ...data, counts: {}, totalCount: 0, collection: { ...data.collection, currentRunCount: 0 } };
    }
    res.setHeader('Content-Type', 'application/json'); res.statusCode = data ? 200 : 404; res.end(JSON.stringify(data || { error: 'Preview fixture not found.' }));
  });
} }] });
await preview.listen();
console.log('Isolated visual preview: http://127.0.0.1:5180 (read-only fixtures)');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await preview.close(); process.exit(0); });
