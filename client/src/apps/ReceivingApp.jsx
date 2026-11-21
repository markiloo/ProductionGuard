import { useEffect, useRef, useState } from 'react';
import { Brand } from '../components/Brand.jsx';
import { ToastStack } from '../components/ToastStack.jsx';
import { ReceiveDeliveryDialog } from '../dialogs/ReceiveDeliveryDialog.jsx';
import { DeliveryAmounts, DeliveryReceiptLinks, DeliveryStatus, DeliveryTiming } from '../components/DeliveryDetails.jsx';
import { api } from '../lib/api.js';
import { recordDeliveryReceipt } from '../lib/delivery.js';

export function ReceivingApp() {
  const [status, setStatus] = useState(null);
  const [deliveries, setDeliveries] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [receiving, setReceiving] = useState(null);
  const [busy, setBusy] = useState(false);
  const loadSequence = useRef(0);

  async function load() {
    const sequence = ++loadSequence.current;
    try {
      const current = await api('/api/status');
      if (sequence !== loadSequence.current) return;
      setStatus(current);
      if (current.auth.connected) {
        const data = await api('/api/deliveries');
        if (sequence !== loadSequence.current) return;
        setDeliveries(data.items);
      } else {
        setDeliveries([]);
      }
      setError('');
    } catch (failure) {
      if (sequence === loadSequence.current) setError(failure.message);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => { clearInterval(timer); loadSequence.current += 1; };
  }, []);

  async function confirmReceive(delivery, quantity, file, requestId) {
    setBusy(true);
    setError('');
    try {
      const result = await recordDeliveryReceipt(delivery, quantity, file, requestId);
      setReceiving(null);
      setNotice(result.alreadyReceived ? 'This batch is already recorded.' : `Received ${quantity} ${delivery.unit}. Stock updated.`);
      await load();
    } catch (failure) {
      if (failure.data?.delivery) setDeliveries((items) => items?.map((item) => item.id === delivery.id ? failure.data.delivery : item));
      throw failure;
    } finally {
      setBusy(false);
    }
  }

  const incoming = deliveries ? deliveries.filter((delivery) => delivery.status === 'incoming').length : 0;
  const received = deliveries ? deliveries.filter((delivery) => delivery.status === 'received').length : 0;

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
                <div><span className="metric-label">Received</span><strong>{received}</strong></div>
                <div><span className="metric-label">Total</span><strong>{deliveries.length}</strong></div>
              </div>
              <div className="record-list">
                {deliveries.map((delivery) => {
                  const open = delivery.status === 'incoming';
                  return (
                    <div className="delivery-row" key={delivery.id}>
                      <div className="delivery-main">
                        <div className="delivery-top">
                          <strong>{delivery.itemSku}</strong>
                          <DeliveryStatus delivery={delivery} />
                          {delivery.poId ? <span className="delivery-po">{delivery.poId}</span> : <span className="delivery-po">Manual</span>}
                        </div>
                        <span className="delivery-meta">{delivery.supplier || 'No supplier'}</span>
                        <DeliveryTiming delivery={delivery} />
                        <DeliveryReceiptLinks delivery={delivery} />
                      </div>
                      <div className="delivery-side">
                        <DeliveryAmounts delivery={delivery} />
                      </div>
                      <div className="delivery-actions">
                        {open ? (
                          <button type="button" className="button button-primary button-small" onClick={() => setReceiving(delivery)} disabled={busy}>Receive</button>
                        ) : null}
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
      <ToastStack toasts={[
        ...(error ? [{ id: 'error', tone: 'error', message: error }] : []),
        ...(notice ? [{ id: 'notice', tone: 'success', message: notice }] : []),
      ]} onDismiss={(id) => { if (id === 'error') setError(''); else setNotice(''); }} />
    </main>
  );
}
