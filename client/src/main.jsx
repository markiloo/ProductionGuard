import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

const fullDate = (value) => value
  ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
  : 'Not yet';

const metricDate = (value) => value
  ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : 'Not yet';

const PRODUCTION_STATUS = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  on_hold: 'On hold',
};

const PO_STATES = {
  pending_review: 'Pending review',
  unverified: 'Unverified',
  approved: 'Approved',
  ordered: 'Ordered / Incoming',
  rejected: 'Rejected',
};

const ORDER_FILTERS = [
  { value: 'pending_review', label: 'Pending review' },
  { value: 'unverified', label: 'Unverified' },
  { value: 'approved', label: 'Approved' },
  { value: 'ordered', label: 'Ordered / Incoming' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All orders' },
];

const FLAG_LABEL = {
  recommended: 'Recommended',
  redundant: 'Redundant / Overstock',
  adjust: 'Adjust Quantity',
  manual: 'Manual Review Required',
};

const WARNING_LABEL = {
  timing: 'Timing Conflict / Expedite Needed',
  early: 'Arriving Early',
  duplicate: 'Potential Duplicate',
  stockout: 'Projected Stockout',
};

function scheduleDate(value) {
  if (!value) return '—';
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function todayDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function shortDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function warningText(warning) {
  if (warning.type === 'early') return `Arriving Early — need date ${warning.needDate}, ${warning.daysEarly} day${warning.daysEarly === 1 ? '' : 's'} early`;
  if (warning.type === 'timing') return `Timing Conflict / Expedite Needed — ${warning.runNumber} on ${warning.runDate}${warning.stockout ? ' (stockout)' : ''}`;
  if (warning.type === 'duplicate') return `Potential Duplicate / Covered by Pending or Approved PO — ${warning.coveredAmount} covered`;
  if (warning.type === 'stockout') return `Projected Stockout — ${warning.runNumber} on ${warning.runDate} (${warning.balance})`;
  return warning.label || warning.type;
}

function useSheetDialog(onClose) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog?.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const handleCancel = (event) => { event.preventDefault(); onClose(); };
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onClose]);

  return dialogRef;
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="m13.2 13.2 3.3 3.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">PO</span>
      <div>
        <h1 className="brand-title">PO Checker</h1>
        <span className="brand-sub">Purchase order review</span>
      </div>
    </div>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="3.1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 2.4v1.8M10 15.8v1.8M2.4 10h1.8M15.8 10h1.8M4.6 4.6l1.3 1.3M14.1 14.1l1.3 1.3M15.4 4.6l-1.3 1.3M5.9 14.1l-1.3 1.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M16.1 12.3A6.4 6.4 0 0 1 7.7 3.9a6.5 6.5 0 1 0 8.4 8.4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function ThemeToggle({ theme, onChange }) {
  return (
    <div className="theme-toggle" role="group" aria-label="Color theme">
      <button type="button" className="theme-option" aria-pressed={theme === 'light'} aria-label="Light theme" onClick={() => onChange('light')}>
        <SunIcon />
        <span>Light</span>
      </button>
      <button type="button" className="theme-option" aria-pressed={theme === 'dark'} aria-label="Dark theme" onClick={() => onChange('dark')}>
        <MoonIcon />
        <span>Dark</span>
      </button>
    </div>
  );
}

function ToastStack({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-stack" role="region" aria-label="Notifications">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.tone || 'success'}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
          <p className="toast-message">{toast.message}</p>
          <button type="button" className="icon-button" onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification">×</button>
        </div>
      ))}
    </div>
  );
}

function StateChip({ state }) {
  return <span className={`state-chip state-${state}`}>{PO_STATES[state] || state}</span>;
}

function AssessmentChip({ assessment }) {
  if (!assessment) return null;
  return (
    <span className={`assessment-chip flag-${assessment.flag}`} title={assessment.note || assessment.reason || assessment.decision}>
      <span className="status-dot" aria-hidden="true" />
      {FLAG_LABEL[assessment.flag] || assessment.decision}
    </span>
  );
}

function ProductionStatusChip({ status }) {
  return (
    <span className={`status-chip ${status.split('_').join('-')}`}>
      <span className="status-dot" aria-hidden="true" />
      {PRODUCTION_STATUS[status] || status}
    </span>
  );
}

function RunStrip({ status }) {
  const { collection, senders, totalCount } = status;
  const nextCheckAt = collection.nextCheckAt ?? null;
  const countdown = () => {
    if (nextCheckAt == null) return null;
    const now = Date.now();
    let target = nextCheckAt;
    if (target <= now) target += Math.ceil((now - target + 1) / 15000) * 15000;
    return Math.max(0, Math.ceil((target - now) / 1000));
  };
  const [secondsUntilCheck, setSecondsUntilCheck] = useState(() => countdown());
  useEffect(() => {
    if (nextCheckAt == null) {
      setSecondsUntilCheck(null);
      return undefined;
    }
    const update = () => setSecondsUntilCheck(countdown());
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [nextCheckAt]);
  const polling = senders.length > 0;
  const label = collection.error ? 'Attention needed' : collection.collecting ? 'Checking now' : senders.length ? 'Monitoring' : 'Ready';
  const note = collection.error || (senders.length ? 'Polls every 15 seconds' : 'Add a sender to begin');
  return (
    <section className="run-strip" aria-label="Collector status">
      <div className="metric">
        <span className="metric-label">Collector</span>
        <strong className={collection.error ? 'text-danger' : ''}>{label}</strong>
        <small>{note}</small>
      </div>
      <div className="metric">
        <span className="metric-label">Next inbox check</span>
        <strong>{secondsUntilCheck == null ? '—' : `${secondsUntilCheck}s`}</strong>
        <small>{!polling ? 'Add a sender to begin' : collection.collecting ? 'Checking now · Gmail polls every 15 seconds' : 'Gmail poll every 15 seconds'}</small>
      </div>
      <div className="metric">
        <span className="metric-label">Last complete check</span>
        <strong title={fullDate(collection.lastSuccessAt)}>{metricDate(collection.lastSuccessAt)}</strong>
        <small>{collection.currentRunCount} saved this run</small>
      </div>
      <div className="metric">
        <span className="metric-label">Saved</span>
        <strong>{totalCount}</strong>
        <small>{senders.length} approved {senders.length === 1 ? 'sender' : 'senders'}</small>
      </div>
    </section>
  );
}

function SettingsView({ status, sender, setSender, onAdd, onRemove, busy, timeZone, setTimeZone, onSaveTimeZone, onClearAllData }) {
  return (
    <section className="panel settings-panel" id="settings" tabIndex={-1} aria-labelledby="settings-title">
      <header className="panel-head record-head">
        <div>
          <p className="eyebrow">Configuration</p>
          <h2 id="settings-title">Settings</h2>
        </div>
        <span className="count">{status.auth.account?.username}</span>
      </header>
      <div className="settings-grid">
        <section className="settings-section" aria-labelledby="senders-title">
          <div className="settings-head">
            <div>
              <p className="eyebrow">Allowlist</p>
              <h3 id="senders-title">Approved senders</h3>
            </div>
            <span className="count">{status.senders.length}</span>
          </div>
          <p className="settings-copy">Only subject-PO mail from these exact addresses is collected. Other PO mail stays in the unverified queue with a reason. Adding a sender also promotes that sender's queued mail back into Pending Review.</p>
          <form className="sender-form" onSubmit={onAdd}>
            <label className="sr-only" htmlFor="sender-address">Sender email address</label>
            <input id="sender-address" type="email" value={sender} onChange={(event) => setSender(event.target.value)} placeholder="name@example.com" autoComplete="off" required />
            <button type="submit" className="button button-primary button-small" disabled={busy}>Add</button>
          </form>
          {status.senders.length > 0 ? (
            <ul className="sender-list">
              {status.senders.map((address) => (
                <li key={address}>
                  <span>{address}</span>
                  <button type="button" className="button button-ghost button-small remove" onClick={() => onRemove(address)} aria-label={`Remove ${address}`}>Remove</button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sender-empty">No approved senders yet. Add one above to start collecting.</p>
          )}
        </section>

        <section className="settings-section" aria-labelledby="timezone-title">
          <div className="settings-head">
            <div>
              <p className="eyebrow">Calendar</p>
              <h3 id="timezone-title">Plant time zone</h3>
            </div>
            <span className="count">{status.today}</span>
          </div>
          <p className="settings-copy">Provisional ETAs, the daily assessment refresh, and every calendar-day decision use this zone. The default is <strong>Asia/Manila</strong>.</p>
          <form className="sender-form" onSubmit={onSaveTimeZone}>
            <label className="sr-only" htmlFor="plant-time-zone">Plant time zone</label>
            <input id="plant-time-zone" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} placeholder="Asia/Manila" autoComplete="off" required />
            <button type="submit" className="button button-primary button-small" disabled={busy}>Save</button>
          </form>
          <p className="hint">Current plant date: {status.today}. Use an IANA zone such as Asia/Manila.</p>
        </section>
      </div>
      <section className="settings-danger" aria-labelledby="clear-data-title">
        <div>
          <p className="eyebrow">Danger zone</p>
          <h3 id="clear-data-title">Clear all data</h3>
          <p className="settings-copy">Delete all local test data for this account: PO requests and review history, incoming proof and receipt pictures, inventory, incoming deliveries, production runs and definitions, and SKUs. Your approved senders and plant time zone are kept, as is the Gmail connection. Gmail is not changed. This cannot be undone.</p>
        </div>
        <button type="button" className="button button-danger" onClick={onClearAllData} disabled={busy}>Clear all data…</button>
      </section>
    </section>
  );
}

function PoRow({ item, selected, onSelect }) {
  const assessment = item.assessment;
  const meta = [item.supplier, item.senderName || item.senderAddress].filter(Boolean);
  const warnings = (assessment.warnings || []).map((warning) => WARNING_LABEL[warning.type]).filter(Boolean);
  return (
    <button
      type="button"
      className={`po-row${selected ? ' is-selected' : ''}`}
      data-status={assessment.flag}
      onClick={onSelect}
      aria-haspopup="dialog"
      aria-expanded={selected}
    >
      <span className="po-main">
        <span className="po-top">
          <span className="po-id">{item.poId}</span>
          <strong className="po-item">{item.item || 'Unmapped item'}</strong>
          <span className="po-qty">{item.quantity == null ? 'No quantity' : `${item.quantity} ${item.unit || ''}`.trim()}</span>
          <AssessmentChip assessment={assessment} />
        </span>
        <span className="po-meta">{meta.join(' · ') || 'No supplier'}</span>
        {warnings.length ? <span className="po-warnings">{[...new Set(warnings)].join(' · ')}</span> : null}
      </span>
      <span className="po-side">
        <StateChip state={item.state} />
        <span className="po-eta">{item.eta ? `ETA ${item.eta}` : 'No ETA'}</span>
        <time className="po-time" dateTime={item.receivedAt} title={fullDate(item.receivedAt)}>{shortDate(item.receivedAt)}</time>
        {item.hasAttachments ? <span className="po-attachment">Attachment</span> : null}
      </span>
    </button>
  );
}

function OrderNav({ counts, stateFilter, setStateFilter, setOffset }) {
  return (
    <aside className="panel order-nav" aria-labelledby="order-nav-title">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Queues</p>
          <h2 id="order-nav-title">Orders</h2>
        </div>
      </div>
      <nav aria-label="Order status">
        {ORDER_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={`order-nav-item${stateFilter === filter.value ? ' is-current' : ''}${filter.value === 'all' ? ' order-nav-all' : ''}`}
            aria-current={stateFilter === filter.value ? 'page' : undefined}
            onClick={() => { setStateFilter(filter.value); setOffset(0); }}
          >
            <span>{filter.label}</span>
            <span className="count">{counts[filter.value] || 0}</span>
          </button>
        ))}
      </nav>
      <p className="order-nav-hint">New POs appear after the next inbox check.</p>
    </aside>
  );
}

function PosPanel({ status, pos, stateFilter, sort, setSort, query, setQuery, offset, setOffset, selected, setSelected, busy, refreshing, onAdd, onRefresh, onClear }) {
  const emptyCopy = stateFilter === 'unverified'
    ? { title: 'No unverified orders', body: 'Incomplete, unauthorized, or multi-item PO mail appears here with its reason.' }
    : stateFilter === 'rejected'
      ? { title: 'No rejected orders', body: 'Rejected POs stay visible with their rejection history.' }
      : stateFilter === 'approved'
        ? { title: 'No approved orders', body: 'Approved POs wait here until they are ordered or rejected.' }
        : stateFilter === 'ordered'
          ? { title: 'No ordered orders', body: 'Ordered POs create one linked incoming delivery.' }
          : { title: 'No purchase orders yet', body: 'New subject-PO messages will appear here for review.' };
  return (
    <section className="panel inbox" id="orders" tabIndex={-1} aria-labelledby="orders-title">
      <header className="panel-head inbox-head">
        <div>
          <p className="eyebrow">Purchase orders</p>
          <h2 id="orders-title">{stateFilter === 'all' ? 'All orders' : PO_STATES[stateFilter] || 'Review queue'}</h2>
        </div>
        <div className="inbox-actions">
          <span className="count">{pos.total} {pos.total === 1 ? 'order' : 'orders'}</span>
          <button type="button" className="button button-primary button-small" onClick={onAdd} disabled={busy}>Add PO</button>
          <button type="button" className="button button-secondary button-small" onClick={onRefresh} disabled={refreshing} aria-label="Recompute purchase order assessments">
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          {status.features?.clearSavedInbox ? (
            <button type="button" className="button button-danger-ghost button-small" disabled={!status.totalCount || busy} onClick={onClear}>Clear saved</button>
          ) : null}
        </div>
      </header>
      <div className="tools">
        <label className="search-field">
          <span className="sr-only">Search purchase orders</span>
          <SearchIcon />
          <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0); }} placeholder="Search PO ID, item, SKU, supplier, or sender" />
        </label>
        <button type="button" className="button button-secondary button-small" onClick={() => { setSort(sort === 'desc' ? 'asc' : 'desc'); setOffset(0); }}>
          {sort === 'desc' ? 'Newest first' : 'Oldest first'}
        </button>
      </div>
      <div className="po-list">
        {pos.items.map((item) => (
          <PoRow key={item.id} item={item} selected={selected === item.poId} onSelect={() => setSelected(item.poId)} />
        ))}
        {!pos.items.length ? (
          <div className="empty">
            <span className="empty-mark" aria-hidden="true">PO</span>
            {query ? (
              <>
                <strong>No orders match “{query}”</strong>
                <p>Try a different search, or switch status.</p>
              </>
            ) : (
              <>
                <strong>{emptyCopy.title}</strong>
                <p>{emptyCopy.body}</p>
              </>
            )}
          </div>
        ) : null}
      </div>
      <footer className="pagination">
        <button type="button" className="button button-secondary button-small" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))}>Newer</button>
        <span>{pos.total ? `${offset + 1}–${Math.min(offset + 25, pos.total)} of ${pos.total}` : '0 orders'}</span>
        <button type="button" className="button button-secondary button-small" disabled={offset + 25 >= pos.total} onClick={() => setOffset(offset + 25)}>Older</button>
      </footer>
    </section>
  );
}

