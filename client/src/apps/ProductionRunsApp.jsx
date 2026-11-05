import { useEffect, useState } from 'react';
import { Brand } from '../components/Brand.jsx';
import { ProductionRow } from '../components/ProductionRow.jsx';
import { ToastStack } from '../components/ToastStack.jsx';
import { FloorProgressDialog } from '../dialogs/FloorProgressDialog.jsx';
import { api } from '../lib/api.js';
import { scheduleDate } from '../lib/format.js';

function ProductionProgressRow({ run, onNotify }) {
  const [current, setCurrent] = useState(run);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setCurrent(run); }, [run]);

  async function save(completed) {
    setBusy(true);
    try {
      const result = await api(`/api/production_runs/${encodeURIComponent(run.id)}`, {
        method: 'PATCH', body: JSON.stringify({ completedQuantity: completed }),
      });
      setCurrent(result.item);
      setEditing(false);
      onNotify(result.item.status === 'completed' ? 'Run completed.' : 'Progress saved.');
    } finally {
      setBusy(false);
    }
  }

  return <>
    <ProductionRow run={current} onEdit={() => setEditing(true)} />
    {editing ? (
      <FloorProgressDialog run={current} busy={busy} onClose={() => { if (!busy) setEditing(false); }} onSave={save} />
    ) : null}
  </>;
}

export function ProductionRunsApp() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    let disposed = false;
    let timer;
    async function load() {
      try {
        const result = await api('/api/production_runs');
        if (!disposed) { setData(result); setError(''); }
      } catch (failure) {
        if (!disposed) { setData(null); setError(failure.message); }
      } finally {
        if (!disposed) timer = setTimeout(load, 5000);
      }
    }
    load();
    return () => { disposed = true; clearTimeout(timer); };
  }, []);
  const runs = data?.items || [];
  const inProgress = runs.filter((run) => run.status === 'in_progress').length;
  const scheduled = runs.filter((run) => run.status === 'scheduled').length;
  return (
    <main className="shell">
      <header className="app-head"><Brand /><span className="eyebrow">Production floor</span></header>
      <section className="panel record-panel production" aria-labelledby="floor-title">
        <header className="panel-head record-head">
          <div>
            <p className="eyebrow">{data ? scheduleDate(data.today) : 'Daily schedule'}</p>
            <h2 id="floor-title">Production runs</h2>
          </div>
          <div className="record-actions">
            <span className="count">{data ? `${runs.length} ${runs.length === 1 ? 'run' : 'runs'}` : '—'}</span>
            <span className="floor-refresh">Refreshes every 5 seconds</span>
          </div>
        </header>
        {!data ? (!error ? <div className="record-loading" role="status"><span className="spinner" aria-hidden="true" />Loading production runs...</div> : null) : (
          <>
            <div className="record-summary">
              <div><span className="metric-label">In progress</span><strong>{inProgress}</strong></div>
              <div><span className="metric-label">Scheduled today</span><strong>{scheduled}</strong></div>
              <div><span className="metric-label">On the floor</span><strong>{runs.length}</strong></div>
            </div>
            <div className="record-list">
              {runs.map((run) => <ProductionProgressRow key={run.id} run={run} onNotify={setNotice} />)}
              {!runs.length ? (
                <div className="empty">
                  <span className="empty-mark" aria-hidden="true">PR</span>
                  <strong>No runs on the floor</strong>
                  <p>No runs are scheduled today or currently in progress.</p>
                </div>
              ) : null}
            </div>
          </>
        )}
      </section>
      <ToastStack
        toasts={[
          ...(error ? [{ id: 'error', tone: 'error', message: `${error} Open the main dashboard to check the connection.` }] : []),
          ...(notice ? [{ id: 'notice', tone: 'success', message: notice }] : []),
        ]}
        onDismiss={(id) => { if (id === 'error') setError(''); else setNotice(''); }}
      />
    </main>
  );
}
