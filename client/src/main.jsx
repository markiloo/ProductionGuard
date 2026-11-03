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
        <span className="brand-sub">Purchase order inbox</span>
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
      <button
        type="button"
        className="theme-option"
        aria-pressed={theme === 'light'}
        aria-label="Light theme"
        onClick={() => onChange('light')}
      >
        <SunIcon />
        <span>Light</span>
      </button>
      <button
        type="button"
        className="theme-option"
        aria-pressed={theme === 'dark'}
        aria-label="Dark theme"
        onClick={() => onChange('dark')}
      >
        <MoonIcon />
        <span>Dark</span>
      </button>
    </div>
  );
}

function StatusChip({ status }) {
  const review = status !== 'valid';
  return (
    <span className={`status-chip ${review ? 'review' : 'valid'}`}>
      <span className="status-dot" aria-hidden="true" />
      {review ? 'Needs review' : 'Parsed'}
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
        <span className="metric-label">Run started</span>
        <strong title={fullDate(collection.cutoff)}>{metricDate(collection.cutoff)}</strong>
        <small>Orders after this time are eligible</small>
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

function SenderPanel({ status, sender, setSender, onAdd, onRemove, busy }) {
  return (
    <aside className="panel sender-panel" aria-labelledby="senders-title">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Allowlist</p>
          <h2 id="senders-title">Approved senders</h2>
        </div>
        <span className="count">{status.senders.length}</span>
      </div>
      <p>Only subject-PO mail from these exact addresses is collected.</p>
      <form className="sender-form" onSubmit={onAdd}>
        <label className="sr-only" htmlFor="sender-address">Sender email address</label>
        <input
          id="sender-address"
          type="email"
          value={sender}
          onChange={(event) => setSender(event.target.value)}
          placeholder="name@example.com"
          autoComplete="off"
          required
        />
        <button type="submit" className="button button-primary button-small" disabled={busy}>Add</button>
      </form>
      {status.senders.length > 0 ? (
        <ul className="sender-list">
          {status.senders.map((address) => (
            <li key={address}>
              <span>{address}</span>
              <button
                type="button"
                className="button button-ghost button-small remove"
                onClick={() => onRemove(address)}
                aria-label={`Remove ${address}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="sender-empty">No approved senders yet. Add one above to start collecting.</p>
      )}
    </aside>
  );
}

function PoRow({ item, selected, onSelect }) {
  const meta = [item.supplier, item.senderName || item.senderAddress].filter(Boolean);
  return (
    <button
      type="button"
      className={`po-row${selected ? ' is-selected' : ''}`}
      data-status={item.poStatus}
      onClick={onSelect}
      aria-haspopup="dialog"
      aria-expanded={selected}
    >
      <span className="po-main">
        <span className="po-top">
          <strong className="po-item">{item.item || 'Item needs review'}</strong>
          <span className="po-qty">{item.quantity == null ? 'No quantity' : `${item.quantity} ${item.unit || ''}`.trim()}</span>
          <StatusChip status={item.poStatus} />
        </span>
        <span className="po-meta">{meta.join(' · ') || 'No supplier'}</span>
      </span>
      <span className="po-side">
        <span className="po-eta">{item.eta ? `ETA ${item.eta}` : 'No ETA'}</span>
        <time className="po-time" dateTime={item.receivedAt} title={fullDate(item.receivedAt)}>{shortDate(item.receivedAt)}</time>
        {item.hasAttachments ? <span className="po-attachment">Attachment</span> : null}
      </span>
    </button>
  );
}

function Inbox({ status, emails, query, setQuery, scope, setScope, offset, setOffset, selected, setSelected, busy, onClear }) {
  return (
    <section className="panel inbox" id="orders" tabIndex={-1} aria-labelledby="orders-title">
      <header className="panel-head inbox-head">
        <div>
          <p className="eyebrow">Purchase orders</p>
          <h2 id="orders-title">Saved orders</h2>
        </div>
        <div className="inbox-actions">
          <span className="count">{emails.total} {emails.total === 1 ? 'order' : 'orders'}</span>
          {status.features?.clearSavedInbox ? (
            <button
              type="button"
              className="button button-danger-ghost button-small"
              disabled={!status.totalCount || busy}
              onClick={onClear}
            >
              Clear saved
            </button>
          ) : null}
        </div>
      </header>
      <div className="tools">
        <label className="search-field">
          <span className="sr-only">Search purchase orders</span>
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setOffset(0); }}
            placeholder="Search item, supplier, or sender"
          />
        </label>
        <label className="scope-field">
          <span className="sr-only">History filter</span>
          <select value={scope} onChange={(event) => { setScope(event.target.value); setOffset(0); }}>
            <option value="current">This run</option>
            <option value="all">All saved history</option>
          </select>
        </label>
      </div>
      <div className="po-list">
        {emails.items.map((item) => (
          <PoRow
            key={item.id}
            item={item}
            selected={selected === item.id}
            onSelect={() => setSelected(item.id)}
          />
        ))}
        {!emails.items.length ? (
          <div className="empty">
            <span className="empty-mark" aria-hidden="true">PO</span>
            {query ? (
              <>
                <strong>No orders match “{query}”</strong>
                <p>Try a different search, or switch to all saved history.</p>
              </>
            ) : scope === 'current' && status.totalCount > 0 ? (
              <>
                <strong>No orders this run</strong>
                <p>{status.totalCount} saved {status.totalCount === 1 ? 'order is' : 'orders are'} in history.</p>
                <button
                  type="button"
                  className="button button-secondary button-small"
                  onClick={() => { setScope('all'); setOffset(0); }}
                >
                  View all saved history
                </button>
              </>
            ) : status.senders.length ? (
              <>
                <strong>No purchase orders yet</strong>
                <p>New subject-PO messages from approved senders will appear here.</p>
              </>
            ) : (
              <>
                <strong>Add a sender to begin</strong>
                <p>Only messages from addresses on your allowlist are collected.</p>
              </>
            )}
          </div>
        ) : null}
      </div>
      <footer className="pagination">
        <button
          type="button"
          className="button button-secondary button-small"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - 25))}
        >
          Newer
        </button>
        <span>{emails.total ? `${offset + 1}–${Math.min(offset + 25, emails.total)} of ${emails.total}` : '0 orders'}</span>
        <button
          type="button"
          className="button button-secondary button-small"
          disabled={offset + 25 >= emails.total}
          onClick={() => setOffset(offset + 25)}
        >
          Older
        </button>
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
          {item.sku ? <span className="inventory-sku">{item.sku}</span> : null}
          {lowStock ? <span className="status-chip review">Low stock</span> : null}
        </div>
        <span className="inventory-meta">{meta || 'No supplier'}</span>
        {item.notes ? <span className="inventory-notes">{item.notes}</span> : null}
      </div>
      <div className="inventory-side">
        <span className="inventory-qty">{item.quantity}<small>{item.unit}</small></span>
        <time className="inventory-updated" dateTime={item.updatedAt} title={fullDate(item.updatedAt)}>Updated {shortDate(item.updatedAt)}</time>
      </div>
      <button
        type="button"
        className="button button-ghost button-small inventory-edit"
        onClick={() => onEdit(item)}
        aria-label={`Edit ${item.item}`}
      >
        Edit
      </button>
    </div>
  );
}

function InventoryView({ items, onAdd, onEdit }) {
  const lowStock = items ? items.filter((item) => item.reorderLevel != null && item.quantity <= item.reorderLevel).length : 0;
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
        <div className="record-loading" role="status">
          <span className="spinner" aria-hidden="true" />
          Loading inventory…
        </div>
      ) : (
        <>
          <div className="record-summary">
            <div>
              <span className="metric-label">Items</span>
              <strong>{items.length}</strong>
            </div>
            <div>
              <span className="metric-label">Low stock</span>
              <strong className={lowStock ? 'text-danger' : ''}>{lowStock}</strong>
            </div>
            <div>
              <span className="metric-label">Last updated</span>
              <strong>{lastUpdated ? metricDate(lastUpdated) : '—'}</strong>
            </div>
          </div>
          <div className="record-list">
            {items.map((item) => <InventoryRow key={item.id} item={item} onEdit={onEdit} />)}
            {!items.length ? (
              <div className="empty">
                <span className="empty-mark" aria-hidden="true">ST</span>
                <strong>No inventory items yet</strong>
                <p>Add an item to start tracking stock on this PC.</p>
                <button type="button" className="button button-secondary button-small" onClick={onAdd}>Add your first item</button>
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
      await onSave({
        item,
        sku,
        quantity: Number(quantity),
        unit,
        supplier,
        reorderLevel: reorderLevel === '' ? null : Number(reorderLevel),
        notes,
      });
    } catch (failure) {
      setFormError(failure.message);
    }
  }

  async function remove() {
    if (!globalThis.confirm(`Delete “${item}” from inventory? This cannot be undone.`)) return;
    setFormError('');
    try {
      await onDelete();
    } catch (failure) {
      setFormError(failure.message);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="detail inventory-dialog"
      aria-labelledby="inventory-dialog-title"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <header className="detail-head">
        <div>
          <p className="eyebrow">Inventory</p>
          <h2 id="inventory-dialog-title">{editing ? 'Edit inventory item' : 'Add inventory item'}</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close inventory form" disabled={busy}>×</button>
      </header>
      <form className="detail-body inventory-form" onSubmit={submit}>
        <div className="form-grid">
          <div className="field field-wide">
            <label htmlFor="inventory-item">Item name</label>
            <input
              id="inventory-item"
              value={item}
              onChange={(event) => setItem(event.target.value)}
              maxLength={120}
              placeholder="e.g. Bearings"
              required
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="inventory-sku">SKU</label>
            <input id="inventory-sku" value={sku} onChange={(event) => setSku(event.target.value)} maxLength={60} placeholder="Optional" />
          </div>
          <div className="field">
            <label htmlFor="inventory-supplier">Supplier</label>
            <input id="inventory-supplier" value={supplier} onChange={(event) => setSupplier(event.target.value)} maxLength={120} placeholder="Optional" />
          </div>
          <div className="field">
            <label htmlFor="inventory-quantity">Quantity on hand</label>
            <input
              id="inventory-quantity"
              type="number"
              min="0"
              step="1"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="inventory-unit">Unit</label>
            <input id="inventory-unit" value={unit} onChange={(event) => setUnit(event.target.value)} maxLength={20} list="inventory-units" required />
            <datalist id="inventory-units">
              <option value="units" />
              <option value="kg" />
              <option value="boxes" />
              <option value="liters" />
            </datalist>
          </div>
          <div className="field">
            <label htmlFor="inventory-reorder">Reorder level</label>
            <input
              id="inventory-reorder"
              type="number"
              min="0"
              step="1"
              value={reorderLevel}
              onChange={(event) => setReorderLevel(event.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="field field-wide">
            <label htmlFor="inventory-notes">Notes</label>
            <textarea
              id="inventory-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Optional storage notes, bin location, etc."
            />
          </div>
        </div>
        {formError ? <p className="form-error" role="alert">{formError}</p> : null}
        <div className="dialog-actions">
          {editing ? (
            <button type="button" className="button button-danger-ghost dialog-delete" onClick={remove} disabled={busy}>Delete</button>
          ) : null}
          <button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add item'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function ProductionRow({ run, onEdit }) {
  return (
    <div className="production-row">
      <div className="production-main">
        <div className="production-top">
          <span className="production-run">{run.runNumber}</span>
          <strong className="production-name">{run.item}</strong>
          <ProductionStatusChip status={run.status} />
        </div>
        <span className="production-meta">
          Scheduled {scheduleDate(run.scheduledDate)}{run.notes ? ` · ${run.notes}` : ''}
        </span>
      </div>
      <div className="production-side">
        <span className="production-qty">{run.quantity}<small>{run.unit}</small></span>
        <time className="production-updated" dateTime={run.updatedAt} title={fullDate(run.updatedAt)}>Updated {shortDate(run.updatedAt)}</time>
      </div>
      <button
        type="button"
        className="button button-ghost button-small production-edit"
        onClick={() => onEdit(run)}
        aria-label={`Edit ${run.runNumber}`}
      >
        Edit
      </button>
    </div>
  );
}

function ProductionView({ runs, onAdd, onEdit }) {
  const inProgress = runs ? runs.filter((run) => run.status === 'in_progress').length : 0;
  const nextRun = runs
    ? runs
      .filter((run) => run.status === 'scheduled' || run.status === 'in_progress')
      .sort((first, second) => first.scheduledDate.localeCompare(second.scheduledDate))[0] || null
    : null;
  return (
    <section className="panel record-panel production" id="production" tabIndex={-1} aria-labelledby="production-title">
      <header className="panel-head record-head">
        <div>
          <p className="eyebrow">Schedule</p>
          <h2 id="production-title">Production</h2>
        </div>
        <div className="record-actions">
          <span className="count">{runs ? `${runs.length} ${runs.length === 1 ? 'run' : 'runs'}` : '—'}</span>
          <button type="button" className="button button-primary button-small" onClick={onAdd}>Add run</button>
        </div>
      </header>
      {runs === null ? (
        <div className="record-loading" role="status">
          <span className="spinner" aria-hidden="true" />
          Loading production schedule…
        </div>
      ) : (
        <>
          <div className="record-summary">
            <div>
              <span className="metric-label">Runs</span>
              <strong>{runs.length}</strong>
            </div>
            <div>
              <span className="metric-label">In progress</span>
              <strong>{inProgress}</strong>
            </div>
            <div>
              <span className="metric-label">Next run</span>
              <strong>{nextRun ? scheduleDate(nextRun.scheduledDate) : '—'}</strong>
            </div>
          </div>
          <div className="record-list">
            {runs.map((run) => <ProductionRow key={run.id} run={run} onEdit={onEdit} />)}
            {!runs.length ? (
              <div className="empty">
                <span className="empty-mark" aria-hidden="true">PR</span>
                <strong>No production runs yet</strong>
                <p>Add a scheduled run to see it on the production board.</p>
                <button type="button" className="button button-secondary button-small" onClick={onAdd}>Add your first run</button>
              </div>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

function ProductionDialog({ draft, busy, onClose, onSave, onDelete }) {
  const dialogRef = useSheetDialog(onClose);
  const editing = Boolean(draft.id);
  const runNumber = draft.runNumber || '';
  const [item, setItem] = useState(draft.item || '');
  const [quantity, setQuantity] = useState(String(draft.quantity ?? 1));
  const [unit, setUnit] = useState(draft.unit || 'units');
  const [status, setStatus] = useState(draft.status || 'scheduled');
  const [scheduledDate, setScheduledDate] = useState(draft.scheduledDate || todayDate());
  const [notes, setNotes] = useState(draft.notes || '');
  const [formError, setFormError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setFormError('');
    try {
      await onSave({
        runNumber,
        item,
        quantity: Number(quantity),
        unit,
        status,
        scheduledDate,
        notes,
      });
    } catch (failure) {
      setFormError(failure.message);
    }
  }

  async function remove() {
    if (!globalThis.confirm(`Delete run ${draft.runNumber} for “${item}”? This cannot be undone.`)) return;
    setFormError('');
    try {
      await onDelete();
    } catch (failure) {
      setFormError(failure.message);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="detail production-dialog"
      aria-labelledby="production-dialog-title"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <header className="detail-head">
        <div>
          <p className="eyebrow">Production</p>
          <h2 id="production-dialog-title">{editing ? 'Edit production run' : 'Add production run'}</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close production form" disabled={busy}>×</button>
      </header>
      <form className="detail-body production-form" onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="production-run">Run number</label>
            <input
              id="production-run"
              value={runNumber}
              readOnly
              aria-readonly="true"
              required
            />
            <p className="field-hint">{editing ? 'Run numbers stay fixed.' : 'Generated automatically.'}</p>
          </div>
          <div className="field">
            <label htmlFor="production-status">Status</label>
            <select id="production-status" value={status} onChange={(event) => setStatus(event.target.value)}>
              {Object.entries(PRODUCTION_STATUS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="field field-wide">
            <label htmlFor="production-item">Item</label>
            <input id="production-item" value={item} onChange={(event) => setItem(event.target.value)} maxLength={120} placeholder="e.g. Bearings" required autoFocus />
          </div>
          <div className="field">
            <label htmlFor="production-quantity">Quantity</label>
            <input
              id="production-quantity"
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="production-unit">Unit</label>
            <input id="production-unit" value={unit} onChange={(event) => setUnit(event.target.value)} maxLength={20} list="production-units" required />
            <datalist id="production-units">
              <option value="units" />
              <option value="kg" />
              <option value="boxes" />
              <option value="liters" />
            </datalist>
          </div>
          <div className="field field-wide">
            <label htmlFor="production-date">Scheduled date</label>
            <input
              id="production-date"
              type="date"
              value={scheduledDate}
              onChange={(event) => setScheduledDate(event.target.value)}
              required
            />
          </div>
          <div className="field field-wide">
            <label htmlFor="production-notes">Notes</label>
            <textarea
              id="production-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Optional line, machine, or handoff notes."
            />
          </div>
        </div>
        {formError ? <p className="form-error" role="alert">{formError}</p> : null}
        <div className="dialog-actions">
          {editing ? (
            <button type="button" className="button button-danger-ghost dialog-delete" onClick={remove} disabled={busy}>Delete</button>
          ) : null}
          <button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add run'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function DetailDialog({ detail, error, onClose }) {
  const dialogRef = useSheetDialog(onClose);

  return (
    <dialog
      ref={dialogRef}
      className="detail"
      aria-labelledby="po-detail-title"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <header className="detail-head">
        <div>
          <p className="eyebrow">Purchase order details</p>
          <h2 id="po-detail-title">{detail?.subject || 'Order details'}</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close details">×</button>
      </header>
      {detail ? (
        <div className="detail-body">
          <div className="detail-flags">
            <StatusChip status={detail.poStatus} />
            {detail.poError ? <p className="review-note">{detail.poError}</p> : null}
          </div>
          <dl className="po-grid" aria-label="Parsed purchase order">
            <div className="po-field po-field-wide">
              <dt>Item</dt>
              <dd>{detail.item || '—'}</dd>
            </div>
            <div className="po-field">
              <dt>Quantity</dt>
              <dd className="mono">{detail.quantity ?? '—'}</dd>
            </div>
            <div className="po-field">
              <dt>Unit</dt>
              <dd>{detail.unit || '—'}</dd>
            </div>
            <div className="po-field">
              <dt>ETA</dt>
              <dd>{detail.eta || '—'}</dd>
            </div>
            <div className="po-field po-field-wide">
              <dt>Supplier</dt>
              <dd>{detail.supplier || '—'}</dd>
            </div>
          </dl>
          <dl className="meta-grid">
            <div>
              <dt>From</dt>
              <dd>{detail.senderName ? `${detail.senderName} <${detail.senderAddress}>` : detail.senderAddress}</dd>
            </div>
            <div>
              <dt>Received</dt>
              <dd>{fullDate(detail.receivedAt)}</dd>
            </div>
            {['To', 'Cc', 'Bcc'].map((type) => {
              const recipients = detail.recipients.filter((recipient) => recipient.type === type);
              if (!recipients.length) return null;
              return (
                <div key={type}>
                  <dt>{type}</dt>
                  <dd>{recipients.map((recipient) => (recipient.name ? `${recipient.name} <${recipient.address}>` : recipient.address)).join(', ')}</dd>
                </div>
              );
            })}
          </dl>
          <details className="source">
            <summary>Original email text</summary>
            <pre>{detail.body || detail.preview || '(No text body)'}</pre>
          </details>
        </div>
      ) : (
        <div className="detail-body">
          <p className="detail-loading" role="status">
            <span className="spinner" aria-hidden="true" />
            {error || 'Loading order details…'}
          </p>
        </div>
      )}
    </dialog>
  );
}

export function App() {
  const [status, setStatus] = useState(null);
  const [emails, setEmails] = useState({ items: [], total: 0 });
  const [scope, setScope] = useState('current');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [email, setEmail] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [sender, setSender] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'));
  const [view, setView] = useState('orders');
  const [inventory, setInventory] = useState(null);
  const [inventoryRevision, setInventoryRevision] = useState(0);
  const [inventoryDraft, setInventoryDraft] = useState(null);
  const [inventoryBusy, setInventoryBusy] = useState(false);
  const [productionRuns, setProductionRuns] = useState(null);
  const [productionRevision, setProductionRevision] = useState(0);
  const [productionDraft, setProductionDraft] = useState(null);
  const [productionBusy, setProductionBusy] = useState(false);
  const refreshSequence = useRef(0);

  async function refresh() {
    const sequence = ++refreshSequence.current;
    try {
      const current = await api('/api/status');
      if (sequence !== refreshSequence.current) return;
      setStatus(current);
      if (current.auth.connected) {
        const result = await api(`/api/emails?scope=${scope}&q=${encodeURIComponent(query)}&limit=25&offset=${offset}`);
        if (sequence === refreshSequence.current) setEmails(result);
      } else {
        setEmails({ items: [], total: 0 });
        setSelected(null);
        setInventory(null);
        setInventoryDraft(null);
        setProductionRuns(null);
        setProductionDraft(null);
      }
    } catch (failure) {
      if (sequence === refreshSequence.current) setError(failure.message);
    }
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [scope, query, offset]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('po-checker-theme', theme); } catch { /* Storage can be unavailable. */ }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#141610' : '#fbf6f6');
  }, [theme]);

  function changeTheme(next) {
    document.documentElement.dataset.theme = next;
    setTheme(next);
  }

  useEffect(() => {
    if (!status?.auth.connected || view !== 'inventory') return undefined;
    let active = true;
    setInventory(null);
    api('/api/inventory')
      .then((data) => { if (active) setInventory(data.items); })
      .catch((failure) => {
        if (active) {
          setInventory([]);
          setError(failure.message);
        }
      });
    return () => { active = false; };
  }, [view, status?.auth.connected, status?.auth.account?.id, inventoryRevision]);

  useEffect(() => {
    if (!status?.auth.connected || view !== 'production') return undefined;
    let active = true;
    setProductionRuns(null);
    api('/api/production-runs')
      .then((data) => { if (active) setProductionRuns(data.items); })
      .catch((failure) => {
        if (active) {
          setProductionRuns([]);
          setError(failure.message);
        }
      });
    return () => { active = false; };
  }, [view, status?.auth.connected, status?.auth.account?.id, productionRevision]);

  useEffect(() => {
    if (!selected) { setDetail(null); return undefined; }
    const controller = new AbortController();
    setDetail(null);
    api(`/api/emails/${encodeURIComponent(selected)}`, { signal: controller.signal })
      .then(setDetail)
      .catch((failure) => { if (failure.name !== 'AbortError') setError(failure.message); });
    return () => controller.abort();
  }, [selected]);

  async function action(fn) {
    setError('');
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

  const connect = (event) => {
    event.preventDefault();
    action(async () => {
      await api('/api/setup', { method: 'POST', body: JSON.stringify({ email, appPassword }) });
      setAppPassword('');
      setView('orders');
      setInventory(null);
      setInventoryDraft(null);
      setProductionRuns(null);
      setProductionDraft(null);
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

  const signOut = () => action(async () => {
    await api('/api/sign-out', { method: 'POST', body: '{}' });
    setSelected(null);
    setOffset(0);
    setView('orders');
    setInventory(null);
    setInventoryDraft(null);
    setProductionRuns(null);
    setProductionDraft(null);
  });

  const clearOrders = () => {
    if (!globalThis.confirm('Clear all locally saved purchase orders for this account? Gmail will not be changed.')) return;
    action(async () => {
      await api('/api/emails', { method: 'DELETE' });
      setSelected(null);
      setOffset(0);
    });
  };

  function showView(next) {
    setView(next);
    setSelected(null);
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

  async function openNewProductionRun() {
    try {
      const data = await api('/api/production-runs/next-number');
      setProductionDraft({
        id: null,
        runNumber: data.runNumber,
        item: '',
        quantity: 1,
        unit: 'units',
        status: 'scheduled',
        scheduledDate: todayDate(),
        notes: '',
      });
    } catch (failure) {
      setError(failure.message);
    }
  }

  function openProductionRun(run) {
    setProductionDraft({ ...run });
  }

  async function saveProductionRun(values) {
    setProductionBusy(true);
    try {
      const editing = Boolean(productionDraft?.id);
      const url = editing ? `/api/production-runs/${encodeURIComponent(productionDraft.id)}` : '/api/production-runs';
      await api(url, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(values) });
      setProductionDraft(null);
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

  if (!status) {
    return (
      <main className="shell">
        <header className="app-head">
          <Brand />
          <ThemeToggle theme={theme} onChange={changeTheme} />
        </header>
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
        <a
          className="skip-link"
          href={view === 'orders' ? '#orders' : view === 'inventory' ? '#inventory' : '#production'}
        >
          Skip to {view === 'orders' ? 'purchase orders' : view === 'inventory' ? 'inventory' : 'production'}
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
              <button type="button" className="button button-ghost button-small" onClick={signOut}>Sign out</button>
            ) : null}
          </div>
        </div>
      </header>

      {status.auth.connected ? (
        <nav className="view-tabs" aria-label="Dashboard views">
          <button
            type="button"
            className="view-tab"
            aria-current={view === 'orders' ? 'page' : undefined}
            onClick={() => showView('orders')}
          >
            Orders
          </button>
          <button
            type="button"
            className="view-tab"
            aria-current={view === 'inventory' ? 'page' : undefined}
            onClick={() => showView('inventory')}
          >
            Inventory
          </button>
          <button
            type="button"
            className="view-tab"
            aria-current={view === 'production' ? 'page' : undefined}
            onClick={() => showView('production')}
          >
            Production
          </button>
        </nav>
      ) : null}

      {error ? (
        <div className="alert" role="alert">
          <p className="alert-message">{error}</p>
          <button type="button" className="icon-button" onClick={() => setError('')} aria-label="Dismiss">×</button>
        </div>
      ) : null}
      {status.auth.error ? <div className="alert" role="status"><p className="alert-message">{status.auth.error}</p></div> : null}
      {status.collection.error ? <div className="alert" role="status"><p className="alert-message">{status.collection.error}</p></div> : null}

      {!status.auth.connected ? (
        <section className="panel setup" aria-labelledby="setup-title">
          <div className="setup-copy">
            <p className="eyebrow">Gmail setup</p>
            <h2 id="setup-title">Connect your purchase order inbox</h2>
            <p className="lede">
              PO Checker reads Inbox mail from approved senders and keeps messages with subject <strong>PO</strong>. Everything stays on this PC.
            </p>
            <ol className="setup-notes">
              <li><span aria-hidden="true">01</span><span>Turn on Google 2-Step Verification.</span></li>
              <li><span aria-hidden="true">02</span><span>Create a 16-character app password.</span></li>
              <li><span aria-hidden="true">03</span><span>Paste it here. Your normal Google password is never used.</span></li>
            </ol>
            <a className="text-link" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">
              Create an app password ↗
            </a>
          </div>
          <form className="setup-form" onSubmit={connect}>
            <div className="field">
              <label htmlFor="gmail-address">Gmail address</label>
              <input
                id="gmail-address"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@gmail.com"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="gmail-password">Google app password</label>
              <input
                id="gmail-password"
                type="password"
                autoComplete="off"
                value={appPassword}
                onChange={(event) => setAppPassword(event.target.value)}
                placeholder="16-character app password"
                required
              />
            </div>
            <button type="submit" className="button button-primary setup-submit" disabled={busy}>
              {busy ? 'Connecting…' : 'Connect Gmail'}
            </button>
            <p className="hint">
              The app password is encrypted for your Windows user. Never enter your normal Google password.
            </p>
          </form>
        </section>
      ) : view === 'orders' ? (
        <>
          <RunStrip status={status} />
          <div className="workspace">
            <SenderPanel
              status={status}
              sender={sender}
              setSender={setSender}
              onAdd={addSender}
              onRemove={removeSender}
              busy={busy}
            />
            <Inbox
              status={status}
              emails={emails}
              query={query}
              setQuery={setQuery}
              scope={scope}
              setScope={setScope}
              offset={offset}
              setOffset={setOffset}
              selected={selected}
              setSelected={setSelected}
              busy={busy}
              onClear={clearOrders}
            />
          </div>
        </>
      ) : view === 'inventory' ? (
        <InventoryView items={inventory} onAdd={openNewInventoryItem} onEdit={openInventoryItem} />
      ) : (
        <ProductionView runs={productionRuns} onAdd={openNewProductionRun} onEdit={openProductionRun} />
      )}

      <footer className="app-foot">
        <span>Gmail Inbox · subject PO · exact senders</span>
        <span aria-hidden="true">·</span>
        <span>Data stays on this PC</span>
      </footer>

      {selected ? <DetailDialog detail={detail} error={error} onClose={() => setSelected(null)} /> : null}
      {inventoryDraft ? (
        <InventoryDialog
          draft={inventoryDraft}
          busy={inventoryBusy}
          onClose={() => { if (!inventoryBusy) setInventoryDraft(null); }}
          onSave={saveInventory}
          onDelete={removeInventoryItem}
        />
      ) : null}
      {productionDraft ? (
        <ProductionDialog
          draft={productionDraft}
          busy={productionBusy}
          onClose={() => { if (!productionBusy) setProductionDraft(null); }}
          onSave={saveProductionRun}
          onDelete={removeProductionRun}
        />
      ) : null}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