function InventoryRow({ item, onEdit }) {
  const lowStock = item.reorderLevel != null && item.quantity <= item.reorderLevel;
  const meta = [item.supplier, item.reorderLevel != null ? `Reorder at ${item.reorderLevel} ${item.unit}` : null].filter(Boolean).join(' · ');
  return (
    <div className="inventory-row">
      <div className="inventory-main">
        <div className="inventory-top">
          <strong className="inventory-name">{item.item}</strong>
          {item.sku ? <span className="inventory-sku">{item.sku}</span> : <span className="status-chip review">Missing SKU</span>}
          {lowStock ? <span className="status-chip review">Low stock</span> : null}
        </div>
        <span className="inventory-meta">{meta || 'No supplier'}</span>
        {item.notes ? <span className="inventory-notes">{item.notes}</span> : null}
      </div>
      <div className="inventory-side">
        <span className="inventory-qty">{item.quantity}<small>{item.unit}</small></span>
        <time className="inventory-updated" dateTime={item.updatedAt} title={fullDate(item.updatedAt)}>Updated {shortDate(item.updatedAt)}</time>
      </div>
      <button type="button" className="button button-ghost button-small inventory-edit" onClick={() => onEdit(item)} aria-label={`Edit ${item.item}`}>Edit</button>
    </div>
  );
}

