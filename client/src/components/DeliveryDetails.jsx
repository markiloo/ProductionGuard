import { remainingQuantity } from '../lib/delivery.js';
import { fullDate, scheduleDate } from '../lib/format.js';

export function DeliveryStatus({ delivery }) {
  const { status, receivedQuantity } = delivery;
  if (status === 'canceled') return <span className="status-chip rejected">{receivedQuantity > 0 ? 'Balance closed' : 'Canceled'}</span>;
  if (status === 'received') return <span className="status-chip completed">Received</span>;
  return <span className="status-chip scheduled">{receivedQuantity > 0 ? 'Partially received' : 'Incoming'}</span>;
}

export function DeliveryAmounts({ delivery }) {
  return (
    <div className="delivery-amounts">
      <span>Planned <strong>{delivery.quantity} {delivery.unit}</strong></span>
      <span>Received <strong>{delivery.receivedQuantity ?? 0} {delivery.unit}</strong></span>
      {delivery.status === 'incoming' ? <span>Remaining <strong>{remainingQuantity(delivery)} {delivery.unit}</strong></span> : null}
      {delivery.status === 'canceled' ? <span>Canceled <strong>{delivery.canceledQuantity} {delivery.unit}</strong></span> : null}
    </div>
  );
}

export function DeliveryTiming({ delivery }) {
  if (delivery.status === 'canceled') return <span className="delivery-meta">Closed {fullDate(delivery.closedAt)} · {delivery.closeReason}</span>;
  if (delivery.status === 'received') return <span className="delivery-meta">Received {fullDate(delivery.receivedAt)}</span>;
  return <span className="delivery-meta">Expected {scheduleDate(delivery.expectedArrival)}</span>;
}

export function DeliveryReceiptLinks({ delivery }) {
  const base = `/api/deliveries/${encodeURIComponent(delivery.id)}`;
  const receipts = delivery.receipts ?? (delivery.receipt ? [delivery.receipt] : []);
  if (!receipts.length) return null;
  return (
    <details className="delivery-receipts">
      <summary>{receipts.length === 1 ? '1 receipt' : `${receipts.length} receipts`}</summary>
      <ul>
        {receipts.map((receipt) => (
          <li key={receipt.id ?? receipt.createdAt}>
            <a className="text-link" href={receipt.id ? `${base}/receipts/${encodeURIComponent(receipt.id)}` : `${base}/receipt?v=${encodeURIComponent(receipt.createdAt)}`} target="_blank" rel="noreferrer">
              {receipt.quantity ?? delivery.receivedQuantity} {delivery.unit} · {fullDate(receipt.createdAt)} ↗
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
