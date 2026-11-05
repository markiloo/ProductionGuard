import { useState } from 'react';
import { SearchIcon } from '../components/SearchIcon.jsx';
import { fullDate, metricDate, shortDate } from '../lib/format.js';

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

export function InventoryView({ items, onAdd, onEdit }) {
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
