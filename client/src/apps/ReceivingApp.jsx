import { useEffect, useState } from 'react';
import { Brand } from '../components/Brand.jsx';
import { ToastStack } from '../components/ToastStack.jsx';
import { ReceiveDeliveryDialog } from '../dialogs/ReceiveDeliveryDialog.jsx';
import { api } from '../lib/api.js';
import { fullDate, scheduleDate } from '../lib/format.js';

export function ReceivingApp() {
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
            <h2>Connect Prod. Guard first</h2>
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
