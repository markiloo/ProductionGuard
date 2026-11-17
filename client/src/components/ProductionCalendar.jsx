import { useEffect, useState } from 'react';
import { ProductionStatusChip } from './Chips.jsx';
import { useSheetDialog } from '../hooks/useSheetDialog.js';
import { scheduleDate } from '../lib/format.js';

function RunDetails({ run, onClose }) {
  const ref = useSheetDialog(onClose);
  return <dialog ref={ref} className="detail" aria-labelledby="calendar-run-title">
    <header className="detail-head"><div><h2 id="calendar-run-title">{run.runNumber}</h2><p>{run.item}</p></div><button className="button" onClick={onClose}>Close</button></header>
    <div className="detail-body"><ProductionStatusChip status={run.status} /><p>{scheduleDate(run.scheduledDate)}</p><p>Planned: {run.quantity.toLocaleString()} {run.unit}</p><p>Completed: {run.completedQuantity.toLocaleString()} / {run.quantity.toLocaleString()} ({run.quantity ? Math.round(run.completedQuantity / run.quantity * 100) : 0}%)</p>{run.notes ? <p>{run.notes}</p> : null}<h3>Material requirements</h3>{run.requirements.length ? <ul>{run.requirements.map(row => <li key={row.id}>{row.itemSku}: {row.quantity.toLocaleString()} {row.unit} &mdash; {row.status}</li>)}</ul> : <p>No material requirements.</p>}</div>
  </dialog>;
}

function DeliveryDetails({ delivery, onClose }) {
  const ref = useSheetDialog(onClose);
  return <dialog ref={ref} className="detail" aria-labelledby="calendar-delivery-title">
    <header className="detail-head"><h2 id="calendar-delivery-title">Incoming delivery</h2><button className="button" onClick={onClose}>Close</button></header>
    <div className="detail-body"><h3>{delivery.itemName || delivery.itemSku}</h3><p>SKU: {delivery.itemSku}</p><p>Expected arrival: {scheduleDate(delivery.expectedArrival)}</p><p>Quantity: {delivery.quantity.toLocaleString()} {delivery.unit}</p><p>Supplier: {delivery.supplier || 'Not specified'}</p><p>Source: {delivery.poId || 'Manual delivery'}</p></div>
  </dialog>;
}

export function ProductionCalendar({ calendar, incoming = [], filter = 'both', onFilterChange }) {
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    setSelected(value => {
      if (!value || !calendar) return null;
      const visible = value.type === 'production'
        ? filter !== 'deliveries' && calendar.runs.some(row => row.id === value.id)
        : filter !== 'production' && incoming.some(row => row.id === value.id && row.status !== 'received' && row.expectedArrival >= calendar.startDate && row.expectedArrival <= calendar.endDate);
      return visible ? value : null;
    });
  }, [calendar, incoming, filter]);
  if (!calendar) return null;
  const { startDate, endDate, runs } = calendar;
  const first = new Date(`${startDate}T00:00:00Z`);
  const padding = (first.getUTCDay() + 6) % 7;
  const days = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(first);
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
  const visibleRuns = filter === 'deliveries' ? [] : runs;
  const deliveries = filter === 'production' ? [] : incoming.filter(row => row.status !== 'received' && row.expectedArrival >= startDate && row.expectedArrival <= endDate);
  const run = selected?.type === 'production' ? visibleRuns.find(row => row.id === selected.id) : null;
  const delivery = selected?.type === 'delivery' ? deliveries.find(row => row.id === selected.id) : null;
  return <section className="panel production-calendar" aria-labelledby="calendar-title">
    <header className="panel-head"><h2 id="calendar-title">Upcoming production &amp; deliveries</h2><label className="calendar-filter"><select aria-label="Calendar events" className="field" value={filter} onChange={event => onFilterChange?.(event.target.value)}><option value="both">Both</option><option value="production">Production runs</option><option value="deliveries">Incoming deliveries</option></select></label></header>
    {!visibleRuns.length && !deliveries.length ? <p className="empty">{filter === 'production' ? 'No upcoming production runs in this window.' : filter === 'deliveries' ? 'No incoming deliveries in this window.' : 'No upcoming production runs or incoming deliveries in this window.'}</p> : null}
    <div className="production-calendar-grid">
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <div key={day} className="calendar-weekday" aria-hidden="true">{day}</div>)}
      {Array.from({ length: padding }, (_, i) => <div key={`blank-${i}`} className="calendar-blank" aria-hidden="true" />)}
      {days.map(date => <section key={date} className={`calendar-day${date === startDate ? ' calendar-day-today' : ''}`} aria-label={scheduleDate(date)}><h3><time dateTime={date} aria-current={date === startDate ? 'date' : undefined}>{scheduleDate(date)}</time>{date === startDate ? <span>Today</span> : null}</h3>{visibleRuns.filter(row => row.scheduledDate === date).map(row => <button key={`production-${row.id}`} className="button calendar-run" onClick={() => setSelected({ type: 'production', id: row.id })}><span className="calendar-event-type">Production</span><strong>{row.runNumber}</strong><span>{row.item}</span><span>{row.quantity.toLocaleString()} {row.unit}</span><ProductionStatusChip status={row.status} /></button>)}{deliveries.filter(row => row.expectedArrival === date).map(row => <button key={`delivery-${row.id}`} className="button calendar-run" onClick={() => setSelected({ type: 'delivery', id: row.id })}><span className="calendar-event-type">Delivery</span><strong>{row.itemName || row.itemSku}</strong><span>{row.itemSku}</span><span>{row.quantity.toLocaleString()} {row.unit}</span>{row.supplier ? <span>{row.supplier}</span> : null}</button>)}</section>)}
    </div>
    {delivery ? <DeliveryDetails delivery={delivery} onClose={() => setSelected(null)} /> : null}
    {run ? <RunDetails run={run} onClose={() => setSelected(null)} /> : null}
  </section>;
}

