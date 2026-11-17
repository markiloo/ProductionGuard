import { ProductionCalendar } from '../components/ProductionCalendar.jsx';
import { useEffect, useRef, useState } from 'react';
import { ProductionStatusChip } from '../components/Chips.jsx';
import { ProjectionChart } from '../components/ProjectionChart.jsx';
import { IncomingHorizonDialog } from '../dialogs/IncomingHorizonDialog.jsx';
import { ProjectionDialog } from '../dialogs/ProjectionDialog.jsx';
import { api } from '../lib/api.js';
import { scheduleDate } from '../lib/format.js';

const DEFAULT_HORIZON = 30;

export function ProjectionTile({ widget, busy, onEdit, onRemove }) {
  const projection = widget.projection;
  const firstStockout = projection.stockoutDates[0] || null;
  const excluded = projection.excluded.deliveries + projection.excluded.requirements;
  return (
    <article className="panel projection-tile">
      <header className="projection-head">
        <div>
          <p className="eyebrow">{projection.sku}</p>
          <h3>{projection.item}</h3>
        </div>
        <div className="projection-actions">
          <button type="button" className="button button-ghost button-small" onClick={onEdit} disabled={busy}>Edit</button>
          <button type="button" className="button button-danger-ghost button-small" onClick={onRemove} disabled={busy}>Remove</button>
        </div>
      </header>
      <div className="projection-stats">
        <span><span className="metric-label">Today&apos;s balance</span><strong className={projection.currentBalance < 0 ? 'text-danger' : ''}>{projection.currentBalance.toLocaleString()} {projection.unit}</strong></span>
        <span><span className="metric-label">Lowest</span><strong className={projection.minBalance < 0 ? 'text-danger' : ''}>{projection.minBalance.toLocaleString()} {projection.unit}</strong></span>
        <span><span className="metric-label">Horizon</span><strong>{projection.horizonDays} days</strong></span>
      </div>
      <ProjectionChart projection={projection} />
      <footer className="projection-foot">
        {firstStockout ? (
          <p className="tile-warning">Projected stockout from {scheduleDate(firstStockout.date)}{projection.stockoutDates.length > 1 ? ` \u00B7 ${projection.stockoutDates.length} days below zero` : ''}.</p>
        ) : <p>No projected stockout in this horizon.</p>}
        {excluded ? <p>{excluded} record{excluded === 1 ? '' : 's'} excluded for a different unit.</p> : null}
      </footer>
    </article>
  );
}

