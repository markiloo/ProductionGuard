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

function shortDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
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

function StatusChip({ status }) {
  const review = status !== 'valid';
  return (
    <span className={`status-chip ${review ? 'review' : 'valid'}`}>
      <span className="status-dot" aria-hidden="true" />
      {review ? 'Needs review' : 'Parsed'}
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

function DetailDialog({ detail, error, onClose }) {
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
  });

  const clearOrders = () => {
    if (!globalThis.confirm('Clear all locally saved purchase orders for this account? Gmail will not be changed.')) return;
    action(async () => {
      await api('/api/emails', { method: 'DELETE' });
      setSelected(null);
      setOffset(0);
    });
  };

  if (!status) {
    return (
      <main className="shell">
        <header className="app-head"><Brand /></header>
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
      {status.auth.connected ? <a className="skip-link" href="#orders">Skip to purchase orders</a> : null}
      <header className="app-head">
        <Brand />
        {status.auth.connected ? (
          <div className="head-actions">
            <div className="connection is-online" role="status">
              <span className="connection-dot" aria-hidden="true" />
              <span>
                <strong>Connected</strong>
                <small>{status.auth.account.username}</small>
              </span>
            </div>
            <button type="button" className="button button-ghost button-small" onClick={signOut}>Sign out</button>
          </div>
        ) : null}
      </header>

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
      ) : (
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
      )}

      <footer className="app-foot">
        <span>Gmail Inbox · subject PO · exact senders</span>
        <span aria-hidden="true">·</span>
        <span>Data stays on this PC</span>
      </footer>

      {selected ? <DetailDialog detail={detail} error={error} onClose={() => setSelected(null)} /> : null}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