function InventoryView({ items, onAdd, onEdit }) {
  const [query, setQuery] = useState('');
  const filtered = items ? items.filter((item) => [item.item, item.sku, item.supplier].some((value) => String(value || '').toLowerCase().includes(query.trim().toLowerCase()))) : null;
  const lowStock = filtered ? filtered.filter((item) => item.reorderLevel != null && item.quantity <= item.reorderLevel).length : 0;
  const lastUpdated = items && items.length
    ? items.reduce((latest, item) => (item.updatedAt > latest ? item.updatedAt : latest), items[0].updatedAt)
    : null;
  return (
    <section className="panel record-panel inventory" id="inventory" tabIndex={-1} aria-labelledby="inventory-title">
      <header className="panel-head record-head">
        <div>
          <p className="eyebrow">Stock</p>
          <h2 id="inventory-title">Inventory</h2>
        </div>
        <div className="record-actions">
          <span className="count">{items ? `${items.length} ${items.length === 1 ? 'item' : 'items'}` : '—'}</span>
          <button type="button" className="button button-primary button-small" onClick={onAdd}>Add item</button>
        </div>
      </header>
      {items === null ? (
        <div className="record-loading" role="status"><span className="spinner" aria-hidden="true" />Loading inventory…</div>
      ) : (
        <>
          <div className="record-summary">
            <div><span className="metric-label">Items</span><strong>{items.length}</strong></div>
            <div><span className="metric-label">Low stock</span><strong className={lowStock ? 'text-danger' : ''}>{lowStock}</strong></div>
            <div><span className="metric-label">Last updated</span><strong>{lastUpdated ? metricDate(lastUpdated) : '—'}</strong></div>
          </div>
          <div className="tools">
            <label className="search-field">
              <span className="sr-only">Search inventory</span>
              <SearchIcon />
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search item, SKU, or supplier" />
            </label>
          </div>
          <div className="record-list">
            {(filtered || []).map((item) => <InventoryRow key={item.id} item={item} onEdit={onEdit} />)}
            {!filtered?.length ? (
              <div className="empty">
                <span className="empty-mark" aria-hidden="true">ST</span>
                <strong>{query ? 'No inventory matches' : 'No inventory items yet'}</strong>
                <p>{query ? 'Try a different item, SKU, or supplier.' : 'Add an item with a unique SKU to start tracking stock.'}</p>
                {!query ? <button type="button" className="button button-secondary button-small" onClick={onAdd}>Add your first item</button> : null}
              </div>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

function InventoryDialog({ draft, busy, onClose, onSave, onDelete }) {
  const dialogRef = useSheetDialog(onClose);
  const editing = Boolean(draft.id);
  const [item, setItem] = useState(draft.item || '');
  const [sku, setSku] = useState(draft.sku || '');
  const [quantity, setQuantity] = useState(String(draft.quantity ?? 0));
  const [unit, setUnit] = useState(draft.unit || 'units');
  const [supplier, setSupplier] = useState(draft.supplier || '');
  const [reorderLevel, setReorderLevel] = useState(draft.reorderLevel == null ? '' : String(draft.reorderLevel));
  const [notes, setNotes] = useState(draft.notes || '');
  const [formError, setFormError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setFormError('');
    try {
      await onSave({ item, sku, quantity: Number(quantity), unit, supplier, reorderLevel: reorderLevel === '' ? null : Number(reorderLevel), notes });
    } catch (failure) {
      setFormError(failure.message);
    }
  }

  async function remove() {
    if (!globalThis.confirm(`Delete “${item}” from inventory? This cannot be undone.`)) return;
    setFormError('');
    try { await onDelete(); } catch (failure) { setFormError(failure.message); }
  }

  return (
    <dialog ref={dialogRef} className="detail inventory-dialog" aria-labelledby="inventory-dialog-title">
      <header className="detail-head">
        <div><p className="eyebrow">Inventory</p><h2 id="inventory-dialog-title">{editing ? 'Edit inventory item' : 'Add inventory item'}</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close inventory form" disabled={busy}>×</button>
      </header>
      <form className="detail-body inventory-form" onSubmit={submit}>
        <div className="form-grid">
          <div className="field field-wide">
            <label htmlFor="inventory-item">Item name</label>
            <input id="inventory-item" value={item} onChange={(event) => setItem(event.target.value)} maxLength={120} placeholder="e.g. Carton Glue" required autoFocus={!editing} />
          </div>
          <div className="field">
            <label htmlFor="inventory-sku">Item code (SKU)</label>
            <input id="inventory-sku" value={sku} onChange={(event) => setSku(event.target.value)} maxLength={60} placeholder="e.g. SKU-0001" required readOnly={editing && Boolean(draft.sku)} aria-readonly={editing && Boolean(draft.sku)} />
            <p className="field-hint">{editing && draft.sku ? 'The SKU is fixed for an existing inventory item.' : 'Adding this inventory item defines the SKU used by POs, deliveries, assemblies, and demand.'}</p>
          </div>
          <div className="field">
            <label htmlFor="inventory-supplier">Supplier</label>
            <input id="inventory-supplier" value={supplier} onChange={(event) => setSupplier(event.target.value)} maxLength={120} placeholder="Optional" />
          </div>
          <div className="field">
            <label htmlFor="inventory-quantity">Quantity on hand</label>
            <input id="inventory-quantity" type="number" min="0" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="inventory-unit">Unit</label>
            <input id="inventory-unit" value={unit} onChange={(event) => setUnit(event.target.value)} maxLength={20} list="inventory-units" required />
            <datalist id="inventory-units"><option value="units" /><option value="kg" /><option value="boxes" /><option value="liters" /></datalist>
          </div>
          <div className="field">
            <label htmlFor="inventory-reorder">Reorder level</label>
            <input id="inventory-reorder" type="number" min="0" step="1" value={reorderLevel} onChange={(event) => setReorderLevel(event.target.value)} placeholder="Optional" />
          </div>
          <div className="field field-wide">
            <label htmlFor="inventory-notes">Notes</label>
            <textarea id="inventory-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} rows={3} placeholder="Optional storage notes, bin location, etc." />
          </div>
        </div>
        {formError ? <p className="form-error" role="alert">{formError}</p> : null}
        <div className="dialog-actions">
          {editing ? <button type="button" className="button button-danger-ghost dialog-delete" onClick={remove} disabled={busy}>Delete</button> : null}
          <button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add item'}</button>
        </div>
      </form>
    </dialog>
  );
}

function ProductionRow({ run, onEdit }) {
  const requirements = run.requirements || [];
  return (
    <div className="production-row">
      <div className="production-main">
        <div className="production-top">
          <span className="production-run">{run.runNumber}</span>
          <strong className="production-name">{run.item}</strong>
          <ProductionStatusChip status={run.status} />
        </div>
        <span className="production-meta">Scheduled {scheduleDate(run.scheduledDate)}{run.notes ? ` · ${run.notes}` : ''}</span>
        {requirements.length ? (
          <ul className="requirement-list">
            {requirements.map((requirement) => {
              const consumed = requirement.status === 'completed' || run.status === 'completed';
              return (
                <li key={requirement.id}>
                  <span className="requirement-sku">{requirement.itemSku}</span>
                  <span className="requirement-qty">{requirement.quantity} {requirement.unit}</span>
                  <span className={`status-chip ${consumed ? 'completed' : 'scheduled'}`}>{consumed ? 'Consumed' : 'Outstanding'}</span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
      <div className="production-side">
        <span className="production-qty">{run.quantity}<small>{run.unit}</small></span>
        <span className="production-meta">{run.completedQuantity ?? 0} completed</span>
        <time className="production-updated" dateTime={run.updatedAt} title={fullDate(run.updatedAt)}>Updated {shortDate(run.updatedAt)}</time>
      </div>
      {onEdit ? <button type="button" className="button button-ghost button-small production-edit" onClick={() => onEdit(run)} aria-label={`Edit ${run.runNumber}`}>Edit</button> : null}
    </div>
  );
}

function ProductionView({ runs, onAdd, onEdit }) {
  const inProgress = runs ? runs.filter((run) => run.status === 'in_progress').length : 0;
  const nextRun = runs
    ? runs.filter((run) => run.status === 'scheduled' || run.status === 'in_progress').sort((first, second) => first.scheduledDate.localeCompare(second.scheduledDate))[0] || null
    : null;
  return (
    <section className="panel record-panel production" id="production" tabIndex={-1} aria-labelledby="production-title">
      <header className="panel-head record-head">
        <div><p className="eyebrow">Schedule</p><h2 id="production-title">Production</h2></div>
        <div className="record-actions">
          <span className="count">{runs ? `${runs.length} ${runs.length === 1 ? 'run' : 'runs'}` : '—'}</span>
          <a className="text-link" href="/production_runs" target="_blank" rel="noreferrer">Production floor view</a><button type="button" className="button button-primary button-small" onClick={onAdd}>Add run</button>
        </div>
      </header>
      {runs === null ? (
        <div className="record-loading" role="status"><span className="spinner" aria-hidden="true" />Loading production schedule…</div>
      ) : (
        <>
          <div className="record-summary">
            <div><span className="metric-label">Runs</span><strong>{runs.length}</strong></div>
            <div><span className="metric-label">In progress</span><strong>{inProgress}</strong></div>
            <div><span className="metric-label">Next run</span><strong>{nextRun ? scheduleDate(nextRun.scheduledDate) : '—'}</strong></div>
          </div>
          <div className="record-list">
            {runs.map((run) => <ProductionRow key={run.id} run={run} onEdit={onEdit} />)}
            {!runs.length ? (
              <div className="empty">
                <span className="empty-mark" aria-hidden="true">PR</span>
                <strong>No production runs yet</strong>
                <p>Add a scheduled run, select a defined assembly, and set the planned quantity.</p>
                <button type="button" className="button button-secondary button-small" onClick={onAdd}>Add your first run</button>
              </div>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

function scaleRunRequirements(productionItem, quantity) {
  const planned = Number(quantity);
  if (!productionItem || !Number.isInteger(planned) || planned <= 0) return [];
  return (productionItem.requirements || []).map((requirement) => ({
    itemSku: requirement.itemSku,
    perUnit: requirement.quantity,
    quantity: requirement.quantity * planned,
    unit: requirement.unit,
  }));
}

function ProductionDialog({ draft, productionItems = [], busy, onClose, onSave, onDelete }) {
  const dialogRef = useSheetDialog(onClose);
  const editing = Boolean(draft.id);
  const runNumber = draft.runNumber || '';
  const initialSelected = productionItems.find((option) => option.id === draft.productionItemId) || null;
  const [productionItemId, setProductionItemId] = useState(draft.productionItemId || '');
  const [quantity, setQuantity] = useState(String(draft.quantity ?? 1));
  const [unit, setUnit] = useState(initialSelected?.unit || draft.unit || 'units');
  const [status, setStatus] = useState(draft.status || 'scheduled');
  const [scheduledDate, setScheduledDate] = useState(draft.scheduledDate || todayDate());
  const [notes, setNotes] = useState(draft.notes || '');
  const [requirements, setRequirements] = useState(() => {
    if (initialSelected) return scaleRunRequirements(initialSelected, draft.quantity ?? 1);
    return (draft.requirements || []).map((requirement) => ({
      itemSku: requirement.itemSku,
      perUnit: null,
      quantity: requirement.quantity,
      unit: requirement.unit,
    }));
  });
  const [formError, setFormError] = useState('');
  const selectedProductionItem = productionItems.find((option) => option.id === productionItemId) || null;

  function chooseProductionItem(value) {
    setProductionItemId(value);
    const selected = productionItems.find((option) => option.id === value);
    if (!selected) return;
    setUnit(selected.unit);
    setRequirements(scaleRunRequirements(selected, quantity));
  }

  function changeQuantity(value) {
    setQuantity(value);
    if (selectedProductionItem) setRequirements(scaleRunRequirements(selectedProductionItem, value));
  }

  async function submit(event) {
    event.preventDefault();
    setFormError('');
    try {
      await onSave({
        runNumber,
        productionItemId: productionItemId || null,
        quantity: Number(quantity),
        status,
        scheduledDate,
        notes,
      });
    } catch (failure) {
      setFormError(failure.message);
    }
  }

  async function remove() {
    if (!globalThis.confirm(`Delete run ${draft.runNumber}? This cannot be undone.`)) return;
    setFormError('');
    try { await onDelete(); } catch (failure) { setFormError(failure.message); }
  }

  return (
    <dialog ref={dialogRef} className="detail production-dialog" aria-labelledby="production-dialog-title">
      <header className="detail-head">
        <div><p className="eyebrow">Production</p><h2 id="production-dialog-title">{editing ? 'Edit production run' : 'Add production run'}</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close production form" disabled={busy}>×</button>
      </header>
      <form className="detail-body production-form" onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="production-run">Run number</label>
            <input id="production-run" value={runNumber} readOnly aria-readonly="true" required />
            <p className="field-hint">{editing ? 'Run numbers stay fixed.' : 'Generated automatically.'}</p>
          </div>
          <div className="field">
            <label htmlFor="production-status">Status</label>
            <select id="production-status" value={status} onChange={(event) => setStatus(event.target.value)}>
              {Object.entries(PRODUCTION_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div className="field field-wide">
            <label htmlFor="production-item">Assembly</label>
            <select id="production-item" value={productionItemId} onChange={(event) => chooseProductionItem(event.target.value)} required>
              <option value="">Choose an assembly</option>
              {productionItems.map((option) => <option key={option.id} value={option.id}>{option.name} — {option.unit}</option>)}
            </select>
            <p className="field-hint">Assemblies and their per-unit materials are defined under Assemblies.</p>
          </div>
          <div className="field">
            <label htmlFor="production-quantity">Planned quantity</label>
            <input id="production-quantity" type="number" min="1" step="1" value={quantity} onChange={(event) => changeQuantity(event.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="production-unit">Unit</label>
            <input id="production-unit" value={unit} readOnly aria-readonly="true" required />
          </div>
          <div className="field field-wide">
            <label htmlFor="production-date">Scheduled date</label>
            <input id="production-date" type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} required />
          </div>
          <div className="field field-wide">
            <label>Material requirements (scaled and locked)</label>
            {requirements.length ? (
              <ul className="locked-requirements" aria-label="Scaled material requirements">
                {requirements.map((requirement, index) => (
                  <li key={`${requirement.itemSku}-${index}`}>
                    <span className="requirement-sku">{requirement.itemSku}</span>
                    <span className="locked-requirement-math">
                      {requirement.perUnit != null ? `${requirement.perUnit} ${requirement.unit} × ${quantity || 0} = ` : ''}
                      <strong>{requirement.quantity} {requirement.unit}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="muted">No materials defined for this assembly.</p>}
            <p className="field-hint">Materials are scaled from the assembly's per-unit list by the planned quantity and locked to the run. Change the planned quantity to re-derive them.</p>
          </div>
          <div className="field field-wide">
            <label htmlFor="production-notes">Notes</label>
            <textarea id="production-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} rows={3} placeholder="Optional line, machine, or handoff notes." />
          </div>
        </div>
        {formError ? <p className="form-error" role="alert">{formError}</p> : null}
        {!productionItems.length ? <p className="form-error" role="alert">Define an assembly under Assemblies before adding a run.</p> : null}
        <div className="dialog-actions">
          {editing ? <button type="button" className="button button-danger-ghost dialog-delete" onClick={remove} disabled={busy}>Delete</button> : null}
          <button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy || !productionItems.length}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add run'}</button>
        </div>
      </form>
    </dialog>
  );
}

function AssembliesView({ assemblies, onAdd, onEdit }) {
  return (
    <section className="panel record-panel definitions" id="assemblies" tabIndex={-1} aria-labelledby="assemblies-title">
      <header className="panel-head record-head">
        <div><p className="eyebrow">Assembly master</p><h2 id="assemblies-title">Assemblies</h2></div>
        <div className="record-actions">
          <span className="count">{assemblies ? `${assemblies.length} ${assemblies.length === 1 ? 'assembly' : 'assemblies'}` : '—'}</span>
          <button type="button" className="button button-primary button-small" onClick={onAdd}>Add assembly</button>
        </div>
      </header>
      {assemblies === null ? (
        <div className="record-loading" role="status"><span className="spinner" aria-hidden="true" />Loading assemblies…</div>
      ) : (
        <>
          <p className="definition-intro">Define what the plant assembles and the materials each unit needs, selected from Inventory. Production runs scale these per-unit materials by the planned quantity and lock the result.</p>
          <div className="record-list">
            {assemblies.map((item) => <ProductionItemRow key={item.id} item={item} onEdit={onEdit} />)}
            {!assemblies.length ? (
              <div className="empty">
                <span className="empty-mark" aria-hidden="true">AS</span>
                <strong>No assemblies defined</strong>
                <p>Add an assembly and choose its materials from Inventory.</p>
                <button type="button" className="button button-secondary button-small" onClick={onAdd}>Add your first assembly</button>
              </div>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

function ProductionItemRow({ item, onEdit }) {
  const requirements = item.requirements || [];
  return (
    <div className="definition-row">
      <div className="definition-main">
        <div className="definition-top">
          <strong className="definition-name">{item.name}</strong>
          <span className="definition-unit">{item.unit}</span>
        </div>
        {item.notes ? <span className="definition-meta">{item.notes}</span> : null}
        {requirements.length ? (
          <ul className="requirement-list">
            {requirements.map((requirement) => (
              <li key={requirement.id}>
                <span className="requirement-sku">{requirement.itemSku}</span>
                <span className="requirement-qty">{requirement.quantity} {requirement.unit} / unit</span>
              </li>
            ))}
          </ul>
        ) : <span className="definition-meta">No materials defined</span>}
      </div>
      <button type="button" className="button button-ghost button-small" onClick={() => onEdit(item)} aria-label={`Edit ${item.name}`}>Edit</button>
    </div>
  );
}


function ProductionItemDialog({ draft, skuOptions = [], busy, onClose, onSave, onDelete }) {
  const dialogRef = useSheetDialog(onClose);
  const editing = Boolean(draft.id);
  const [name, setName] = useState(draft.name || '');
  const [unit, setUnit] = useState(draft.unit || 'units');
  const [notes, setNotes] = useState(draft.notes || '');
  const [requirements, setRequirements] = useState(() => (draft.requirements?.length ? draft.requirements : []).map((requirement) => ({
    itemSku: requirement.itemSku,
    quantity: String(requirement.quantity),
    unit: requirement.unit,
  })));
  const [formError, setFormError] = useState('');

  function updateRequirement(index, patch) {
    setRequirements((current) => current.map((requirement, row) => (row === index ? { ...requirement, ...patch } : requirement)));
  }

  function chooseSku(index, itemSku) {
    const inventoryItem = skuOptions.find((option) => option.sku.toLowerCase() === itemSku.toLowerCase());
    updateRequirement(index, { itemSku, unit: inventoryItem?.unit || requirements[index].unit });
  }

  async function submit(event) {
    event.preventDefault();
    setFormError('');
    try {
      await onSave({
        name,
        unit,
        notes,
        requirements: requirements.map((requirement) => ({ itemSku: requirement.itemSku, quantity: Number(requirement.quantity), unit: requirement.unit })),
      });
    } catch (failure) { setFormError(failure.message); }
  }

  async function remove() {
    if (!globalThis.confirm(`Delete the assembly ${name}? This cannot be undone.`)) return;
    setFormError('');
    try { await onDelete(); } catch (failure) { setFormError(failure.message); }
  }

  return (
    <dialog ref={dialogRef} className="detail" aria-labelledby="production-item-dialog-title">
      <header className="detail-head">
        <div><p className="eyebrow">Assemblies</p><h2 id="production-item-dialog-title">{editing ? 'Edit assembly' : 'Define an assembly'}</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close assembly form" disabled={busy}>×</button>
      </header>
      <form className="detail-body" onSubmit={submit}>
        <div className="form-grid">
          <div className="field field-wide">
            <label htmlFor="production-item-name">Assembly name</label>
            <input id="production-item-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="e.g. Carton Packaging" required autoFocus />
          </div>
          <div className="field">
            <label htmlFor="production-item-unit">Unit</label>
            <input id="production-item-unit" value={unit} onChange={(event) => setUnit(event.target.value)} maxLength={20} list="production-item-units" required />
            <datalist id="production-item-units"><option value="units" /><option value="kg" /><option value="boxes" /><option value="liters" /></datalist>
          </div>
          <div className="field field-wide">
            <label htmlFor="production-item-notes">Notes</label>
            <input id="production-item-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} placeholder="Optional" />
          </div>
          <div className="field field-wide">
            <label>Materials per unit</label>
            <div className="requirement-editor">
              {requirements.map((requirement, index) => (
                <div className="requirement-row" key={index}>
                  <label className="sr-only" htmlFor={`production-requirement-sku-${index}`}>Item SKU</label>
                  <select id={`production-requirement-sku-${index}`} value={requirement.itemSku} onChange={(event) => chooseSku(index, event.target.value)} required>
                    <option value="">Choose inventory item</option>
                    {skuOptions.map((option) => <option key={option.id} value={option.sku}>{option.sku} — {option.item}</option>)}
                  </select>
                  <label className="sr-only" htmlFor={`production-requirement-qty-${index}`}>Quantity</label>
                  <input id={`production-requirement-qty-${index}`} type="number" min="1" step="1" value={requirement.quantity} onChange={(event) => updateRequirement(index, { quantity: event.target.value })} required />
                  <label className="sr-only" htmlFor={`production-requirement-unit-${index}`}>Unit</label>
                  <input id={`production-requirement-unit-${index}`} value={requirement.unit} onChange={(event) => updateRequirement(index, { unit: event.target.value })} maxLength={20} required />
                  <button type="button" className="button button-ghost button-small" onClick={() => setRequirements((current) => current.filter((_, row) => row !== index))} aria-label="Remove requirement">Remove</button>
                </div>
              ))}
              <button type="button" className="button button-secondary button-small" onClick={() => setRequirements((current) => [...current, { itemSku: '', quantity: '1', unit: 'units' }])}>Add requirement</button>
            </div>
          </div>
        </div>
        {formError ? <p className="form-error" role="alert">{formError}</p> : null}
        <div className="dialog-actions">
          {editing ? <button type="button" className="button button-danger-ghost dialog-delete" onClick={remove} disabled={busy}>Delete</button> : null}
          <button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Define assembly'}</button>
        </div>
      </form>
    </dialog>
  );
}

function DeliveryRow({ delivery, onEdit, onReceive, busy }) {
  const received = delivery.status === 'received';
  return (
    <div className="delivery-row">
      <div className="delivery-main">
        <div className="delivery-top">
          <strong>{delivery.itemSku}</strong>
          <span className={`status-chip ${received ? 'completed' : 'scheduled'}`}>{received ? 'Received' : 'Incoming'}</span>
          {delivery.poId ? <span className="delivery-po">{delivery.poId}</span> : <span className="delivery-po">Manual</span>}
          {delivery.proof ? <span className="status-chip valid">Proof</span> : null}
          {delivery.receipt ? <span className="status-chip valid">Receipt</span> : null}
        </div>
        <span className="delivery-meta">{delivery.supplier || 'No supplier'} · arrives {scheduleDate(delivery.expectedArrival)}</span>
      </div>
      <div className="delivery-side">
        <span className="inventory-qty">{received ? delivery.receivedQuantity ?? delivery.quantity : delivery.quantity}<small>{delivery.unit}</small></span>
        {received && delivery.receivedQuantity != null && delivery.receivedQuantity !== delivery.quantity ? <span className="inventory-updated">Planned {delivery.quantity} {delivery.unit}</span> : null}
        {received ? <time className="inventory-updated" dateTime={delivery.receivedAt}>Received {shortDate(delivery.receivedAt)}</time> : null}
      </div>
      <div className="delivery-actions">
        {received ? (
          delivery.poId ? <button type="button" className="button button-ghost button-small" onClick={() => onEdit(delivery)} disabled={busy}>Proof</button> : null
        ) : (
          <>
            <button type="button" className="button button-ghost button-small" onClick={() => onEdit(delivery)} disabled={busy}>Edit</button>
            <button type="button" className="button button-primary button-small" onClick={() => onReceive(delivery)} disabled={busy}>Receive</button>
          </>
        )}
      </div>
    </div>
  );
}

function DeliveriesView({ deliveries, onAdd, onEdit, onReceive, busy }) {
  const incoming = deliveries ? deliveries.filter((delivery) => delivery.status === 'incoming').length : 0;
  return (
    <section className="panel record-panel deliveries" id="deliveries" tabIndex={-1} aria-labelledby="deliveries-title">
      <header className="panel-head record-head">
        <div><p className="eyebrow">Supply</p><h2 id="deliveries-title">Incoming deliveries</h2></div>
        <div className="record-actions">
          <span className="count">{deliveries ? `${deliveries.length} ${deliveries.length === 1 ? 'delivery' : 'deliveries'}` : '—'}</span>
          <a className="text-link" href="/deliveries" target="_blank" rel="noreferrer">Receiving view ↗</a>
          <button type="button" className="button button-primary button-small" onClick={onAdd}>Add delivery</button>
        </div>
      </header>
      {deliveries === null ? (
        <div className="record-loading" role="status"><span className="spinner" aria-hidden="true" />Loading deliveries…</div>
      ) : (
        <>
          <div className="record-summary">
            <div><span className="metric-label">Deliveries</span><strong>{deliveries.length}</strong></div>
            <div><span className="metric-label">Awaiting receipt</span><strong>{incoming}</strong></div>
            <div><span className="metric-label">Received</span><strong>{deliveries.length - incoming}</strong></div>
          </div>
          <div className="record-list">
            {deliveries.map((delivery) => <DeliveryRow key={delivery.id} delivery={delivery} onEdit={onEdit} onReceive={onReceive} busy={busy} />)}
            {!deliveries.length ? (
              <div className="empty">
                <span className="empty-mark" aria-hidden="true">IN</span>
                <strong>No incoming deliveries</strong>
                <p>Ordering an approved PO creates one linked delivery. You can also add one manually.</p>
              </div>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

function DeliveryDialog({ draft, skuOptions, busy, onClose, onSave }) {
  const dialogRef = useSheetDialog(onClose);
  const editing = Boolean(draft.id);
  const received = draft.status === 'received';
  const [itemSku, setItemSku] = useState(draft.itemSku || '');
  const [quantity, setQuantity] = useState(String(draft.quantity ?? 1));
  const [unit, setUnit] = useState(draft.unit || 'units');
  const [expectedArrival, setExpectedArrival] = useState(draft.expectedArrival || todayDate());
  const [supplier, setSupplier] = useState(draft.supplier || '');
  const [notes, setNotes] = useState(draft.notes || '');
  const [correctionNote, setCorrectionNote] = useState('');
  const [formError, setFormError] = useState('');
  const [proofFile, setProofFile] = useState(null);
  const [proofPreview, setProofPreview] = useState('');
  const [proofError, setProofError] = useState('');

  useEffect(() => () => { if (proofPreview) globalThis.URL.revokeObjectURL(proofPreview); }, [proofPreview]);

  function chooseSku(value) {
    const option = skuOptions.find((item) => item.sku.toLowerCase() === value.toLowerCase());
    setItemSku(value);
    if (option) setUnit(option.unit);
  }

  function chooseProof(event) {
    const file = event.target.files?.[0] || null;
    setProofError('');
    if (!file) {
      setProofFile(null);
      setProofPreview('');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setProofError('Choose a JPEG, PNG, or WebP picture.');
      event.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setProofError('Proof pictures must be 5 MB or smaller.');
      event.target.value = '';
      return;
    }
    setProofFile(file);
    setProofPreview(globalThis.URL.createObjectURL(file));
  }

  async function submit(event) {
    event.preventDefault();
    setFormError('');
    setProofError('');
    if (received && !proofFile) {
      setProofError('Choose a new proof picture to save.');
      return;
    }
    if (!received && !draft.poId && (!editing || !draft.proof) && !proofFile) {
      setProofError('Upload a picture of proof that the delivery is incoming.');
      return;
    }
    if (!received && editing && expectedArrival !== draft.expectedArrival && !correctionNote.trim()) {
      setFormError('Enter a note for the delivery date change.');
      return;
    }
    try {
      await onSave({ itemSku, quantity: Number(quantity), unit, expectedArrival, supplier, notes }, proofFile, correctionNote);
    } catch (failure) {
      setFormError(failure.message);
    }
  }

  const proofUrl = draft.proof
    ? (draft.poId
      ? `/api/pos/${encodeURIComponent(draft.poId)}/proof?v=${encodeURIComponent(draft.proof.createdAt)}`
      : `/api/deliveries/${encodeURIComponent(draft.id)}/proof?v=${encodeURIComponent(draft.proof.createdAt)}`)
    : '';

  return (
    <dialog ref={dialogRef} className="detail delivery-dialog" aria-labelledby="delivery-dialog-title">
      <header className="detail-head">
        <div><p className="eyebrow">Incoming supply</p><h2 id="delivery-dialog-title">{received ? 'Delivery proof' : editing ? 'Edit delivery' : 'Add delivery'}</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close delivery form" disabled={busy}>×</button>
      </header>
      <form className="detail-body" onSubmit={submit}>
        <div className="form-grid">
          <div className="field field-wide">
            <label htmlFor="delivery-sku">Item SKU</label>
            <select id="delivery-sku" value={itemSku} onChange={(event) => chooseSku(event.target.value)} required autoFocus={!editing} disabled={received || Boolean(draft.poId)}>
              <option value="">Choose SKU</option>
              {skuOptions.map((option) => <option key={option.id} value={option.sku}>{option.sku} — {option.item}</option>)}
            </select>
            {draft.poId ? <p className="field-hint">Linked to {draft.poId}; the item SKU stays fixed.</p> : null}
          </div>
          <div className="field">
            <label htmlFor="delivery-quantity">Quantity</label>
            <input id="delivery-quantity" type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required disabled={received} />
          </div>
          <div className="field">
            <label htmlFor="delivery-unit">Unit</label>
            <input id="delivery-unit" value={unit} onChange={(event) => setUnit(event.target.value)} maxLength={20} required disabled={received} />
          </div>
          <div className="field">
            <label htmlFor="delivery-arrival">Expected arrival</label>
            <input id="delivery-arrival" type="date" value={expectedArrival} onChange={(event) => setExpectedArrival(event.target.value)} required disabled={received} />
          </div>
          <div className="field">
            <label htmlFor="delivery-supplier">Supplier</label>
            <input id="delivery-supplier" value={supplier} onChange={(event) => setSupplier(event.target.value)} maxLength={120} placeholder="Optional" disabled={received} />
          </div>
          <div className="field field-wide">
            <label htmlFor="delivery-notes">Notes</label>
            <textarea id="delivery-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} rows={2} disabled={received} />
          </div>
          {draft.poId && !received ? (
            <div className="field field-wide">
              <label htmlFor="delivery-correction">Correction note</label>
              <input id="delivery-correction" value={correctionNote} onChange={(event) => setCorrectionNote(event.target.value)} maxLength={500} placeholder="Required when the delivery date changes" />
              <p className="field-hint">Saved in the PO review history when the expected arrival changes.</p>
            </div>
          ) : null}
          <div className="field field-wide">
            <label htmlFor="delivery-proof">Incoming proof{draft.poId ? '' : (!editing || !draft.proof) ? ' (required)' : ''}</label>
            {proofPreview ? (
              <img className="proof-preview" src={proofPreview} alt="Selected proof preview" />
            ) : proofUrl ? (
              <img className="proof-image" src={proofUrl} alt="Proof that the order is incoming" />
            ) : <p className="muted">No proof picture yet.</p>}
            <input id="delivery-proof" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseProof} required={!draft.poId && (!editing || !draft.proof)} />
            <p className="field-hint">
              {!draft.poId
                ? (proofUrl ? 'Choose a new picture to replace the current proof.' : 'Required: upload proof that this manual delivery is incoming.')
                : (received ? 'Choose a new picture to correct the existing proof.' : 'Choose a new picture to replace the current proof.')}
            </p>
            {proofError ? <p className="form-error" role="alert">{proofError}</p> : null}
          </div>
        </div>
        {formError ? <p className="form-error" role="alert">{formError}</p> : null}
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy || (received && !proofFile)}>
            {busy ? 'Saving…' : received ? 'Save proof' : editing ? 'Save changes' : 'Add delivery'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function ReceiveDeliveryDialog({ delivery, busy, onClose, onConfirm }) {
  const dialogRef = useSheetDialog(onClose);
  const [quantity, setQuantity] = useState(String(delivery.quantity ?? 1));
  const [proofFile, setProofFile] = useState(null);
  const [proofPreview, setProofPreview] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => () => { if (proofPreview) globalThis.URL.revokeObjectURL(proofPreview); }, [proofPreview]);

  function chooseProof(event) {
    const file = event.target.files?.[0] || null;
    setFormError('');
    if (!file) {
      setProofFile(null);
      setProofPreview('');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFormError('Choose a JPEG, PNG, or WebP picture.');
      event.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFormError('Receipt pictures must be 5 MB or smaller.');
      event.target.value = '';
      return;
    }
    setProofFile(file);
    setProofPreview(globalThis.URL.createObjectURL(file));
  }

  async function submit(event) {
    event.preventDefault();
    setFormError('');
    const received = Number(quantity);
    if (!Number.isInteger(received) || received <= 0) {
      setFormError('Enter the confirmed received quantity.');
      return;
    }
    if (!proofFile) {
      setFormError('Upload a picture of proof that the delivery was received.');
      return;
    }
    try {
      await onConfirm(received, proofFile);
    } catch (failure) {
      setFormError(failure.message);
    }
  }

  return (
    <dialog ref={dialogRef} className="detail delivery-dialog" aria-labelledby="receive-dialog-title">
      <header className="detail-head">
        <div><p className="eyebrow">Incoming supply</p><h2 id="receive-dialog-title">Receive delivery</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close receive form" disabled={busy}>×</button>
      </header>
      <form className="detail-body" onSubmit={submit}>
        <p className="field-hint">Confirm the quantity physically received. If items are missing or extra, enter the actual count; stock will use this quantity.</p>
        <dl className="po-grid" aria-label="Delivery being received">
          <div className="po-field"><dt>Item SKU</dt><dd className="mono">{delivery.itemSku}</dd></div>
          <div className="po-field"><dt>Planned quantity</dt><dd>{delivery.quantity} {delivery.unit}</dd></div>
          <div className="po-field"><dt>Supplier</dt><dd>{delivery.supplier || '—'}</dd></div>
          <div className="po-field"><dt>Expected arrival</dt><dd>{delivery.expectedArrival}</dd></div>
          {delivery.poId ? <div className="po-field"><dt>PO</dt><dd className="mono">{delivery.poId}</dd></div> : null}
        </dl>
        <div className="form-grid">
          <div className="field field-wide">
            <label htmlFor="receive-quantity">Confirmed received quantity ({delivery.unit})</label>
            <input id="receive-quantity" type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required autoFocus />
            {Number(quantity) !== delivery.quantity && Number(quantity) > 0 ? (
              <p className="field-hint">Planned {delivery.quantity} {delivery.unit}; stock will increase by the confirmed quantity.</p>
            ) : null}
          </div>
          <div className="field field-wide">
            <label htmlFor="receive-proof">Receipt picture</label>
            <input id="receive-proof" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseProof} required />
            <p className="field-hint">JPEG, PNG, or WebP up to 5 MB. Stored locally as proof of receipt.</p>
            {proofPreview ? <img className="proof-preview" src={proofPreview} alt="Selected receipt preview" /> : null}
          </div>
        </div>
        {formError ? <p className="form-error" role="alert">{formError}</p> : null}
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Receiving…' : 'Confirm receipt'}</button>
        </div>
      </form>
    </dialog>
  );
}

function ManualPoDialog({ skuOptions = [], busy, onClose, onSave }) {
  const dialogRef = useSheetDialog(onClose);
  const options = skuOptions.filter((option) => option.sku);
  const [sku, setSku] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('');
  const [etaDays, setEtaDays] = useState('5');
  const [supplier, setSupplier] = useState('');
  const [formError, setFormError] = useState('');

  function chooseSku(value) {
    const option = options.find((candidate) => candidate.sku === value);
    setSku(value);
    setUnit(option?.unit || '');
    if (option?.supplier) setSupplier((current) => current || option.supplier);
  }

  async function submit(event) {
    event.preventDefault();
    setFormError('');
    const option = options.find((candidate) => candidate.sku === sku);
    if (!option) {
      setFormError('Choose an inventory item.');
      return;
    }
    try {
      await onSave({ item: option.sku, mappedSku: option.sku, quantity: Number(quantity), unit, etaDays: Number(etaDays), supplier });
    } catch (failure) {
      setFormError(failure.message);
    }
  }

  return (
    <dialog ref={dialogRef} className="detail" aria-labelledby="manual-po-title">
      <header className="detail-head">
        <div><p className="eyebrow">Manual entry</p><h2 id="manual-po-title">Add purchase order</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close manual PO form" disabled={busy}>×</button>
      </header>
      <form className="detail-body" onSubmit={submit}>
        <p className="field-hint">A manual PO enters Pending Review immediately and does not need an approved sender. It uses an existing inventory SKU.</p>
        {!options.length ? (
          <p className="review-note">Add an inventory item first. Manual POs must use an inventory SKU so they can be assessed.</p>
        ) : (
          <>
            <div className="field">
              <label htmlFor="manual-po-sku">Inventory item</label>
              <select id="manual-po-sku" value={sku} onChange={(event) => chooseSku(event.target.value)} required autoFocus>
                <option value="">Choose an inventory SKU</option>
                {options.map((option) => <option key={option.id} value={option.sku}>{option.sku} — {option.item}</option>)}
              </select>
            </div>
            <div className="form-grid">
              <div className="field"><label htmlFor="manual-po-quantity">Quantity</label><input id="manual-po-quantity" type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></div>
              <div className="field"><label htmlFor="manual-po-eta">ETA days</label><input id="manual-po-eta" type="number" min="1" step="1" value={etaDays} onChange={(event) => setEtaDays(event.target.value)} required /></div>
              <div className="field"><label htmlFor="manual-po-unit">Unit</label><input id="manual-po-unit" value={unit} readOnly aria-readonly="true" required /></div>
              <div className="field"><label htmlFor="manual-po-supplier">Supplier</label><input id="manual-po-supplier" value={supplier} onChange={(event) => setSupplier(event.target.value)} maxLength={120} required /></div>
            </div>
          </>
        )}
        {formError ? <p className="form-error" role="alert">{formError}</p> : null}
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy || !options.length}>{busy ? 'Adding…' : 'Add PO'}</button>
        </div>
      </form>
    </dialog>
  );
}

function PoDetailDialog({ po, loading, error, busy, message, skuOptions, onClose, onAction, onOrder, onUpdateProof, onReschedule, onCorrect }) {
  const dialogRef = useSheetDialog(onClose);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [correcting, setCorrecting] = useState(false);
  const [draft, setDraft] = useState(null);
  const [formError, setFormError] = useState('');
  const [ordering, setOrdering] = useState(false);
  const [replacingProof, setReplacingProof] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [scheduleValue, setScheduleValue] = useState('');
  const [scheduleNote, setScheduleNote] = useState('');
  const [scheduleError, setScheduleError] = useState('');
  const [proofFile, setProofFile] = useState(null);
  const [proofPreview, setProofPreview] = useState('');
  const [proofError, setProofError] = useState('');

  useEffect(() => () => { if (proofPreview) globalThis.URL.revokeObjectURL(proofPreview); }, [proofPreview]);

  useEffect(() => {
    if (!po) return;
    setDraft({
      item: po.item || '',
      mappedSku: po.mappedSku || po.sku || '',
      quantity: String(po.quantity ?? ''),
      unit: po.unit || '',
      etaDays: String(po.etaDays ?? ''),
      supplier: po.supplier || '',
    });
  }, [po?.poId, po?.item, po?.mappedSku, po?.sku, po?.quantity, po?.unit, po?.etaDays, po?.supplier]);

  const assessment = po?.assessment;

  async function submitReject(event) {
    event.preventDefault();
    setFormError('');
    if (!reason.trim()) { setFormError('Enter a rejection reason.'); return; }
    try {
      const ok = await onAction('reject', { reason });
      if (ok === false) return;
      setRejecting(false);
      setReason('');
    } catch (failure) {
      setFormError(failure.message);
    }
  }

  async function submitCorrection(event) {
    event.preventDefault();
    setFormError('');
    try {
      const updated = await onCorrect({
        item: draft.item,
        mappedSku: draft.mappedSku,
        quantity: Number(draft.quantity),
        unit: draft.unit,
        etaDays: Number(draft.etaDays),
        supplier: draft.supplier,
      });
      if (updated?.poError) {
        setFormError(updated.poError);
        return;
      }
      setCorrecting(false);
    } catch (failure) {
      setFormError(failure.message);
    }
  }

  function chooseSku(value) {
    const option = skuOptions.find((item) => item.sku.toLowerCase() === value.toLowerCase());
    setDraft((current) => ({ ...current, mappedSku: value, unit: option?.unit || current.unit }));
  }

  function chooseProof(event) {
    const file = event.target.files?.[0] || null;
    setProofError('');
    if (!file) {
      setProofFile(null);
      setProofPreview('');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setProofError('Choose a JPEG, PNG, or WebP picture.');
      event.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setProofError('Proof pictures must be 5 MB or smaller.');
      event.target.value = '';
      return;
    }
    setProofFile(file);
    setProofPreview(globalThis.URL.createObjectURL(file));
  }

  async function submitOrder(event) {
    event.preventDefault();
    setProofError('');
    if (!proofFile) {
      setProofError('Choose a picture of proof that this order is incoming.');
      return;
    }
    try {
      await onOrder(proofFile);
      setOrdering(false);
      setProofFile(null);
      setProofPreview('');
    } catch (failure) {
      setProofError(failure.message);
    }
  }

  async function submitProof(event) {
    event.preventDefault();
    setProofError('');
    if (!proofFile) {
      setProofError('Choose a replacement proof picture.');
      return;
    }
    try {
      await onUpdateProof(proofFile);
      setReplacingProof(false);
      setProofFile(null);
      setProofPreview('');
    } catch (failure) {
      setProofError(failure.message);
    }
  }

  function openReschedule() {
    setRescheduling(true);
    setOrdering(false);
    setReplacingProof(false);
    setRejecting(false);
    setCorrecting(false);
    setScheduleValue(po.state === 'approved' ? String(po.etaDays ?? '') : po.expectedArrival || '');
    setScheduleNote('');
    setScheduleError('');
  }

  async function submitSchedule(event) {
    event.preventDefault();
    setScheduleError('');
    const note = scheduleNote.trim();
    if (!note) {
      setScheduleError('Enter a note for the schedule change.');
      return;
    }
    try {
      await onReschedule(po.state === 'approved'
        ? { etaDays: Number(scheduleValue), note }
        : { expectedArrival: scheduleValue, note });
      setRescheduling(false);
      setScheduleNote('');
    } catch (failure) {
      setScheduleError(failure.message);
    }
  }

  return (
    <dialog ref={dialogRef} className="detail" aria-labelledby="po-detail-title">
      <header className="detail-head">
        <div>
          <p className="eyebrow">{po?.poId || 'Purchase order'}</p>
          <h2 id="po-detail-title">{po?.item || 'Order details'}</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close details">×</button>
      </header>
      {po ? (
        <div className="detail-body">
          <div className="detail-flags">
            <StateChip state={po.state} />
            <AssessmentChip assessment={assessment} />
            {po.poError ? <p className="review-note">{po.poError}</p> : null}
          </div>
          {message ? <p className="form-success" role="status">{message}</p> : null}

          <dl className="po-grid" aria-label="Purchase order">
            <div className="po-field"><dt>Quantity</dt><dd className="mono">{po.quantity ?? '—'}</dd></div>
            <div className="po-field"><dt>Unit</dt><dd>{po.unit || '—'}</dd></div>
            <div className="po-field"><dt>ETA</dt><dd>{po.eta || '—'}{po.etaDays ? ` (${po.etaDays} days)` : ''}</dd></div>
            <div className="po-field"><dt>SKU</dt><dd className="mono">{po.sku || 'Unmapped'}</dd></div>
            <div className="po-field po-field-wide"><dt>Supplier</dt><dd>{po.supplier || '—'}</dd></div>
          </dl>

          <section className="assessment" aria-labelledby="assessment-title">
            <div className="panel-head">
              <div><p className="eyebrow">Assessment</p><h3 id="assessment-title">{assessment?.decision}</h3></div>
              <span className={`assessment-chip flag-${assessment?.flag}`}>{FLAG_LABEL[assessment?.flag] || assessment?.decision}</span>
            </div>
            {assessment?.status === 'manual' ? (
              <p className="review-note">{assessment.note}</p>
            ) : (
              <>
                <dl className="assessment-grid">
                  <div><dt>Net requirement</dt><dd>{assessment?.requirement ?? '—'}</dd></div>
                  <div><dt>Quantity difference</dt><dd>{assessment?.difference == null ? '—' : `${assessment.difference >= 0 ? '+' : ''}${assessment.difference}`}</dd></div>
                  <div><dt>Expected arrival</dt><dd>{assessment?.arrival || '—'} <small>{assessment?.provisional ? 'provisional' : 'fixed'}</small></dd></div>
                  <div><dt>Need date</dt><dd>{assessment?.needDate || '—'}{assessment?.daysEarly > 1 ? ` (${assessment.daysEarly} days early)` : assessment?.daysEarly === 1 ? ' (one-day buffer met)' : ''}</dd></div>
                  <div><dt>Planning end</dt><dd>{assessment?.planningEnd || '—'}</dd></div>
                  <div><dt>Inventory updated</dt><dd>{assessment?.inventory ? metricDate(assessment.inventory.updatedAt) : '—'}</dd></div>
                </dl>
                <p className="assessment-note">{assessment?.note}</p>
                {assessment?.warnings?.length ? (
                  <ul className="warning-list">
                    {assessment.warnings.map((warning, index) => <li key={`${warning.type}-${index}`}>{warningText(warning)}</li>)}
                  </ul>
                ) : null}
                <div className="assessment-columns">
                  <div>
                    <h4>Projected balance</h4>
                    <table className="breakdown-table">
                      <thead><tr><th>Date</th><th>Before this PO</th><th>After this PO</th></tr></thead>
                      <tbody>
                        {assessment?.balances?.map((entry) => (
                          <tr key={entry.date} className={entry.after < 0 ? 'is-negative' : ''}>
                            <td>{scheduleDate(entry.date)}</td>
                            <td>{entry.before}</td>
                            <td>{entry.after}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <h4>Current stock</h4>
                    <p className="assessment-stock">{assessment?.inventory ? `${assessment.inventory.quantity} ${assessment.inventory.unit}` : 'Unmapped'}</p>
                    <h4>Incoming deliveries</h4>
                    {assessment?.deliveries?.length ? (
                      <ul className="supply-list">
                        {assessment.deliveries.map((delivery) => (
                          <li key={delivery.id}><span>{delivery.expectedArrival}</span><span>{delivery.quantity} {delivery.unit}</span></li>
                        ))}
                      </ul>
                    ) : <p className="muted">None</p>}
                    {assessment?.coverage?.length ? (
                      <>
                        <h4>Provisional coverage</h4>
                        <ul className="supply-list">
                          {assessment.coverage.map((coverage) => (
                            <li key={coverage.poId}><span>{coverage.poId} · {PO_STATES[coverage.state]}</span><span>{coverage.quantity} due {coverage.arrival}</span></li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                    <h4>Outstanding demand</h4>
                    {assessment?.demand?.length ? (
                      <ul className="supply-list">
                        {assessment.demand.map((demand) => (
                          <li key={demand.id}><span>{demand.runNumber} · {demand.scheduledDate}</span><span>{demand.quantity} {demand.unit}</span></li>
                        ))}
                      </ul>
                    ) : <p className="muted">None</p>}
                  </div>
                </div>
              </>
            )}
          </section>

          {po.events?.length ? (
            <section aria-labelledby="history-title">
              <h4 id="history-title">Review history</h4>
              <ul className="history-list">
                {po.events.map((event) => <li key={event.id}><strong>{event.type}</strong> · {fullDate(event.createdAt)}{event.reason ? ` — ${event.reason}` : ''}</li>)}
              </ul>
            </section>
          ) : null}

          {po.delivery ? (
            <p className="review-note">Linked delivery: {po.delivery.quantity} {po.delivery.unit} due {po.delivery.expectedArrival} ({po.delivery.status}).</p>
          ) : null}

          {po.proof || po.state === 'ordered' ? (
            <section aria-labelledby="proof-title">
              <h4 id="proof-title">Incoming proof</h4>
              {po.proof ? (
                <img
                  className="proof-image"
                  src={`/api/pos/${encodeURIComponent(po.poId)}/proof?v=${encodeURIComponent(po.proof.createdAt)}`}
                  alt="Proof that the order is incoming"
                />
              ) : <p className="muted">No proof picture on file.</p>}
            </section>
          ) : null}

          {formError ? <p className="form-error" role="alert">{formError}</p> : null}

          {correcting && draft ? (
            <form className="correction-form" onSubmit={submitCorrection}>
              <h4>Correct PO fields</h4>
              <div className="form-grid">
                <div className="field field-wide">
                  <label htmlFor="correction-item">Item</label>
                  <input id="correction-item" value={draft.item} onChange={(event) => setDraft({ ...draft, item: event.target.value })} maxLength={120} required />
                </div>
                <div className="field field-wide">
                  <label htmlFor="correction-sku">Inventory SKU</label>
                  <select id="correction-sku" value={draft.mappedSku} onChange={(event) => chooseSku(event.target.value)}>
                    <option value="">Unmapped</option>
                    {skuOptions.map((option) => <option key={option.id} value={option.sku}>{option.sku} — {option.item}</option>)}
                  </select>
                </div>
                <div className="field"><label htmlFor="correction-qty">Quantity</label><input id="correction-qty" type="number" min="1" step="1" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} required /></div>
                <div className="field"><label htmlFor="correction-unit">Unit</label><input id="correction-unit" value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} maxLength={20} required /></div>
                <div className="field"><label htmlFor="correction-eta">ETA days</label><input id="correction-eta" type="number" min="1" step="1" value={draft.etaDays} onChange={(event) => setDraft({ ...draft, etaDays: event.target.value })} required /></div>
                <div className="field"><label htmlFor="correction-supplier">Supplier</label><input id="correction-supplier" value={draft.supplier} onChange={(event) => setDraft({ ...draft, supplier: event.target.value })} maxLength={120} required /></div>
              </div>
              <div className="dialog-actions">
                <button type="button" className="button button-secondary button-small" onClick={() => setCorrecting(false)}>Cancel</button>
                <button type="submit" className="button button-primary button-small" disabled={busy}>Save correction</button>
              </div>
            </form>
          ) : null}

          {rejecting ? (
            <form className="correction-form" onSubmit={submitReject}>
              <h4>Reject this PO</h4>
              <div className="field">
                <label htmlFor="reject-reason">Reason</label>
                <textarea id="reject-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={500} required autoFocus />
              </div>
              <div className="dialog-actions">
                <button type="button" className="button button-secondary button-small" onClick={() => setRejecting(false)}>Cancel</button>
                <button type="submit" className="button button-danger button-small" disabled={busy}>Reject PO</button>
              </div>
            </form>
          ) : null}

          {ordering ? (
            <form className="correction-form" onSubmit={submitOrder}>
              <h4>Mark as Ordered / Incoming</h4>
              <p className="field-hint">Upload a picture of proof that this order is incoming. JPEG, PNG, or WebP up to 5 MB.</p>
              <div className="field">
                <label htmlFor="order-proof">Proof picture</label>
                <input id="order-proof" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseProof} required />
              </div>
              {proofPreview ? <img className="proof-preview" src={proofPreview} alt="Selected proof preview" /> : null}
              {proofError ? <p className="form-error" role="alert">{proofError}</p> : null}
              <div className="dialog-actions">
                <button type="button" className="button button-secondary button-small" onClick={() => { setOrdering(false); setProofError(''); setProofFile(null); setProofPreview(''); }}>Cancel</button>
                <button type="submit" className="button button-primary button-small" disabled={busy}>Confirm incoming</button>
              </div>
            </form>
          ) : null}

          {replacingProof ? (
            <form className="correction-form" onSubmit={submitProof}>
              <h4>{po.proof ? 'Replace incoming proof' : 'Add incoming proof'}</h4>
              <p className="field-hint">Choose a JPEG, PNG, or WebP picture up to 5 MB to correct the proof.</p>
              <div className="field">
                <label htmlFor="replace-proof">Proof picture</label>
                <input id="replace-proof" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseProof} required />
              </div>
              {proofPreview ? <img className="proof-preview" src={proofPreview} alt="Selected proof preview" /> : null}
              {proofError ? <p className="form-error" role="alert">{proofError}</p> : null}
              <div className="dialog-actions">
                <button type="button" className="button button-secondary button-small" onClick={() => { setReplacingProof(false); setProofError(''); setProofFile(null); setProofPreview(''); }}>Cancel</button>
                <button type="submit" className="button button-primary button-small" disabled={busy}>Save proof</button>
              </div>
            </form>
          ) : null}

          {rescheduling ? (
            <form className="correction-form" onSubmit={submitSchedule}>
              <h4>{po.state === 'approved' ? 'Revise ETA' : 'Reschedule delivery'}</h4>
              <div className="field">
                <label htmlFor="schedule-value">{po.state === 'approved' ? 'ETA days' : 'Expected delivery date'}</label>
                {po.state === 'approved' ? (
                  <input id="schedule-value" type="number" min="1" step="1" value={scheduleValue} onChange={(event) => setScheduleValue(event.target.value)} required />
                ) : (
                  <input id="schedule-value" type="date" value={scheduleValue} onChange={(event) => setScheduleValue(event.target.value)} required />
                )}
                <p className="field-hint">{po.state === 'approved' ? `Current ETA: ${po.etaDays} days` : `Current delivery date: ${po.expectedArrival}`}</p>
              </div>
              <div className="field">
                <label htmlFor="schedule-note">Correction note</label>
                <textarea id="schedule-note" value={scheduleNote} onChange={(event) => setScheduleNote(event.target.value)} rows={2} maxLength={500} required placeholder="e.g. Supplier delay" autoFocus />
                <p className="field-hint">Saved in the PO review history.</p>
              </div>
              {scheduleError ? <p className="form-error" role="alert">{scheduleError}</p> : null}
              <div className="dialog-actions">
                <button type="button" className="button button-secondary button-small" onClick={() => { setRescheduling(false); setScheduleError(''); }}>Cancel</button>
                <button type="submit" className="button button-primary button-small" disabled={busy}>Save schedule</button>
              </div>
            </form>
          ) : null}

          <details className="source">
            <summary>{po.manual ? 'Manual PO details' : 'Original email text'}</summary>
            <pre>{po.body || po.preview || '(No text body)'}</pre>
          </details>

          <div className="dialog-actions po-actions">
            {po.state === 'pending_review' ? (
              <>
                <button type="button" className="button button-secondary button-small" onClick={() => { setCorrecting(true); setRejecting(false); }}>Correct fields</button>
                <button type="button" className="button button-danger-ghost button-small" onClick={() => { setRejecting(true); setCorrecting(false); }}>Reject…</button>
                <button type="button" className="button button-primary" onClick={() => onAction('approve')} disabled={busy}>Approve</button>
              </>
            ) : null}
            {po.state === 'approved' ? (
              <>
                <button type="button" className="button button-danger-ghost button-small" onClick={() => setRejecting(true)}>Reject…</button>
                <button type="button" className="button button-secondary button-small" onClick={openReschedule} disabled={busy}>Revise ETA…</button>
                <button type="button" className="button button-primary" onClick={() => { setOrdering(true); setReplacingProof(false); setRescheduling(false); setRejecting(false); setCorrecting(false); setProofError(''); setProofFile(null); setProofPreview(''); }} disabled={busy}>Set Ordered / Incoming…</button>
              </>
            ) : null}
            {po.state === 'rejected' || po.state === 'unverified' ? (
              <button type="button" className="button button-secondary button-small" onClick={() => setCorrecting(true)}>Correct fields</button>
            ) : null}
            {po.state === 'rejected' ? (
              <button type="button" className="button button-primary" onClick={() => onAction('resubmit')} disabled={busy || po.poStatus !== 'valid'}>Resubmit for review</button>
            ) : null}
            {po.state === 'ordered' ? (
              <>
                {po.delivery?.status === 'received' ? null : (
                  <button type="button" className="button button-secondary button-small" onClick={openReschedule} disabled={busy}>Reschedule delivery…</button>
                )}
                <button type="button" className="button button-secondary button-small" onClick={() => { setReplacingProof(true); setOrdering(false); setRescheduling(false); setProofError(''); setProofFile(null); setProofPreview(''); }}>
                  {po.proof ? 'Replace proof…' : 'Add proof…'}
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="detail-body"><p className="detail-loading" role="status"><span className="spinner" aria-hidden="true" />{error || loading ? 'Loading order details…' : 'Order details unavailable.'}</p></div>
      )}
    </dialog>
  );
}

export function App() {
  const [status, setStatus] = useState(null);
  const [pos, setPos] = useState({ items: [], total: 0, counts: {} });
  const [stateFilter, setStateFilter] = useState('pending_review');
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
  const [view, setView] = useState('orders');
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
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#141610' : '#fbf6f6');
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
    if (!status?.auth.connected || view !== 'production') return undefined;
    let active = true;
    setProductionRuns(null);
    api('/api/production-runs')
      .then((data) => { if (active) setProductionRuns(data.items); })
      .catch((failure) => { if (active) { setProductionRuns([]); setError(failure.message); } });
    return () => { active = false; };
  }, [view, status?.auth.connected, status?.auth.account?.id, productionRevision]);

  useEffect(() => {
    if (!status?.auth.connected || view !== 'deliveries') return undefined;
    let active = true;
    setDeliveries(null);
    api('/api/deliveries')
      .then((data) => { if (active) setDeliveries(data.items); })
      .catch((failure) => { if (active) { setDeliveries([]); setError(failure.message); } });
    return () => { active = false; };
  }, [view, status?.auth.connected, status?.auth.account?.id, deliveryRevision]);

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
      setView('orders');
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
    setView('orders');
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
    if (!globalThis.confirm('Clear ALL local data for this account?\n\nThis deletes PO requests and review history, incoming proof and receipt pictures, inventory, incoming deliveries, production runs and definitions, and SKUs. Your approved senders and plant time zone are kept, as is the Gmail connection. Gmail is not changed. This cannot be undone.')) return;
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
        <header className="app-head"><Brand /><ThemeToggle theme={theme} onChange={changeTheme} /></header>
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
        <a className="skip-link" href={view === 'settings' ? '#settings' : view === 'orders' ? '#orders' : view === 'deliveries' ? '#deliveries' : view === 'inventory' ? '#inventory' : view === 'assemblies' ? '#assemblies' : '#production'}>
          Skip to {view === 'settings' ? 'settings' : view === 'orders' ? 'purchase orders' : view === 'deliveries' ? 'deliveries' : view === 'inventory' ? 'inventory' : view === 'assemblies' ? 'assemblies' : 'production'}
        </a>
      ) : null}
      <header className="app-head">
        <Brand />
        <div className="head-actions">
          <div className={`connection${status.auth.connected ? ' is-online' : ''}`} role="status">
            <span className="connection-dot" aria-hidden="true" />
            <span>
              <strong>{status.auth.connected ? 'Connected' : 'Not connected'}</strong>
              <small>{status.auth.connected ? status.auth.account.username : 'Gmail setup'}</small>
            </span>
          </div>
          <div className="head-tools">
            <ThemeToggle theme={theme} onChange={changeTheme} />
            {status.auth.connected ? (
              <>
                <button
                  type="button"
                  className={`button button-ghost button-small${view === 'settings' ? ' is-current' : ''}`}
                  aria-current={view === 'settings' ? 'page' : undefined}
                  onClick={() => showView('settings')}
                >
                  Settings
                </button>
                <button type="button" className="button button-ghost button-small" onClick={signOut}>Sign out</button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      {status.auth.connected ? (
        <nav className="view-tabs" aria-label="Dashboard views" ref={tabsRef}>
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
      ) : null}

      {!status.auth.connected ? (
        <section className="panel setup" aria-labelledby="setup-title">
          <div className="setup-copy">
            <p className="eyebrow">Gmail setup</p>
            <h2 id="setup-title">Connect your purchase order inbox</h2>
            <p className="lede">PO Checker reads Inbox mail with subject <strong>PO</strong>, assesses each request against stock, deliveries, and production demand, and keeps everything on this PC.</p>
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
      ) : view === 'settings' ? (
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
          onClearAllData={clearAllData}
        />
      ) : view === 'orders' ? (
        <>
          <RunStrip status={status} />
          <div className="workspace orders-workspace">
            <OrderNav counts={pos.counts || {}} stateFilter={stateFilter} setStateFilter={setStateFilter} setOffset={setOffset} />
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
      ) : view === 'deliveries' ? (
        <DeliveriesView deliveries={deliveries} onAdd={openNewDelivery} onEdit={openDelivery} onReceive={startReceive} busy={deliveryBusy} />
      ) : view === 'inventory' ? (
        <InventoryView items={inventory} onAdd={openNewInventoryItem} onEdit={openInventoryItem} />
      ) : view === 'assemblies' ? (
        <AssembliesView assemblies={productionItems} onAdd={openNewProductionItem} onEdit={openProductionItem} />
      ) : (
        <ProductionView runs={productionRuns} onAdd={openNewProductionRun} onEdit={openProductionRun} />
      )}

      <footer className="app-foot">
        <span>Gmail Inbox · subject PO · exact senders</span>
        <span aria-hidden="true">·</span>
        <span>Data stays on this PC</span>
      </footer>

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

function ReceivingApp() {
  const [status, setStatus] = useState(null);
  const [deliveries, setDeliveries] = useState(null);
  const [error, setError] = useState('');
  const [receiving, setReceiving] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const current = await api('/api/status');
      setStatus(current);
      if (current.auth.connected) {
        const data = await api('/api/deliveries');
        setDeliveries(data.items);
      } else {
        setDeliveries([]);
      }
      setError('');
    } catch (failure) {
      setError(failure.message);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, []);

  async function confirmReceive(quantity, file) {
    if (!receiving) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/deliveries/${encodeURIComponent(receiving.id)}/receive`, {
        method: 'POST',
        headers: {
          'Content-Type': file.type,
          'X-File-Name': encodeURIComponent(file.name || 'receipt'),
          'X-Received-Quantity': String(quantity),
        },
        body: file,
      });
      setReceiving(null);
      await load();
    } catch (failure) {
      setError(failure.message);
      throw failure;
    } finally {
      setBusy(false);
    }
  }

  const incoming = deliveries ? deliveries.filter((delivery) => delivery.status === 'incoming').length : 0;

  return (
    <main className="shell receiving-shell">
      <header className="app-head">
        <Brand />
        <span className="eyebrow">Receiving station</span>
      </header>
      {!status ? (
        <section className="panel loading-card" role="status">
          <span className="spinner" aria-hidden="true" />
          <div><h2>Loading receiving…</h2><p>Reading local deliveries.</p></div>
        </section>
      ) : !status.auth.connected ? (
        <section className="panel setup">
          <div className="setup-copy">
            <p className="eyebrow">Receiving station</p>
            <h2>Connect PO Checker first</h2>
            <p className="lede">Open the main dashboard, connect the Gmail account, and set up deliveries before using this receiving interface.</p>
          </div>
        </section>
      ) : (
        <section className="panel record-panel deliveries" aria-labelledby="receiving-title">
          <header className="panel-head record-head">
            <div><p className="eyebrow">Incoming supply</p><h2 id="receiving-title">Deliveries</h2></div>
            <span className="count">{deliveries ? `${deliveries.length} total` : '—'}</span>
          </header>
          {deliveries === null ? (
            <div className="record-loading" role="status"><span className="spinner" aria-hidden="true" />Loading deliveries…</div>
          ) : (
            <>
              <div className="record-summary">
                <div><span className="metric-label">Awaiting receipt</span><strong>{incoming}</strong></div>
                <div><span className="metric-label">Received</span><strong>{deliveries.length - incoming}</strong></div>
                <div><span className="metric-label">Total</span><strong>{deliveries.length}</strong></div>
              </div>
              <div className="record-list">
                {deliveries.map((delivery) => {
                  const received = delivery.status === 'received';
                  const receivedQuantity = delivery.receivedQuantity ?? delivery.quantity;
                  return (
                    <div className="delivery-row" key={delivery.id}>
                      <div className="delivery-main">
                        <div className="delivery-top">
                          <strong>{delivery.itemSku}</strong>
                          <span className={`status-chip ${received ? 'completed' : 'scheduled'}`}>{received ? 'Received' : 'Incoming'}</span>
                          {delivery.poId ? <span className="delivery-po">{delivery.poId}</span> : <span className="delivery-po">Manual</span>}
                        </div>
                        <span className="delivery-meta">{delivery.supplier || 'No supplier'} · arrives {scheduleDate(delivery.expectedArrival)}</span>
                        {received ? (
                          <span className="delivery-meta">
                            Received {receivedQuantity} {delivery.unit}
                            {delivery.receivedQuantity != null && delivery.receivedQuantity !== delivery.quantity ? ` (planned ${delivery.quantity} ${delivery.unit})` : ''}
                            {' '}on {fullDate(delivery.receivedAt)}
                          </span>
                        ) : null}
                      </div>
                      <div className="delivery-side">
                        <span className="inventory-qty">{received ? receivedQuantity : delivery.quantity}<small>{delivery.unit}</small></span>
                      </div>
                      <div className="delivery-actions">
                        {received ? (
                          delivery.receipt
                            ? <a className="text-link" href={`/api/deliveries/${encodeURIComponent(delivery.id)}/receipt?v=${encodeURIComponent(delivery.receipt.createdAt)}`} target="_blank" rel="noreferrer">Receipt ↗</a>
                            : <span className="muted">No receipt</span>
                        ) : (
                          <button type="button" className="button button-primary button-small" onClick={() => setReceiving(delivery)} disabled={busy}>Receive</button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {!deliveries.length ? (
                  <div className="empty">
                    <span className="empty-mark" aria-hidden="true">IN</span>
                    <strong>No deliveries</strong>
                    <p>Incoming deliveries will appear here for receiving.</p>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </section>
      )}

      {receiving ? (
        <ReceiveDeliveryDialog delivery={receiving} busy={busy} onClose={() => { if (!busy) setReceiving(null); }} onConfirm={confirmReceive} />
      ) : null}
      <ToastStack toasts={error ? [{ id: 'error', tone: 'error', message: error }] : []} onDismiss={() => setError('')} />
    </main>
  );
}

function FloorProgressDialog({ run, busy, onClose, onSave }) {
  const dialogRef = useSheetDialog(onClose);
  const [completed, setCompleted] = useState(String(run.completedQuantity));
  const [formError, setFormError] = useState('');
  const titleId = `floor-progress-title-${run.id}`;

  async function submit(event) {
    event.preventDefault();
    setFormError('');
    try {
      await onSave(Number(completed));
    } catch (failure) {
      setFormError(failure.message);
    }
  }

  return (
    <dialog ref={dialogRef} className="detail floor-progress-dialog" aria-labelledby={titleId}>
      <header className="detail-head">
        <div><p className="eyebrow">{run.runNumber}</p><h2 id={titleId}>Update completed units</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close progress form" disabled={busy}>×</button>
      </header>
      <form className="detail-body" onSubmit={submit}>
        <div className="field">
          <label htmlFor={`floor-done-${run.id}`}>Units completed</label>
          <input id={`floor-done-${run.id}`} type="number" min="0" max={run.quantity} step="1" required autoFocus value={completed} onChange={(event) => setCompleted(event.target.value)} disabled={busy} />
          <p className="field-hint">Of {run.quantity} {run.unit} planned. Reaching the planned quantity marks the run Completed.</p>
        </div>
        {formError ? <p className="form-error" role="alert">{formError}</p> : null}
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save progress'}</button>
        </div>
      </form>
    </dialog>
  );
}

function ProductionProgressRow({ run, onNotify }) {
  const [current, setCurrent] = useState(run);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setCurrent(run); }, [run]);

  async function save(completed) {
    setBusy(true);
    try {
      const result = await api(`/api/production_runs/${encodeURIComponent(run.id)}`, {
        method: 'PATCH', body: JSON.stringify({ completedQuantity: completed }),
      });
      setCurrent(result.item);
      setEditing(false);
      onNotify(result.item.status === 'completed' ? 'Run completed.' : 'Progress saved.');
    } finally {
      setBusy(false);
    }
  }

  return <>
    <ProductionRow run={current} onEdit={() => setEditing(true)} />
    {editing ? (
      <FloorProgressDialog run={current} busy={busy} onClose={() => { if (!busy) setEditing(false); }} onSave={save} />
    ) : null}
  </>;
}

function ProductionRunsApp() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    let disposed = false;
    let timer;
    async function load() {
      try {
        const result = await api('/api/production_runs');
        if (!disposed) { setData(result); setError(''); }
      } catch (failure) {
        if (!disposed) { setData(null); setError(failure.message); }
      } finally {
        if (!disposed) timer = setTimeout(load, 5000);
      }
    }
    load();
    return () => { disposed = true; clearTimeout(timer); };
  }, []);
  const runs = data?.items || [];
  const inProgress = runs.filter((run) => run.status === 'in_progress').length;
  const scheduled = runs.filter((run) => run.status === 'scheduled').length;
  return (
    <main className="shell">
      <header className="app-head"><Brand /><span className="eyebrow">Production floor</span></header>
      <section className="panel record-panel production" aria-labelledby="floor-title">
        <header className="panel-head record-head">
          <div>
            <p className="eyebrow">{data ? scheduleDate(data.today) : 'Daily schedule'}</p>
            <h2 id="floor-title">Production runs</h2>
          </div>
          <div className="record-actions">
            <span className="count">{data ? `${runs.length} ${runs.length === 1 ? 'run' : 'runs'}` : '—'}</span>
            <span className="floor-refresh">Refreshes every 5 seconds</span>
          </div>
        </header>
        {!data ? (!error ? <div className="record-loading" role="status"><span className="spinner" aria-hidden="true" />Loading production runs...</div> : null) : (
          <>
            <div className="record-summary">
              <div><span className="metric-label">In progress</span><strong>{inProgress}</strong></div>
              <div><span className="metric-label">Scheduled today</span><strong>{scheduled}</strong></div>
              <div><span className="metric-label">On the floor</span><strong>{runs.length}</strong></div>
            </div>
            <div className="record-list">
              {runs.map((run) => <ProductionProgressRow key={run.id} run={run} onNotify={setNotice} />)}
              {!runs.length ? (
                <div className="empty">
                  <span className="empty-mark" aria-hidden="true">PR</span>
                  <strong>No runs on the floor</strong>
                  <p>No runs are scheduled today or currently in progress.</p>
                </div>
              ) : null}
            </div>
          </>
        )}
      </section>
      <ToastStack
        toasts={[
          ...(error ? [{ id: 'error', tone: 'error', message: `${error} Open the main dashboard to check the connection.` }] : []),
          ...(notice ? [{ id: 'notice', tone: 'success', message: notice }] : []),
        ]}
        onDismiss={(id) => { if (id === 'error') setError(''); else setNotice(''); }}
      />
    </main>
  );
}
const pagePath = (globalThis.location?.pathname || '').replace(/\/+$/, '');
createRoot(document.getElementById('root')).render(pagePath === '/production_runs' ? <ProductionRunsApp /> : pagePath === '/deliveries' ? <ReceivingApp /> : <App />);
