import { usePagination } from '../hooks/usePagination.js';
import { ListPagination } from '../components/ListPagination.jsx';
import { DeliveryAmounts, DeliveryReceiptLinks, DeliveryStatus, DeliveryTiming } from '../components/DeliveryDetails.jsx';

function DeliveryRow({ delivery, onEdit, onReceive, busy }) {
  const open = delivery.status === 'incoming';
  return (
    <div className="delivery-row">
      <div className="delivery-main">
        <div className="delivery-top">
          <strong>{delivery.itemSku}</strong>
          <DeliveryStatus delivery={delivery} />
          {delivery.poId ? <span className="delivery-po">{delivery.poId}</span> : <span className="delivery-po">Manual</span>}
          {delivery.proof ? <span className="status-chip valid">Proof</span> : null}
        </div>
        <span className="delivery-meta">{delivery.supplier || 'No supplier'}</span>
        <DeliveryTiming delivery={delivery} />
        <DeliveryReceiptLinks delivery={delivery} />
      </div>
      <div className="delivery-side">
        <DeliveryAmounts delivery={delivery} />
      </div>
      <div className="delivery-actions">
        {!open ? (
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

export function DeliveriesView({ deliveries, onAdd, onEdit, onReceive, busy }) {
  const pagination = usePagination(deliveries);
  const incoming = deliveries ? deliveries.filter((delivery) => delivery.status === 'incoming').length : 0;
  const received = deliveries ? deliveries.filter((delivery) => delivery.status === 'received').length : 0;
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
            <div><span className="metric-label">Received</span><strong>{received}</strong></div>
          </div>
          <div className="record-list">
            {pagination.visible.map((delivery) => <DeliveryRow key={delivery.id} delivery={delivery} onEdit={onEdit} onReceive={onReceive} busy={busy} />)}
            {!deliveries.length ? (
              <div className="empty">
                <span className="empty-mark" aria-hidden="true">IN</span>
                <strong>No incoming deliveries</strong>
                <p>Ordering an approved PO creates one linked delivery. You can also add one manually.</p>
              </div>
            ) : null}
          </div>
          <ListPagination {...pagination} label="Deliveries pages" />
        </>
      )}
    </section>
  );
}
