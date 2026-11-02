import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}
const localDate = (value) => value ? new Date(value).toLocaleString() : 'Not yet';

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
      } else { setEmails({ items: [], total: 0 }); setSelected(null); }
    } catch (failure) { if (sequence === refreshSequence.current) setError(failure.message); }
  }
  useEffect(() => { refresh(); const timer = setInterval(refresh, 5000); return () => clearInterval(timer); }, [scope, query, offset]);
  useEffect(() => {
    if (!selected) { setDetail(null); return undefined; }
    const controller = new AbortController();
    setDetail(null);
    api(`/api/emails/${encodeURIComponent(selected)}`, { signal: controller.signal }).then(setDetail).catch((failure) => { if (failure.name !== 'AbortError') setError(failure.message); });
    return () => controller.abort();
  }, [selected]);
  async function action(fn) { setError(''); setBusy(true); try { await fn(); await refresh(); } catch (failure) { setError(failure.message); } finally { setBusy(false); } }

  if (!status) return <main className="shell"><header className="top"><div className="eyebrow">LOCAL GMAIL COLLECTOR</div><h1>PO Checker</h1></header><section className="card setup" role="status"><h2>{error || 'Loading your local dashboard…'}</h2><button onClick={refresh}>Try again</button></section></main>;
  return <main className="shell">
    <header className="top"><div><div className="eyebrow">LOCAL GMAIL COLLECTOR</div><h1>PO Checker</h1></div><div className={`connection ${status.auth.connected ? 'online' : ''}`}><i />{status.auth.connected ? `Connected · ${status.auth.account.username}` : 'Not connected'}</div></header>
    {error && <div className="alert" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss">×</button></div>}
    {status.auth.error && <div className="alert" role="status">{status.auth.error}</div>}
    {!status.auth.connected && <section className="setup card"><div className="section-head"><div><div className="eyebrow">GMAIL SETUP</div><h2>Connect your Gmail Inbox</h2></div></div><p>Use a Google app password for this local collector. Your Google account must have 2-Step Verification enabled. <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">Create an app password ↗</a></p><form onSubmit={(event) => { event.preventDefault(); action(async () => { await api('/api/setup', { method: 'POST', body: JSON.stringify({ email, appPassword }) }); setAppPassword(''); }); }}><label htmlFor="gmail-address">Gmail address</label><input id="gmail-address" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@gmail.com" required /><label htmlFor="gmail-password" className="field-label">Google app password</label><div className="inline"><input id="gmail-password" type="password" autoComplete="off" value={appPassword} onChange={(event) => setAppPassword(event.target.value)} placeholder="16-character app password" required /><button disabled={busy}>{busy ? 'Connecting…' : 'Connect Gmail'}</button></div></form></section>}
    {status.auth.connected && <>
      <section className="stats"><div className="stat card"><span>COLLECTOR STATUS</span><strong>{status.collection.error ? 'Attention needed' : status.collection.collecting ? 'Checking Inbox' : status.senders.length ? 'Monitoring' : 'Ready'}</strong><small>{status.collection.error || (status.senders.length ? 'Checks every 15 seconds' : 'Add a sender to begin collecting.')}</small></div><div className="stat card"><span>RUN STARTED</span><strong>{localDate(status.collection.cutoff)}</strong><small>Messages after this time are eligible</small></div><div className="stat card"><span>LAST COMPLETE CHECK</span><strong>{localDate(status.collection.lastSuccessAt)}</strong><small>{status.collection.currentRunCount} this run · {status.totalCount} saved</small></div></section>
      <section className="layout"><aside className="card sender-card"><div className="eyebrow">ALLOWLIST</div><h2>Approved senders</h2><p>Only messages from these exact email addresses are collected.</p><form onSubmit={(event) => { event.preventDefault(); action(async () => { await api('/api/senders', { method: 'POST', body: JSON.stringify({ address: sender }) }); setSender(''); }); }}><label htmlFor="sender">Email address</label><div className="inline"><input id="sender" type="email" value={sender} onChange={(event) => setSender(event.target.value)} placeholder="name@example.com" required /><button aria-label="Add sender">Add</button></div></form><ul className="sender-list">{status.senders.map((address) => <li key={address}><span>{address}</span><button className="remove" aria-label={`Remove ${address}`} onClick={() => action(() => api(`/api/senders/${encodeURIComponent(address)}`, { method: 'DELETE' }))}>Remove</button></li>)}</ul><button className="quiet signout" onClick={() => action(() => api('/api/sign-out', { method: 'POST', body: '{}' }))}>Sign out</button></aside>
      <section className="card inbox"><div className="inbox-head"><div><div className="eyebrow">COLLECTED MESSAGES</div><h2>Your Inbox activity</h2></div><div className="inbox-actions"><span className="count">{emails.total} messages</span><button className="clear-inbox" disabled={!status.totalCount || busy} onClick={() => { if (window.confirm('Clear all locally saved messages for this account? Gmail messages will not be changed.')) action(async () => { await api('/api/emails', { method: 'DELETE' }); setSelected(null); setOffset(0); }); }}>Clear saved inbox</button></div></div><div className="tools"><input aria-label="Search messages" value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0); }} placeholder="Search subject, sender, or text"/><select aria-label="History filter" value={scope} onChange={(event) => { setScope(event.target.value); setOffset(0); }}><option value="current">This run</option><option value="all">All saved history</option></select></div><div className="email-list">{emails.items.map((item) => <button className={`email-row ${selected === item.id ? 'selected' : ''}`} key={item.id} onClick={() => setSelected(item.id)}><span className="avatar">{item.senderName?.[0]?.toUpperCase() || item.senderAddress[0]?.toUpperCase()}</span><span className="email-copy"><strong>{item.subject || '(No subject)'}</strong><span>{item.senderName ? `${item.senderName} · ` : ''}{item.senderAddress}</span><small>{item.preview}</small></span><span className="email-meta">{localDate(item.receivedAt)}{item.hasAttachments ? <b title="Has attachments">▧</b> : null}</span></button>)}{!emails.items.length && <div className="empty"><span>◎</span><strong>{status.senders.length ? 'No messages found' : 'Add a sender to begin collecting.'}</strong><p>{status.senders.length ? 'Eligible messages received during this run will appear here.' : 'Your Inbox is quiet until you add an exact sender address.'}</p></div>}</div><footer className="pagination"><button disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 25))}>← Newer</button><span>{emails.total ? `${offset + 1}–${Math.min(offset + 25, emails.total)} of ${emails.total}` : '0 results'}</span><button disabled={offset + 25 >= emails.total} onClick={() => setOffset(offset + 25)}>Older →</button></footer></section></section>
      {selected && <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }} onKeyDown={(event) => { if (event.key === 'Escape') setSelected(null); }}><article className="detail card" role="dialog" aria-modal="true" aria-label="Message details" tabIndex={-1}><button className="close" autoFocus onClick={() => setSelected(null)} aria-label="Close">×</button>{detail ? <><div className="eyebrow">MESSAGE DETAILS</div><h2>{detail.subject || '(No subject)'}</h2><div className="detail-meta"><div><span>From</span>{detail.senderName} &lt;{detail.senderAddress}&gt;</div><div><span>Received</span>{localDate(detail.receivedAt)}</div>{['To', 'Cc', 'Bcc'].map((type) => <div key={type}><span>{type}</span>{detail.recipients.filter((recipient) => recipient.type === type).map((recipient) => recipient.name ? `${recipient.name} <${recipient.address}>` : recipient.address).join(', ') || '—'}</div>)}</div><pre>{detail.body || detail.preview || '(No text body)'}</pre></> : <p role="status">{error || 'Loading message details…'}</p>}</article></div>}
    </>}
    <footer className="app-foot">Gmail Inbox only · Exact sender matching · Data stored on this PC</footer>
  </main>;
}
createRoot(document.getElementById('root')).render(React.createElement(App));
