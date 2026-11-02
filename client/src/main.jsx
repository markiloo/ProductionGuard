import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}
const date = (value) => value ? new Date(value).toLocaleString() : 'Not yet';

export function App() {
  const [status, setStatus] = useState(null); const [emails, setEmails] = useState({ items: [], total: 0 });
  const [scope, setScope] = useState('current'); const [query, setQuery] = useState(''); const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(null); const [clientId, setClientId] = useState(''); const [sender, setSender] = useState(''); const [code, setCode] = useState(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const refreshSequence = useRef(0);
  const refresh = async () => {
    const sequence = ++refreshSequence.current;
    try {
      const current = await api('/api/status');
      if (sequence !== refreshSequence.current) return;
      setStatus(current);
      if (current.auth.connected) {
        const result = await api(`/api/emails?scope=${scope}&q=${encodeURIComponent(query)}&limit=25&offset=${offset}`);
        if (sequence === refreshSequence.current) setEmails(result);
      } else { setEmails({ items: [], total: 0 }); setSelected(null); }
    } catch (e) { if (sequence === refreshSequence.current) setError(e.message); }
  };
  useEffect(() => { refresh(); const timer = setInterval(refresh, 5000); return () => clearInterval(timer); }, [scope, query, offset]);
  useEffect(() => { let timer; const poll = async () => { try { const result = await api('/api/sign-in'); setCode(result.code); if (result.error) setError(result.error); } catch { /* Retry while the local API starts. */ } timer = setTimeout(poll, 1500); }; poll(); return () => clearTimeout(timer); }, []);
  async function action(fn) { setError(''); setBusy(true); try { await fn(); await refresh(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  function loadDetail(id) { setSelected(id); }
  const [detail, setDetail] = useState(null);
  useEffect(() => {
    if (!selected) { setDetail(null); return undefined; }
    const controller = new AbortController();
    setDetail(null);
    api(`/api/emails/${encodeURIComponent(selected)}`, { signal: controller.signal }).then(setDetail).catch((e) => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, [selected]);
  if (!status) return <main className="shell"><header className="top"><div><div className="eyebrow">LOCAL OUTLOOK COLLECTOR</div><h1>PO Checker</h1></div></header><section className="card setup" role="status"><h2>{error ? 'Dashboard connection needs attention' : 'Loading your local dashboard…'}</h2><p>{error || 'Connecting to the collector on this PC.'}</p><button onClick={refresh}>Try again</button></section></main>;
  return <main className="shell">
    <header className="top"><div><div className="eyebrow">LOCAL OUTLOOK COLLECTOR</div><h1>PO Checker</h1></div><div className={`connection ${status?.auth.connected ? 'online' : ''}`}><i />{status?.auth.connected ? `Connected · ${status.auth.account.username}` : 'Not connected'}</div></header>
    {error && <div className="alert" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss">×</button></div>}
    {status?.auth.error && <div className="alert" role="status">{status.auth.error}</div>}
    {!status?.auth.configured && <section className="setup card"><div className="section-head"><div><div className="eyebrow">FIRST TIME SETUP</div><h2>Connect your Outlook inbox</h2></div><span className="step">01 / 02</span></div><p>Create a Microsoft app registration for personal Microsoft accounts with public client flows and delegated <code>Mail.Read</code>. No client secret is needed.</p><form onSubmit={(e) => { e.preventDefault(); action(() => api('/api/setup', { method: 'POST', body: JSON.stringify({ clientId }) })); }}><label htmlFor="client-id">Application (client) ID</label><div className="inline"><input id="client-id" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" required /><button disabled={busy}>Save ID</button></div></form></section>}
    {status?.auth.configured && !status.auth.connected && <section className="setup card"><div className="section-head"><div><div className="eyebrow">MICROSOFT ACCOUNT</div><h2>Sign in to continue</h2></div><span className="step">02 / 02</span></div><p>Sign in with the personal Outlook.com account whose Inbox you want to monitor.</p><button disabled={busy || status.auth.signingIn} onClick={() => action(() => api('/api/sign-in', { method: 'POST', body: '{}' }))}>{status.auth.signingIn ? 'Waiting for sign in…' : 'Sign in with Microsoft'}</button>{code && <div className="device-code"><div><strong>Enter this code</strong><code>{code.userCode}</code><small>Expires {date(code.expiresOn)}</small></div><a href={code.verificationUri} target="_blank" rel="noreferrer">Open Microsoft sign-in ↗</a><button className="quiet" onClick={() => action(() => api('/api/sign-in/cancel', { method: 'POST', body: '{}' }))}>Cancel</button></div>}</section>}
    {status?.auth.connected && <>
      {status.auth.needsInteractiveSignIn && <div className="alert" role="status">Microsoft sign-in needs renewal. <button onClick={() => action(() => api('/api/sign-in', { method: 'POST', body: '{}' }))}>{status.auth.signingIn ? 'Waiting for sign in…' : 'Sign in again'}</button>{code && <span> Enter code <code>{code.userCode}</code> at <a href={code.verificationUri} target="_blank" rel="noreferrer">Microsoft device sign-in</a>; expires {date(code.expiresOn)}.</span>}</div>}
      <section className="stats"><div className="stat card"><span>COLLECTOR STATUS</span><strong>{status.collection.error ? 'Attention needed' : status.collection.collecting ? 'Checking Inbox' : status.senders.length ? 'Monitoring' : 'Ready'}</strong><small>{status.collection.error || (status.senders.length ? 'Checks every 15 seconds' : 'Add a sender to begin collecting.')}</small></div><div className="stat card"><span>RUN STARTED</span><strong>{date(status.collection.cutoff)}</strong><small>Messages after this time are eligible</small></div><div className="stat card"><span>LAST COMPLETE CHECK</span><strong>{date(status.collection.lastSuccessAt)}</strong><small>{status.collection.currentRunCount} this run · {status.totalCount} saved</small></div></section>
      <section className="layout"><aside className="card sender-card"><div className="eyebrow">ALLOWLIST</div><h2>Approved senders</h2><p>Only messages from these exact email addresses are collected.</p><form onSubmit={(e) => { e.preventDefault(); action(async () => { await api('/api/senders', { method: 'POST', body: JSON.stringify({ address: sender }) }); setSender(''); }); }}><label htmlFor="sender">Email address</label><div className="inline"><input id="sender" type="email" value={sender} onChange={(e) => setSender(e.target.value)} placeholder="name@example.com" required /><button aria-label="Add sender">Add</button></div></form><ul className="sender-list">{status.senders.map((address) => <li key={address}><span>{address}</span><button className="remove" aria-label={`Remove ${address}`} onClick={() => action(() => api(`/api/senders/${encodeURIComponent(address)}`, { method: 'DELETE' }))}>Remove</button></li>)}</ul><button className="quiet signout" onClick={() => action(() => api('/api/sign-out', { method: 'POST', body: '{}' }))}>Sign out</button></aside>
      <section className="card inbox"><div className="inbox-head"><div><div className="eyebrow">COLLECTED MESSAGES</div><h2>Your Inbox activity</h2></div><span className="count">{emails.total} messages</span></div><div className="tools"><input aria-label="Search messages" value={query} onChange={(e) => { setQuery(e.target.value); setOffset(0); }} placeholder="Search subject, sender, or text"/><select aria-label="History filter" value={scope} onChange={(e) => { setScope(e.target.value); setOffset(0); }}><option value="current">This run</option><option value="all">All saved history</option></select></div><div className="email-list">{emails.items.map((item) => <button className={`email-row ${selected === item.id ? 'selected' : ''}`} key={item.id} onClick={() => loadDetail(item.id)}><span className="avatar">{item.senderName?.[0]?.toUpperCase() || item.senderAddress[0]?.toUpperCase()}</span><span className="email-copy"><strong>{item.subject || '(No subject)'}</strong><span>{item.senderName ? `${item.senderName} · ` : ''}{item.senderAddress}</span><small>{item.preview}</small></span><span className="email-meta">{date(item.receivedAt)}{item.hasAttachments ? <b title="Has attachments">▧</b> : null}</span></button>)}{!emails.items.length && <div className="empty"><span>◎</span><strong>{status.senders.length ? 'No messages found' : 'Add a sender to begin collecting.'}</strong><p>{status.senders.length ? 'Eligible messages received during this run will appear here.' : 'Your Inbox is quiet until you add an exact sender address.'}</p></div>}</div><footer className="pagination"><button disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 25))}>← Newer</button><span>{emails.total ? `${offset + 1}–${Math.min(offset + 25, emails.total)} of ${emails.total}` : '0 results'}</span><button disabled={offset + 25 >= emails.total} onClick={() => setOffset(offset + 25)}>Older →</button></footer></section></section>
      {selected && <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }} onKeyDown={(e) => { if (e.key === 'Escape') setSelected(null); }}><article className="detail card" role="dialog" aria-modal="true" aria-label="Message details" tabIndex={-1}><button className="close" autoFocus onClick={() => setSelected(null)} aria-label="Close">×</button>{detail ? <><div className="eyebrow">MESSAGE DETAILS</div><h2>{detail.subject || '(No subject)'}</h2><div className="detail-meta"><div><span>From</span>{detail.senderName} &lt;{detail.senderAddress}&gt;</div><div><span>Received</span>{date(detail.receivedAt)}</div>{['To', 'Cc', 'Bcc'].map((type) => <div key={type}><span>{type}</span>{detail.recipients.filter((recipient) => recipient.type === type).map((r) => r.name ? `${r.name} <${r.address}>` : r.address).join(', ') || '—'}</div>)}</div><pre>{detail.body || detail.preview || '(No text body)'}</pre></> : <p role="status">{error || 'Loading message details…'}</p>}</article></div>}
    </>}
    <footer className="app-foot">Inbox only · Exact sender matching · Data stored on this PC</footer>
  </main>;
}
createRoot(document.getElementById('root')).render(React.createElement(App));