export function IncomingOrdersTable({ incoming }) {
  return (
    <div className="table-scroll">
      <table className="home-table">
        <thead>
          <tr>
            <th scope="col">Arrival</th>
            <th scope="col">Order</th>
            <th scope="col">Item</th>
            <th scope="col">Quantity</th>
            <th scope="col">Supplier</th>
          </tr>
        </thead>
        <tbody>
          {incoming.map((row) => (
            <tr key={row.id}>
              <td>
                <time dateTime={row.expectedArrival}>{scheduleDate(row.expectedArrival)}</time>
                {row.overdue ? <span className="status-chip review">Overdue</span> : null}
              </td>
              <td>{row.poId || 'Manual delivery'}</td>
              <td><strong>{row.itemName || row.itemSku}</strong><span>{row.itemSku}</span></td>
              <td>{row.quantity.toLocaleString()} {row.unit}</td>
              <td>{row.supplier || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function IncomingDeliveriesPanel({ incoming, today }) {
  const [windowValue, setWindowValue] = useState(2);
  const [windowUnit, setWindowUnit] = useState('weeks');
  const [page, setPage] = useState(0);
  const [editingHorizon, setEditingHorizon] = useState(false);
  const days = windowValue * (windowUnit === 'weeks' ? 7 : 1);
  const end = new Date(`${today}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + days);
  const endDate = end.toISOString().slice(0, 10);
  const rows = incoming.filter((row) => row.expectedArrival <= endDate);
  const pages = Math.max(1, Math.ceil(rows.length / 3));
  const currentPage = Math.min(page, pages - 1);
  const visible = rows.slice(currentPage * 3, currentPage * 3 + 3);

  return (
    <section className="panel home-section" aria-labelledby="home-incoming-title">
      <header className="panel-head record-head">
        <div>
          <h2 id="home-incoming-title">Incoming deliveries</h2>
          <p className="hint incoming-horizon-summary">Next {windowValue} {windowUnit === 'weeks' ? (windowValue === 1 ? 'week' : 'weeks') : (windowValue === 1 ? 'day' : 'days')}</p>
        </div>
        <div className="projection-actions">
          <span className="count">{rows.length}<span className="sr-only"> deliveries in this window</span></span>
          <button type="button" className="button button-ghost button-small" onClick={() => setEditingHorizon(true)} aria-label="Edit incoming delivery horizon">Edit</button>
        </div>
      </header>
      {visible.length ? <IncomingOrdersTable incoming={visible} /> : (
        <div className="empty"><strong>No incoming deliveries in this window</strong><p>Choose a longer window to look further ahead.</p></div>
      )}
      {rows.length > 3 ? (
        <nav className="incoming-pagination" aria-label="Incoming delivery pages">
          <button type="button" className="button button-secondary button-small" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button>
          <span role="status">Page {currentPage + 1} of {pages}</span>
          <button type="button" className="button button-secondary button-small" disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}>Next</button>
        </nav>
      ) : null}
      {editingHorizon ? <IncomingHorizonDialog value={windowValue} unit={windowUnit} onClose={() => setEditingHorizon(false)} onSave={({ value, unit }) => {
        setWindowValue(value);
        setWindowUnit(unit);
        setPage(0);
        setEditingHorizon(false);
      }} /> : null}
    </section>
  );
}

export function CurrentRunsList({ runs }) {
  return (
    <ul className="run-progress-list">
      {runs.map((run) => (
        <li key={run.id} className="run-progress-row">
          <div className="run-progress-head">
            <span className="production-run">{run.runNumber}</span>
            <strong>{run.item}</strong>
            <ProductionStatusChip status={run.status} />
          </div>
          <div className="run-progress-meter">
            <div
              className="run-progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={run.quantity}
              aria-valuenow={run.completedQuantity}
              aria-label={`${run.runNumber} completion`}
            >
              <span style={{ width: `${run.percent}%` }} />
            </div>
            <span className="run-progress-copy">{run.completedQuantity.toLocaleString()} / {run.quantity.toLocaleString()} {run.unit} &middot; {run.percent}%</span>
          </div>
          <time className="run-progress-date" dateTime={run.scheduledDate}>{scheduleDate(run.scheduledDate)}</time>
        </li>
      ))}
    </ul>
  );
}

export function HomeView({ status, inventory, active = true }) {
  const accountId = status.auth.account?.id || '';
  const [homeView, setHomeView] = useState('overview');
  const [calendarFilter, setCalendarFilter] = useState('both');
  useEffect(() => setCalendarFilter('both'), [accountId]);
  useEffect(() => setHomeView('overview'), [accountId]);
  const [data, setData] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const skuOptions = (inventory || []).filter((item) => item.sku);

  const loader = useRef(null);

  async function load({ quiet = false } = {}) {
    return loader.current?.(!quiet);
  }

  useEffect(() => {
    let disposed = false;
    let running = null;
    let queued = false;
    const controller = new AbortController();
    setData(null);
    setLastUpdated(null);
    setError('');
    async function request(showProgress = false) {
      if (disposed) return;
      if (running) {
        queued = true;
        return running;
      }
      if (showProgress) setRefreshing(true);
      running = (async () => {
        do {
          queued = false;
          try {
            const result = await api('/api/dashboard', { signal: controller.signal });
            if (!disposed) {
              setData(result);
              setLastUpdated(new Date().toISOString());
              setError('');
            }
          } catch (failure) {
            if (!disposed) setError(failure.message);
          }
        } while (queued && !disposed);
      })();
      try { await running; } finally {
        running = null;
        if (!disposed) setRefreshing(false);
      }
    }
    loader.current = request;
    return () => {
      disposed = true;
      controller.abort();
      loader.current = null;
    };
  }, [accountId]);

  useEffect(() => {
    if (!active) return undefined;
    loader.current?.();
    const timer = setInterval(() => loader.current?.(), 10000);
    return () => clearInterval(timer);
  }, [active, accountId]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  function openNew() {
    setDraft({ id: null, sku: skuOptions[0]?.sku || '', horizonDays: DEFAULT_HORIZON });
  }

  function openEdit(widget) {
    setDraft({ id: widget.id, sku: widget.sku, horizonDays: widget.horizonDays, item: widget.projection.item });
  }

  async function saveWidget(values) {
    setBusy(true);
    try {
      const edited = Boolean(draft?.id);
      const url = edited ? `/api/dashboard/widgets/${encodeURIComponent(draft.id)}` : '/api/dashboard/widgets';
      await api(url, { method: edited ? 'PUT' : 'POST', body: JSON.stringify(values) });
      setDraft(null);
      setNotice(edited ? 'Visualization saved.' : 'Visualization added.');
      await load({ quiet: true });
    } finally {
      setBusy(false);
    }
  }

  async function removeWidget(widget) {
    if (!globalThis.confirm(`Remove the ${widget.projection.item} visualization from Home?`)) return false;
    setBusy(true);
    try {
      await api(`/api/dashboard/widgets/${encodeURIComponent(widget.id)}`, { method: 'DELETE' });
      setDraft(null);
      setNotice('Visualization removed.');
      await load({ quiet: true });
      return true;
    } catch (failure) {
      setError(failure.message);
      throw failure;
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="home" id="home" tabIndex={-1} aria-labelledby="home-title">
      <header className="home-head">
        <div>
          <div className="home-heading-meta">
            <p className="eyebrow">Dashboard</p>
          </div>
          <div className="home-title-row"><h2 id="home-title">Home</h2><div className="home-view-switch" role="group" aria-label="Home view">{['overview', 'calendar'].map(value => <button key={value} type="button" className={`button ${homeView === value ? 'button-primary' : 'button-secondary'}`} aria-pressed={homeView === value} onClick={() => setHomeView(value)}>{value === 'overview' ? 'Overview' : 'Calendar'}</button>)}</div></div>
        </div>
        <div className="home-actions">
            {lastUpdated ? <span className="home-last-updated">Last updated <time dateTime={lastUpdated}>{new Date(lastUpdated).toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' })}</time></span> : null}
          {homeView === 'overview' ? <button type="button" className="button button-primary button-small" onClick={openNew} disabled={busy || !skuOptions.length}>Add visualization</button> : null}
          <button type="button" className="button button-secondary button-small" onClick={() => load()} disabled={refreshing || !data}>{refreshing ? 'Refreshing…' : 'Refresh'}</button>
        </div>
      </header>
      {error ? <p className="home-error" role="alert">{error}</p> : null}
      {notice ? <p className="home-notice" role="status">{notice}</p> : null}
      {!data && !error ? (
        <div className="panel record-loading" role="status"><span className="spinner" aria-hidden="true" />Loading dashboard…</div>
      ) : null}
      {data && homeView === 'calendar' ? <ProductionCalendar calendar={data.productionCalendar} incoming={data.incoming} filter={calendarFilter} onFilterChange={setCalendarFilter} /> : null}
      {data && homeView === 'overview' ? (
        <>
          <div className="home-grid">
            {data.widgets.map((widget) => (
              <ProjectionTile
                key={widget.id}
                widget={widget}
                busy={busy}
                onEdit={() => openEdit(widget)}
                onRemove={() => removeWidget(widget).catch(() => {})}
              />
            ))}
            {!data.widgets.length ? (
              <div className="panel empty home-empty">
                <span className="empty-mark" aria-hidden="true">HM</span>
                <strong>No visualizations yet</strong>
                <p>{skuOptions.length ? 'Add a visualization to project stock for a selected inventory item.' : 'Add an inventory item first, then project its stock here.'}</p>
                {skuOptions.length ? <button type="button" className="button button-secondary button-small" onClick={openNew}>Add your first visualization</button> : null}
              </div>
            ) : null}
          </div>
          <div className="home-sections">
            <IncomingDeliveriesPanel incoming={data.incoming} today={data.today} />
            <section className="panel home-section" aria-labelledby="home-runs-title">
              <header className="panel-head record-head">
                <div><p className="eyebrow">Production</p><h2 id="home-runs-title">Current production runs</h2></div>
                <span className="count">{data.runs.length}</span>
              </header>
              {data.runs.length ? <CurrentRunsList runs={data.runs} /> : (
                <div className="empty">
                  <span className="empty-mark" aria-hidden="true">PR</span>
                  <strong>No runs on the floor</strong>
                  <p>In-progress runs and runs scheduled today appear here.</p>
                </div>
              )}
            </section>
          </div>
        </>
      ) : null}
      {draft ? (
        <ProjectionDialog
          draft={draft}
          skuOptions={skuOptions}
          busy={busy}
          onClose={() => { if (!busy) setDraft(null); }}
          onSave={saveWidget}
          onDelete={() => removeWidget(draft)}
        />
      ) : null}
    </section>
  );
}
