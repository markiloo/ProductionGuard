import { AssessmentChip, StateChip } from '../components/Chips.jsx';
import { SearchIcon } from '../components/SearchIcon.jsx';
import { ORDER_FILTERS, PO_STATES, WARNING_LABEL } from '../lib/constants.js';
import { fullDate, shortDate } from '../lib/format.js';

function PoRow({ item, selected, onSelect }) {
  const assessment = item.assessment;
  const meta = [item.supplier, item.senderName || item.senderAddress].filter(Boolean);
  const warnings = (assessment.warnings || []).map((warning) => WARNING_LABEL[warning.type]).filter(Boolean);
  return (
    <button
      type="button"
      className={`po-row${selected ? ' is-selected' : ''}`}
      data-status={assessment.flag}
      onClick={onSelect}
      aria-haspopup="dialog"
      aria-expanded={selected}
    >
      <span className="po-main">
        <span className="po-top">
          <span className="po-id">{item.poId}</span>
          <strong className="po-item">{item.item || 'Unmapped item'}</strong>
          <span className="po-qty">{item.quantity == null ? 'No quantity' : `${item.quantity} ${item.unit || ''}`.trim()}</span>
          <AssessmentChip assessment={assessment} />
        </span>
        <span className="po-meta">{meta.join(' · ') || 'No supplier'}</span>
        {warnings.length ? <span className="po-warnings">{[...new Set(warnings)].join(' · ')}</span> : null}
      </span>
      <span className="po-side">
        <StateChip state={item.state} />
        <span className="po-eta">{item.eta ? `ETA ${item.eta}` : 'No ETA'}</span>
        <time className="po-time" dateTime={item.receivedAt} title={fullDate(item.receivedAt)}>{shortDate(item.receivedAt)}</time>
        {item.hasAttachments ? <span className="po-attachment">Attachment</span> : null}
      </span>
    </button>
  );
}

export function OrderNav({ counts, stateFilter, setStateFilter, setOffset }) {
  return (
    <aside className="panel order-nav" aria-labelledby="order-nav-title">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Queues</p>
          <h2 id="order-nav-title">Orders</h2>
        </div>
      </div>
      <nav aria-label="Order status">
        {ORDER_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={`order-nav-item${stateFilter === filter.value ? ' is-current' : ''}${filter.value === 'all' ? ' order-nav-all' : ''}`}
            aria-current={stateFilter === filter.value ? 'page' : undefined}
            onClick={() => { setStateFilter(filter.value); setOffset(0); }}
          >
            <span>{filter.label}</span>
            <span className="count">{counts[filter.value] || 0}</span>
          </button>
        ))}
      </nav>
      <p className="order-nav-hint">New POs appear after the next inbox check.</p>
    </aside>
  );
}

export function PosPanel({ status, pos, stateFilter, sort, setSort, query, setQuery, offset, setOffset, selected, setSelected, busy, refreshing, onAdd, onRefresh, onClear }) {
  const emptyCopy = stateFilter === 'unverified'
    ? { title: 'No unverified orders', body: 'Incomplete, unauthorized, or multi-item PO mail appears here with its reason.' }
    : stateFilter === 'rejected'
      ? { title: 'No rejected orders', body: 'Rejected POs stay visible with their rejection history.' }
      : stateFilter === 'approved'
        ? { title: 'No approved orders', body: 'Approved POs wait here until they are ordered or rejected.' }
        : stateFilter === 'ordered'
          ? { title: 'No ordered orders', body: 'Ordered POs create one linked incoming delivery.' }
          : { title: 'No purchase orders yet', body: 'New subject-PO messages will appear here for review.' };
  return (
    <section className="panel inbox" id="orders" tabIndex={-1} aria-labelledby="orders-title">
      <header className="panel-head inbox-head">
        <div>
          <p className="eyebrow">Purchase orders</p>
          <h2 id="orders-title">{stateFilter === 'all' ? 'All orders' : PO_STATES[stateFilter] || 'Review queue'}</h2>
        </div>
        <div className="inbox-actions">
          <span className="count">{pos.total} {pos.total === 1 ? 'order' : 'orders'}</span>
          <button type="button" className="button button-primary button-small" onClick={onAdd} disabled={busy}>Add PO</button>
          <button type="button" className="button button-secondary button-small" onClick={onRefresh} disabled={refreshing} aria-label="Recompute purchase order assessments">
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          {status.features?.clearSavedInbox ? (
            <button type="button" className="button button-danger-ghost button-small" disabled={!status.totalCount || busy} onClick={onClear}>Clear saved</button>
          ) : null}
        </div>
      </header>
      <div className="tools">
        <label className="search-field">
          <span className="sr-only">Search purchase orders</span>
          <SearchIcon />
          <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0); }} placeholder="Search PO ID, item, SKU, supplier, or sender" />
        </label>
        <button type="button" className="button button-secondary button-small" onClick={() => { setSort(sort === 'desc' ? 'asc' : 'desc'); setOffset(0); }}>
          {sort === 'desc' ? 'Newest first' : 'Oldest first'}
        </button>
      </div>
      <div className="po-list">
        {pos.items.map((item) => (
          <PoRow key={item.id} item={item} selected={selected === item.poId} onSelect={() => setSelected(item.poId)} />
        ))}
        {!pos.items.length ? (
          <div className="empty">
            <span className="empty-mark" aria-hidden="true">PO</span>
            {query ? (
              <>
                <strong>No orders match “{query}”</strong>
                <p>Try a different search, or switch status.</p>
              </>
            ) : (
              <>
                <strong>{emptyCopy.title}</strong>
                <p>{emptyCopy.body}</p>
              </>
            )}
          </div>
        ) : null}
      </div>
      <footer className="pagination">
        <button type="button" className="button button-secondary button-small" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))}>Newer</button>
        <span>{pos.total ? `${offset + 1}–${Math.min(offset + 25, pos.total)} of ${pos.total}` : '0 orders'}</span>
        <button type="button" className="button button-secondary button-small" disabled={offset + 25 >= pos.total} onClick={() => setOffset(offset + 25)}>Older</button>
      </footer>
    </section>
  );
}
