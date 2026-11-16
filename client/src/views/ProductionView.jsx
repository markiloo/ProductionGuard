import { usePagination } from '../hooks/usePagination.js';
import { ListPagination } from '../components/ListPagination.jsx';
import { ProductionRow } from '../components/ProductionRow.jsx';
import { scheduleDate } from '../lib/format.js';

export function ProductionView({ runs, onAdd, onEdit }) {
  const pagination = usePagination(runs);
  const inProgress = runs ? runs.filter((run) => run.status === 'in_progress').length : 0;
  const nextRun = runs
    ? runs.filter((run) => run.status === 'scheduled' || run.status === 'in_progress').sort((first, second) => first.scheduledDate.localeCompare(second.scheduledDate))[0] || null
    : null;
  return (
    <section className="panel record-panel production" id="production" tabIndex={-1} aria-labelledby="production-title">
      <header className="panel-head record-head">
        <div><p className="eyebrow">Schedule</p><h2 id="production-title">Production</h2></div>
        <div className="record-actions">
          <span className="count">{runs ? `${runs.length} ${runs.length === 1 ? 'run' : 'runs'}` : '—'}</span>
          <a className="text-link" href="/production_runs" target="_blank" rel="noreferrer">Production floor view ↗</a><button type="button" className="button button-primary button-small" onClick={onAdd}>Add run</button>
        </div>
      </header>
      {runs === null ? (
        <div className="record-loading" role="status"><span className="spinner" aria-hidden="true" />Loading production schedule…</div>
      ) : (
        <>
          <div className="record-summary">
            <div><span className="metric-label">Runs</span><strong>{runs.length}</strong></div>
            <div><span className="metric-label">In progress</span><strong>{inProgress}</strong></div>
            <div><span className="metric-label">Next run</span><strong>{nextRun ? scheduleDate(nextRun.scheduledDate) : '—'}</strong></div>
          </div>
          <div className="record-list">
            {pagination.visible.map((run) => <ProductionRow key={run.id} run={run} onEdit={onEdit} />)}
            {!runs.length ? (
              <div className="empty">
                <span className="empty-mark" aria-hidden="true">PR</span>
                <strong>No production runs yet</strong>
                <p>Add a scheduled run, select a defined assembly, and set the planned quantity.</p>
                <button type="button" className="button button-secondary button-small" onClick={onAdd}>Add your first run</button>
              </div>
            ) : null}
          </div>
          <ListPagination {...pagination} label="Production pages" />
        </>
      )}
    </section>
  );
}
