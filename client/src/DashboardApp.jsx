import { ViewPane } from './components/ViewPane.jsx';
import { InventoryHistoryDialog } from './dialogs/InventoryHistoryDialog.jsx';
import { useEffect, useRef, useState } from 'react';
import { ToastStack } from './components/ToastStack.jsx';
import { OrdersTopbar } from './components/OrdersTopbar.jsx';
import { InventoryDialog } from './dialogs/InventoryDialog.jsx';
import { ProductionDialog } from './dialogs/ProductionDialog.jsx';
import { ProductionItemDialog } from './dialogs/ProductionItemDialog.jsx';
import { DeliveryDialog } from './dialogs/DeliveryDialog.jsx';
import { ReceiveDeliveryDialog } from './dialogs/ReceiveDeliveryDialog.jsx';
import { ManualPoDialog } from './dialogs/ManualPoDialog.jsx';
import { PoDetailDialog } from './dialogs/PoDetailDialog.jsx';
import { api } from './lib/api.js';
import { DEFAULT_ORDER_FILTER } from './lib/constants.js';
import { todayDate } from './lib/format.js';
import { AssembliesView } from './views/AssembliesView.jsx';
import { DeliveriesView } from './views/DeliveriesView.jsx';
import { HomeView } from './views/HomeView.jsx';
import { InventoryView } from './views/InventoryView.jsx';
import { PosPanel } from './views/OrdersView.jsx';
import { ProductionView } from './views/ProductionView.jsx';
import { SettingsView } from './views/SettingsView.jsx';

