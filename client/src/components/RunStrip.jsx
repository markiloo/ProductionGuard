import { useEffect, useState } from 'react';
import { fullDate, metricDate } from '../lib/format.js';

export function RunStrip({ status }) {
  const { collection, senders, totalCount } = status;
  const nextCheckAt = collection.nextCheckAt ?? null;
  const countdown = () => {
    if (nextCheckAt == null) return null;
    const now = Date.now();
    let target = nextCheckAt;
    if (target <= now) target += Math.ceil((now - target + 1) / 15000) * 15000;
    return Math.max(0, Math.ceil((target - now) / 1000));
  };
  const [secondsUntilCheck, setSecondsUntilCheck] = useState(() => countdown());
  useEffect(() => {
    if (nextCheckAt == null) {
      setSecondsUntilCheck(null);
      return undefined;
    }
    const update = () => setSecondsUntilCheck(countdown());
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [nextCheckAt]);
  const polling = senders.length > 0;
  const label = collection.error ? 'Attention needed' : collection.collecting ? 'Checking now' : senders.length ? 'Monitoring' : 'Ready';
  const note = collection.error || (senders.length ? 'Polls every 15 seconds' : 'Add a sender to begin');
  return (
    <section className="run-strip" aria-label="Collector status">
      <div className="metric">
        <span className="metric-label">Collector</span>
        <strong className={collection.error ? 'text-danger' : ''}>{label}</strong>
        <small>{note}</small>
      </div>
      <div className="metric">
        <span className="metric-label">Next inbox check</span>
        <strong>{secondsUntilCheck == null ? '—' : `${secondsUntilCheck}s`}</strong>
        <small>{!polling ? 'Add a sender to begin' : collection.collecting ? 'Checking now · Gmail polls every 15 seconds' : 'Gmail poll every 15 seconds'}</small>
      </div>
      <div className="metric">
        <span className="metric-label">Last complete check</span>
        <strong title={fullDate(collection.lastSuccessAt)}>{metricDate(collection.lastSuccessAt)}</strong>
        <small>{collection.currentRunCount} saved this run</small>
      </div>
      <div className="metric">
        <span className="metric-label">Saved</span>
        <strong>{totalCount}</strong>
        <small>{senders.length} approved {senders.length === 1 ? 'sender' : 'senders'}</small>
      </div>
    </section>
  );
}
