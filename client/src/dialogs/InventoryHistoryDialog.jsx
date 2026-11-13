import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { metricDate } from '../lib/format.js';
import { useSheetDialog } from '../hooks/useSheetDialog.js';

export function InventoryHistoryDialog({ item, onClose }) {
  const ref = useSheetDialog(onClose);
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setData(null); setError('');
    api(`/api/inventory/${encodeURIComponent(item.id)}/history?limit=25&offset=${offset}`)
      .then((result) => { if (active) setData(result); })
      .catch((failure) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [item.id, offset, revision]);
  return <dialog ref={ref} className="detail inventory-history-dialog" aria-labelledby="history-title">
    <header className="detail-head">
      <div><p className="eyebrow">Inventory history</p><h2 id="history-title">{item.item}</h2><p className="history-sku">{item.sku}</p></div>
      <button type="button" className="button" onClick={onClose}>Close</button>
    </header>
    <div className="detail-body">
      {error ? <div role="alert">{error}<button type="button" className="button" onClick={() => setRevision(revision + 1)}>Retry</button></div> : !data ? <p role="status">Loading history...</p> : <>
        <div className="record-summary"><div><span className="metric-label">Current stock</span><strong>{data.item.quantity.toLocaleString()} {data.item.unit}</strong></div></div>
        {data.items.length ? <InventoryHistoryTable entries={data.items} /> : <p>No history entries.</p>}
        <nav className="history-pagination" aria-label="History pages">
          <span role="status">{data.total ? `Showing ${offset + 1}–${Math.min(offset + 25, data.total)} of ${data.total}` : '0 entries'}</span>
          <button type="button" className="button button-small" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 25))}>Previous</button>
          <button type="button" className="button button-small" disabled={offset + 25 >= data.total} onClick={() => setOffset(offset + 25)}>Next</button>
        </nav>
      </>}
      <p className="history-note">History starts when stock tracking was enabled. Earlier changes are unavailable.</p>
    </div>
  </dialog>;
}

export function InventoryHistoryTable({ entries }) {
  return <div className="history-table-scroll" role="region" aria-label="Stock history table" tabIndex={0}>
    <table className="history-table">
      <caption className="sr-only">Stock changes, newest first</caption>
      <thead><tr>{['Date & time', 'Activity', 'Before', 'Change', 'After'].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
      <tbody>{entries.map((entry) => {
        const baseline = entry.kind === 'Starting balance';
        const unitChanged = entry.before_unit !== entry.unit;
        const difference = entry.after_quantity - entry.before_quantity;
        const change = baseline ? '\u2014' : unitChanged ? 'Unit changed' : `${difference >= 0 ? '+' : '\u2212'}${Math.abs(difference).toLocaleString()} ${entry.unit}`;
        return <tr key={entry.id}>
          <td><time dateTime={entry.created_at} title={new Date(entry.created_at).toLocaleString()}>{metricDate(entry.created_at)}</time></td>
          <td><strong>{entry.kind}</strong>{entry.delivery_id ? <><span className="history-secondary">{[entry.supplier, entry.po_id].filter(Boolean).join(' \u00b7 ')}</span><span className="history-reference">Delivery {entry.delivery_id}</span></> : null}</td>
          <td>{baseline ? '\u2014' : `${entry.before_quantity.toLocaleString()} ${entry.before_unit}`}</td>
          <td className="history-change">{change}</td>
          <td className="history-balance">{entry.after_quantity.toLocaleString()} {entry.unit}</td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}
