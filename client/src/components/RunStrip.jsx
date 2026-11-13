import { fullDate, metricDate } from '../lib/format.js';

export function RunStrip({ status }) {
  const { collection } = status;
  return (
    <section className="run-strip" aria-label="Inbox check status">
      <div className="metric">
        <span className="metric-label">Last complete check</span>
        <strong title={fullDate(collection.lastSuccessAt)}>{metricDate(collection.lastSuccessAt)}</strong>
        {collection.error ? <small className="text-danger" title={collection.error}>Check failed — retrying</small> : null}
      </div>
    </section>
  );
}