export function DashboardApp() {
  const [historyItem, setHistoryItem] = useState(null);
  const [status, setStatus] = useState(null);
  const [pos, setPos] = useState({ items: [], total: 0, counts: {} });
  const [stateFilter, setStateFilter] = useState(DEFAULT_ORDER_FILTER);
  const [sort, setSort] = useState('desc');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailMessage, setDetailMessage] = useState('');
  const [email, setEmail] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [sender, setSender] = useState('');
  const [timeZone, setTimeZone] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dismissedStatusErrors, setDismissedStatusErrors] = useState({ auth: '', collection: '' });
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [theme, setTheme] = useState(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'));
  const [view, setView] = useState('home');
  const [inventory, setInventory] = useState(null);
  const [inventoryRevision, setInventoryRevision] = useState(0);
  const [inventoryDraft, setInventoryDraft] = useState(null);
  const [inventoryBusy, setInventoryBusy] = useState(false);
  const [productionItems, setProductionItems] = useState(null);
  const [productionItemRevision, setProductionItemRevision] = useState(0);
  const [productionItemDraft, setProductionItemDraft] = useState(null);
  const [productionItemBusy, setProductionItemBusy] = useState(false);
  const [productionRuns, setProductionRuns] = useState(null);
  const [productionRevision, setProductionRevision] = useState(0);
  const [productionDraft, setProductionDraft] = useState(null);
  const [productionBusy, setProductionBusy] = useState(false);
  const [deliveries, setDeliveries] = useState(null);
  const [deliveryRevision, setDeliveryRevision] = useState(0);
  const [deliveryDraft, setDeliveryDraft] = useState(null);
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [receivingDelivery, setReceivingDelivery] = useState(null);
  const [receiveBusy, setReceiveBusy] = useState(false);
  const [addingPo, setAddingPo] = useState(false);
  const [addPoBusy, setAddPoBusy] = useState(false);
  const historyAccount = useRef(null);
  const refreshSequence = useRef(0);
  const tabsRef = useRef(null);
  const [tabIndicator, setTabIndicator] = useState(null);
  const inventoryOptions = inventory || [];

  async function refresh() {
    const sequence = ++refreshSequence.current;
    try {
      const current = await api('/api/status');
      if (sequence !== refreshSequence.current) return;
      setStatus(current);
      if (!current.auth.connected || current.auth.account?.id !== historyAccount.current) setHistoryItem(null);
      historyAccount.current = current.auth.account?.id;
      if (current.auth.connected) {
        const result = await api(`/api/pos?state=${stateFilter}&sort=${sort}&q=${encodeURIComponent(query)}&limit=25&offset=${offset}`);
        if (sequence === refreshSequence.current) setPos(result);
      } else {
        setPos({ items: [], total: 0, counts: {} });
        setSelected(null);
        setInventory(null);
        setInventoryDraft(null);
        setProductionItems(null);
        setProductionItemDraft(null);
        setProductionRuns(null);
        setProductionDraft(null);
        setDeliveries(null);
        setDeliveryDraft(null);
      }
      return true;
    } catch (failure) {
      if (sequence === refreshSequence.current) setError(failure.message);
      return false;
    }
  }

  useEffect(() => {
    if (!status?.auth.connected) return undefined;
    function measure() {
      const nav = tabsRef.current;
      if (!nav) return;
      const active = nav.querySelector('.view-tab[aria-current="page"]');
      if (!active) {
        setTabIndicator((current) => (current ? { ...current, active: false } : null));
        return;
      }
      setTabIndicator({ left: active.offsetLeft, width: active.offsetWidth, active: true });
    }
    measure();
    globalThis.addEventListener('resize', measure);
    const Observer = globalThis.ResizeObserver;
    const observer = typeof Observer === 'undefined' ? null : new Observer(measure);
    if (observer && tabsRef.current) observer.observe(tabsRef.current);
    return () => {
      globalThis.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [view, status?.auth.connected]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [stateFilter, sort, query, offset]);

  useEffect(() => {
    if (!timeZone && status?.plantTimeZone) setTimeZone(status.plantTimeZone);
  }, [status?.plantTimeZone, timeZone]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('po-checker-theme', theme); } catch { /* Storage can be unavailable. */ }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#111111' : '#ffffff');
  }, [theme]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  function changeTheme(next) {
    document.documentElement.dataset.theme = next;
    setTheme(next);
  }

  useEffect(() => {
    if (!status?.auth.connected) return undefined;
    let active = true;
    api('/api/inventory')
      .then((data) => { if (active) setInventory(data.items); })
      .catch((failure) => { if (active) { setInventory([]); setError(failure.message); } });
    return () => { active = false; };
  }, [status?.auth.connected, status?.auth.account?.id, inventoryRevision]);

  useEffect(() => {
    if (!status?.auth.connected) return undefined;
    let active = true;
    api('/api/production-items')
      .then((data) => { if (active) setProductionItems(data.items); })
      .catch((failure) => { if (active) { setProductionItems([]); setError(failure.message); } });
    return () => { active = false; };
  }, [status?.auth.connected, status?.auth.account?.id, productionItemRevision]);

  useEffect(() => {
    if (!status?.auth.connected) return undefined;
    let active = true;
    api('/api/production-runs')
      .then((data) => { if (active) setProductionRuns(data.items); })
      .catch((failure) => { if (active) { setProductionRuns([]); setError(failure.message); } });
    return () => { active = false; };
  }, [status?.auth.connected, status?.auth.account?.id, productionRevision]);

  useEffect(() => {
    if (!status?.auth.connected) return undefined;
    let active = true;
    api('/api/deliveries')
      .then((data) => { if (active) setDeliveries(data.items); })
      .catch((failure) => { if (active) { setDeliveries([]); setError(failure.message); } });
    return () => { active = false; };
  }, [status?.auth.connected, status?.auth.account?.id, deliveryRevision]);

  useEffect(() => {
    if (!selected) { setDetail(null); setDetailMessage(''); return undefined; }
    const controller = new AbortController();
    setDetail(null);
    setDetailMessage('');
    setDetailLoading(true);
    api(`/api/pos/${encodeURIComponent(selected)}`, { signal: controller.signal })
      .then(setDetail)
      .catch((failure) => { if (failure.name !== 'AbortError') setError(failure.message); })
      .finally(() => setDetailLoading(false));
    return () => controller.abort();
  }, [selected]);

  async function action(fn) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function manualRefresh() {
    setRefreshing(true);
    setError('');
    setNotice('');
    try {
      const ok = await refresh();
      if (ok === false) return;
      if (selected) {
        const current = await api(`/api/pos/${encodeURIComponent(selected)}`);
        setDetail(current);
      }
      setNotice('Purchase order assessments refreshed.');
    } catch (failure) {
      setError(failure.message);
    } finally {
      setRefreshing(false);
    }
  }

  async function poAction(poActionName, payload = {}) {
    if (!selected) return;
    setDetailMessage('');
    setDetailLoading(true);
    try {
      if (poActionName === 'approve' && !globalThis.confirm('Approve this purchase order? Approval keeps the ETA provisional.')) return;
      const result = await api(`/api/pos/${encodeURIComponent(selected)}/${poActionName}`, { method: 'POST', body: JSON.stringify(payload) });
      setDetail(result.po);
      setDetailMessage(`${poActionName === 'approve' ? 'Approved' : poActionName === 'reject' ? 'Rejected' : 'Resubmitted'} ${result.po.poId}.`);
      await refresh();
    } catch (failure) {
      setError(failure.message);
      return false;
    } finally {
      setDetailLoading(false);
    }
  }

  async function orderPo(file) {
    if (!selected) return null;
    setError('');
    setDetailMessage('');
    setDetailLoading(true);
    setBusy(true);
    try {
      const result = await api(`/api/pos/${encodeURIComponent(selected)}/order`, {
        method: 'POST',
        headers: {
          'Content-Type': file.type,
          'X-File-Name': encodeURIComponent(file.name || 'proof'),
        },
        body: file,
      });
      setDetail(result.po);
      setDetailMessage(`Ordered / Incoming ${result.po.poId}. Proof picture saved.`);
      await refresh();
      return result.po;
    } catch (failure) {
      setError(failure.message);
      throw failure;
    } finally {
      setDetailLoading(false);
      setBusy(false);
    }
  }

  async function updateProof(file) {
    if (!selected) return null;
    setError('');
    setDetailMessage('');
    setDetailLoading(true);
    setBusy(true);
    try {
      const result = await api(`/api/pos/${encodeURIComponent(selected)}/proof`, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
          'X-File-Name': encodeURIComponent(file.name || 'proof'),
        },
        body: file,
      });
      setDetail((current) => (current ? { ...current, proof: result.proof } : current));
      setDetailMessage('Proof picture updated.');
      await refresh();
      return result.proof;
    } catch (failure) {
      setError(failure.message);
      throw failure;
    } finally {
      setDetailLoading(false);
      setBusy(false);
    }
  }

  async function reschedulePo(values) {
    if (!selected) return null;
    setError('');
    setDetailMessage('');
    setDetailLoading(true);
    setBusy(true);
    try {
      const result = await api(`/api/pos/${encodeURIComponent(selected)}/schedule`, { method: 'PATCH', body: JSON.stringify(values) });
      setDetail(result.po);
      setDetailMessage('Schedule updated and correction noted.');
      await refresh();
      return result.po;
    } catch (failure) {
      setError(failure.message);
      throw failure;
    } finally {
      setDetailLoading(false);
      setBusy(false);
    }
  }

  async function correctPo(values) {
    if (!selected) return null;
    try {
      const result = await api(`/api/pos/${encodeURIComponent(selected)}`, { method: 'PATCH', body: JSON.stringify(values) });
      setDetail(result.po);
      setDetailMessage(result.po.poError ? 'Correction saved, but the record still needs attention.' : 'Correction saved and assessment rerun.');
      await refresh();
      return result.po;
    } catch (failure) {
      setError(failure.message);
      throw failure;
    }
  }

  async function saveManualPo(values) {
    setAddPoBusy(true);
    try {
      const result = await api('/api/pos', { method: 'POST', body: JSON.stringify(values) });
      setAddingPo(false);
      setNotice(`Added ${result.po.poId}.`);
      setStateFilter('pending_review');
      setOffset(0);
      await refresh();
    } finally {
      setAddPoBusy(false);
    }
  }

  const connect = (event) => {
    event.preventDefault();
    action(async () => {
      await api('/api/setup', { method: 'POST', body: JSON.stringify({ email, appPassword }) });
      setAppPassword('');
      setView('home');
      setInventory(null);
      setInventoryDraft(null);
      setProductionItems(null);
      setProductionItemDraft(null);
      setProductionRuns(null);
      setProductionDraft(null);
      setDeliveries(null);
      setDeliveryDraft(null);
    });
  };

  const addSender = (event) => {
    event.preventDefault();
    action(async () => {
      await api('/api/senders', { method: 'POST', body: JSON.stringify({ address: sender }) });
      setSender('');
    });
  };

  const removeSender = (address) => action(() => api(`/api/senders/${encodeURIComponent(address)}`, { method: 'DELETE' }));

  const saveTimeZone = (event) => {
    event.preventDefault();
    action(async () => {
      const result = await api('/api/settings', { method: 'PUT', body: JSON.stringify({ plantTimeZone: timeZone }) });
      setTimeZone(result.plantTimeZone);
      setNotice(`Plant time zone set to ${result.plantTimeZone}.`);
    });
  };

  const signOut = () => action(async () => {
    await api('/api/sign-out', { method: 'POST', body: '{}' });
    setSelected(null);
    setOffset(0);
    setView('home');
    setInventory(null);
    setInventoryDraft(null);
    setProductionItems(null);
    setProductionItemDraft(null);
    setProductionRuns(null);
    setProductionDraft(null);
    setDeliveries(null);
    setDeliveryDraft(null);
  });

  const clearOrders = () => {
    if (!globalThis.confirm('Clear all locally saved purchase orders for this account? Gmail will not be changed.')) return;
    action(async () => {
      await api('/api/emails', { method: 'DELETE' });
      setSelected(null);
      setOffset(0);
    });
  };

  const clearAllData = () => {
    if (!globalThis.confirm('Clear ALL local data for this account?\n\nThis deletes PO requests and review history, incoming proof and receipt pictures, inventory, incoming deliveries, production runs and definitions, Home visualizations, and SKUs. Your approved senders and plant time zone are kept, as is the Gmail connection. Gmail is not changed. This cannot be undone.')) return;
    action(async () => {
      await api('/api/reset', { method: 'POST', body: JSON.stringify({ confirm: true }) });
      setSelected(null);
      setOffset(0);
      setSender('');
      setInventory(null);
      setInventoryDraft(null);
      setProductionItems(null);
      setProductionItemDraft(null);
      setProductionRuns(null);
      setProductionDraft(null);
      setDeliveries(null);
      setDeliveryDraft(null);
      setInventoryRevision((revision) => revision + 1);
      setProductionItemRevision((revision) => revision + 1);
      setProductionRevision((revision) => revision + 1);
      setDeliveryRevision((revision) => revision + 1);
      setNotice('All local data cleared. Approved senders and the plant time zone were kept.');
    });
  };

  function showView(next) {
    setView(next);
    setSelected(null);
    setNotice('');
  }

  function openNewInventoryItem() {
    setInventoryDraft({ id: null, item: '', sku: '', quantity: 0, unit: 'units', supplier: '', reorderLevel: null, notes: '' });
  }

  function openInventoryItem(item) {
    setInventoryDraft({ ...item });
  }

  async function saveInventory(values) {
    setInventoryBusy(true);
    try {
      const editing = Boolean(inventoryDraft?.id);
      const url = editing ? `/api/inventory/${encodeURIComponent(inventoryDraft.id)}` : '/api/inventory';
      await api(url, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(values) });
      setInventoryDraft(null);
      setNotice(editing ? 'Inventory item saved.' : 'Inventory item added.');
      setInventoryRevision((revision) => revision + 1);
    } finally {
      setInventoryBusy(false);
    }
  }

  async function removeInventoryItem() {
    if (!inventoryDraft?.id) return;
    setInventoryBusy(true);
    try {
      await api(`/api/inventory/${encodeURIComponent(inventoryDraft.id)}`, { method: 'DELETE' });
      setInventoryDraft(null);
      setInventoryRevision((revision) => revision + 1);
    } finally {
      setInventoryBusy(false);
    }
  }

  function openNewProductionItem() {
    setProductionItemDraft({ id: null, name: '', unit: 'units', notes: '', requirements: [] });
  }

  function openProductionItem(item) {
    setProductionItemDraft({ ...item, requirements: item.requirements || [] });
  }

  async function saveProductionItem(values) {
    setProductionItemBusy(true);
    try {
      const editing = Boolean(productionItemDraft?.id);
      const url = editing ? `/api/production-items/${encodeURIComponent(productionItemDraft.id)}` : '/api/production-items';
      await api(url, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(values) });
      setProductionItemDraft(null);
      setNotice(editing ? 'Assembly saved.' : 'Assembly added.');
      setProductionItemRevision((revision) => revision + 1);
    } finally {
      setProductionItemBusy(false);
    }
  }

  async function removeProductionItem() {
    if (!productionItemDraft?.id) return;
    setProductionItemBusy(true);
    try {
      await api(`/api/production-items/${encodeURIComponent(productionItemDraft.id)}`, { method: 'DELETE' });
      setProductionItemDraft(null);
      setNotice('Assembly deleted.');
      setProductionItemRevision((revision) => revision + 1);
    } finally {
      setProductionItemBusy(false);
    }
  }

  async function openNewProductionRun() {
    try {
      const data = await api('/api/production-runs/next-number');
      setProductionDraft({ id: null, runNumber: data.runNumber, productionItemId: '', item: '', quantity: 1, unit: 'units', status: 'scheduled', scheduledDate: todayDate(), notes: '', requirements: [] });
    } catch (failure) {
      setError(failure.message);
    }
  }

  function openProductionRun(run) {
    setProductionDraft({ ...run, requirements: run.requirements || [] });
  }

  async function saveProductionRun(values) {
    setProductionBusy(true);
    try {
      const editing = Boolean(productionDraft?.id);
      const url = editing ? `/api/production-runs/${encodeURIComponent(productionDraft.id)}` : '/api/production-runs';
      await api(url, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(values) });
      setProductionDraft(null);
      setNotice(editing ? 'Production run saved.' : 'Production run added.');
      setProductionRevision((revision) => revision + 1);
    } finally {
      setProductionBusy(false);
    }
  }

  async function removeProductionRun() {
    if (!productionDraft?.id) return;
    setProductionBusy(true);
    try {
      await api(`/api/production-runs/${encodeURIComponent(productionDraft.id)}`, { method: 'DELETE' });
      setProductionDraft(null);
      setProductionRevision((revision) => revision + 1);
    } finally {
      setProductionBusy(false);
    }
  }

  function openNewDelivery() {
    setDeliveryDraft({ id: null, itemSku: '', quantity: 1, unit: 'units', expectedArrival: todayDate(), supplier: '', notes: '' });
  }

  function openDelivery(delivery) {
    setDeliveryDraft({ ...delivery });
  }

  async function saveDelivery(values, proofFile, correctionNote = '') {
    setDeliveryBusy(true);
    try {
      const editing = Boolean(deliveryDraft?.id);
      const received = deliveryDraft?.status === 'received';
      if (received && !proofFile) throw new Error('Choose a new proof picture to save.');
      if (!editing) {
        if (!proofFile) throw new Error('Upload a picture of proof that the delivery is incoming.');
        const query = new globalThis.URLSearchParams({
          itemSku: values.itemSku,
          quantity: String(values.quantity),
          unit: values.unit,
          expectedArrival: values.expectedArrival,
          supplier: values.supplier || '',
          notes: values.notes || '',
        });
        await api(`/api/deliveries/manual?${query.toString()}`, {
          method: 'POST',
          headers: {
            'Content-Type': proofFile.type,
            'X-File-Name': encodeURIComponent(proofFile.name || 'proof'),
          },
          body: proofFile,
        });
      } else if (!received) {
        await api(`/api/deliveries/${encodeURIComponent(deliveryDraft.id)}`, { method: 'PUT', body: JSON.stringify({ ...values, correctionNote }) });
        if (proofFile) {
          const proofUrl = deliveryDraft.poId
            ? `/api/pos/${encodeURIComponent(deliveryDraft.poId)}/proof`
            : `/api/deliveries/${encodeURIComponent(deliveryDraft.id)}/proof`;
          await api(proofUrl, {
            method: 'PUT',
            headers: {
              'Content-Type': proofFile.type,
              'X-File-Name': encodeURIComponent(proofFile.name || 'proof'),
            },
            body: proofFile,
          });
        }
      } else {
        if (!deliveryDraft.poId) throw new Error('This received delivery is not linked to an ordered PO.');
        await api(`/api/pos/${encodeURIComponent(deliveryDraft.poId)}/proof`, {
          method: 'PUT',
          headers: {
            'Content-Type': proofFile.type,
            'X-File-Name': encodeURIComponent(proofFile.name || 'proof'),
          },
          body: proofFile,
        });
      }
      setDeliveryDraft(null);
      setNotice(received ? 'Proof picture updated.' : proofFile ? (editing ? 'Delivery and proof saved.' : 'Delivery added with incoming proof.') : editing ? 'Delivery saved.' : 'Delivery added.');
      setDeliveryRevision((revision) => revision + 1);
      setInventoryRevision((revision) => revision + 1);
    } finally {
      setDeliveryBusy(false);
    }
  }

  function startReceive(delivery) {
    setReceivingDelivery(delivery);
  }

  async function confirmReceive(quantity, file) {
    if (!receivingDelivery) return;
    setReceiveBusy(true);
    setError('');
    try {
      const result = await api(`/api/deliveries/${encodeURIComponent(receivingDelivery.id)}/receive`, {
        method: 'POST',
        headers: {
          'Content-Type': file.type,
          'X-File-Name': encodeURIComponent(file.name || 'receipt'),
          'X-Received-Quantity': String(quantity),
        },
        body: file,
      });
      const unit = receivingDelivery.unit;
      setReceivingDelivery(null);
      setNotice(result.alreadyReceived ? 'This delivery was already received; stock was not added again.' : `Received ${quantity} ${unit}. Stock updated.`);
      setDeliveryRevision((revision) => revision + 1);
      setInventoryRevision((revision) => revision + 1);
    } catch (failure) {
      setError(failure.message);
      throw failure;
    } finally {
      setReceiveBusy(false);
    }
  }

  if (!status) {
    return (
      <main className="shell">
        
        <section className="panel loading-card" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <div>
            <h2>{error || 'Loading your dashboard…'}</h2>
            <p>{error ? 'The local server may still be starting.' : 'Reading local purchase orders.'}</p>
          </div>
          {error ? <button type="button" className="button button-secondary" onClick={refresh}>Try again</button> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      {status.auth.connected ? (
        <a className="skip-link" href={view === 'home' ? '#home' : view === 'settings' ? '#settings' : view === 'orders' ? '#orders' : view === 'deliveries' ? '#deliveries' : view === 'inventory' ? '#inventory' : view === 'assemblies' ? '#assemblies' : '#production'}>
          Skip to {view === 'home' ? 'home' : view === 'settings' ? 'settings' : view === 'orders' ? 'purchase orders' : view === 'deliveries' ? 'deliveries' : view === 'inventory' ? 'inventory' : view === 'assemblies' ? 'assemblies' : 'production'}
        </a>
      ) : null}
      {status.auth.connected ? (
        <div className="dashboard-navigation">
        <nav className="view-tabs" aria-label="Dashboard views" ref={tabsRef}>
          <button type="button" className="view-tab" aria-current={view === 'home' ? 'page' : undefined} onClick={() => showView('home')}>Home</button>
          <button type="button" className="view-tab" aria-current={view === 'orders' ? 'page' : undefined} onClick={() => showView('orders')}>Orders</button>
          <button type="button" className="view-tab" aria-current={view === 'deliveries' ? 'page' : undefined} onClick={() => showView('deliveries')}>Deliveries</button>
          <button type="button" className="view-tab" aria-current={view === 'inventory' ? 'page' : undefined} onClick={() => showView('inventory')}>Inventory</button>
          <button type="button" className="view-tab" aria-current={view === 'production' ? 'page' : undefined} onClick={() => showView('production')}>Production</button>
          <button type="button" className="view-tab" aria-current={view === 'assemblies' ? 'page' : undefined} onClick={() => showView('assemblies')}>Assemblies</button>
          {tabIndicator ? (
            <span
              className="view-tab-indicator"
              aria-hidden="true"
              style={{ left: `${tabIndicator.left}px`, width: `${tabIndicator.width}px`, opacity: tabIndicator.active ? 1 : 0 }}
            />
          ) : null}
        </nav>
        <div className="dashboard-account-navigation">
          <p className="signed-in-label">Signed in as {status.auth.account?.username}</p>
          <button type="button" className="view-tab settings-navigation" aria-current={view === 'settings' ? 'page' : undefined} onClick={() => showView('settings')}>Settings</button>
        </div>
        </div>
      ) : null}

      {!status.auth.connected ? (
        <section className="panel setup" aria-labelledby="setup-title">
          <div className="setup-copy">
            <p className="eyebrow">Gmail setup</p>
            <h2 id="setup-title">Connect your purchase order inbox</h2>
            <p className="lede">Prod. Guard reads Inbox mail with subject <strong>PO</strong>, assesses each request against stock, deliveries, and production demand, and keeps everything on this PC.</p>
            <ol className="setup-notes">
              <li><span aria-hidden="true">01</span><span>Turn on Google 2-Step Verification.</span></li>
              <li><span aria-hidden="true">02</span><span>Create a 16-character app password.</span></li>
              <li><span aria-hidden="true">03</span><span>Paste it here. Your normal Google password is never used.</span></li>
            </ol>
            <a className="text-link" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">Create an app password ↗</a>
          </div>
          <form className="setup-form" onSubmit={connect}>
            <div className="field">
              <label htmlFor="gmail-address">Gmail address</label>
              <input id="gmail-address" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@gmail.com" required />
            </div>
            <div className="field">
              <label htmlFor="gmail-password">Google app password</label>
              <input id="gmail-password" type="password" autoComplete="off" value={appPassword} onChange={(event) => setAppPassword(event.target.value)} placeholder="16-character app password" required />
            </div>
            <button type="submit" className="button button-primary setup-submit" disabled={busy}>{busy ? 'Connecting…' : 'Connect Gmail'}</button>
            <p className="hint">The app password is encrypted for your Windows user. Never enter your normal Google password.</p>
          </form>
        </section>
      ) : (
        <div className="dashboard-views" key={status.auth.account?.id}>
        <ViewPane active={view === 'settings'}>
        <SettingsView
          status={status}
          sender={sender}
          setSender={setSender}
          onAdd={addSender}
          onRemove={removeSender}
          busy={busy}
          timeZone={timeZone}
          setTimeZone={setTimeZone}
          onSaveTimeZone={saveTimeZone}
          theme={theme}
          onThemeChange={changeTheme}
          onSignOut={signOut}
          onClearAllData={clearAllData}
        />
        </ViewPane>
        <ViewPane active={view === 'home'}>
        <HomeView status={status} inventory={inventory} active={view === 'home'} />
        </ViewPane>
        <ViewPane active={view === 'orders'}>
        <>
          <OrdersTopbar
            status={status}
            counts={pos.counts || {}}
            stateFilter={stateFilter}
            setStateFilter={setStateFilter}
            setOffset={setOffset}
          />
          <div className="workspace orders-workspace">
            <PosPanel
              status={status}
              pos={pos}
              stateFilter={stateFilter}
              sort={sort}
              setSort={setSort}
              query={query}
              setQuery={setQuery}
              offset={offset}
              setOffset={setOffset}
              selected={selected}
              setSelected={setSelected}
              busy={busy}
              refreshing={refreshing}
              onAdd={() => setAddingPo(true)}
              onRefresh={manualRefresh}
              onClear={clearOrders}
            />
          </div>
        </>
        </ViewPane>
        <ViewPane active={view === 'deliveries'}>
        <DeliveriesView deliveries={deliveries} onAdd={openNewDelivery} onEdit={openDelivery} onReceive={startReceive} busy={deliveryBusy} />
        </ViewPane>
        <ViewPane active={view === 'inventory'}>
        <InventoryView items={inventory} onAdd={openNewInventoryItem} onEdit={openInventoryItem} onHistory={setHistoryItem} />
        </ViewPane>
        <ViewPane active={view === 'assemblies'}>
        <AssembliesView assemblies={productionItems} onAdd={openNewProductionItem} onEdit={openProductionItem} />
        </ViewPane>
        <ViewPane active={view === 'production'}>
        <ProductionView runs={productionRuns} onAdd={openNewProductionRun} onEdit={openProductionRun} />
        </ViewPane>
        </div>
      )}

      {selected ? (
        <PoDetailDialog
          po={detail}
          loading={detailLoading}
          error={error}
          busy={busy}
          message={detailMessage}
          skuOptions={inventoryOptions}
          onClose={() => setSelected(null)}
          onAction={poAction}
          onOrder={orderPo}
          onUpdateProof={updateProof}
          onReschedule={reschedulePo}
          onCorrect={correctPo}
        />
      ) : null}
      {addingPo ? (
        <ManualPoDialog skuOptions={inventoryOptions} busy={addPoBusy} onClose={() => { if (!addPoBusy) setAddingPo(false); }} onSave={saveManualPo} />
      ) : null}
      {historyItem && status?.auth.connected ? <InventoryHistoryDialog key={`${status.auth.account?.id}-${historyItem.id}`} item={historyItem} onClose={() => setHistoryItem(null)} /> : null}
      {inventoryDraft ? (
        <InventoryDialog draft={inventoryDraft} busy={inventoryBusy} onClose={() => { if (!inventoryBusy) setInventoryDraft(null); }} onSave={saveInventory} onDelete={removeInventoryItem} />
      ) : null}
      {productionItemDraft ? (
        <ProductionItemDialog draft={productionItemDraft} skuOptions={inventoryOptions} busy={productionItemBusy} onClose={() => { if (!productionItemBusy) setProductionItemDraft(null); }} onSave={saveProductionItem} onDelete={removeProductionItem} />
      ) : null}
      {productionDraft ? (
        <ProductionDialog draft={productionDraft} productionItems={productionItems || []} busy={productionBusy} onClose={() => { if (!productionBusy) setProductionDraft(null); }} onSave={saveProductionRun} onDelete={removeProductionRun} />
      ) : null}
      {deliveryDraft ? (
        <DeliveryDialog draft={deliveryDraft} skuOptions={inventoryOptions} busy={deliveryBusy} onClose={() => { if (!deliveryBusy) setDeliveryDraft(null); }} onSave={saveDelivery} />
      ) : null}
      {receivingDelivery ? (
        <ReceiveDeliveryDialog delivery={receivingDelivery} busy={receiveBusy} onClose={() => { if (!receiveBusy) setReceivingDelivery(null); }} onConfirm={confirmReceive} />
      ) : null}
      <ToastStack
        toasts={[
          ...(error ? [{ id: 'error', tone: 'error', message: error }] : []),
          ...(status.auth.error && dismissedStatusErrors.auth !== status.auth.error ? [{ id: 'auth-error', tone: 'error', message: status.auth.error }] : []),
          ...(status.collection.error && dismissedStatusErrors.collection !== status.collection.error ? [{ id: 'collection-error', tone: 'error', message: status.collection.error }] : []),
          ...(notice ? [{ id: 'notice', tone: 'success', message: notice }] : []),
        ]}
        onDismiss={(id) => {
          if (id === 'error') setError('');
          else if (id === 'notice') setNotice('');
          else if (id === 'auth-error') setDismissedStatusErrors((current) => ({ ...current, auth: status.auth.error || '' }));
          else setDismissedStatusErrors((current) => ({ ...current, collection: status.collection.error || '' }));
        }}
      />
    </main>
  );
}
