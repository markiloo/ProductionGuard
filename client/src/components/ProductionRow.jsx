import { fullDate, scheduleDate, shortDate } from '../lib/format.js';
import { ProductionStatusChip } from './Chips.jsx';

export function ProductionRow({ run, onEdit }) {
  const requirements = run.requirements || [];
  return (
    <div className="production-row">
      <div className="production-main">
        <div className="production-top">
          <span className="production-run">{run.runNumber}</span>
          <strong className="production-name">{run.item}</strong>
          <ProductionStatusChip status={run.status} />
        </div>
        <span className="production-meta">Scheduled {scheduleDate(run.scheduledDate)}{run.notes ? ` · ${run.notes}` : ''}</span>
        {requirements.length ? (
          <ul className="requirement-list">
            {requirements.map((requirement) => {
              const consumed = requirement.status === 'completed' || run.status === 'completed';
              return (
                <li key={requirement.id}>
                  <span className="requirement-sku">{requirement.itemSku}</span>
                  <span className="requirement-qty">{requirement.quantity} {requirement.unit}</span>
                  <span className={`status-chip ${consumed ? 'completed' : 'scheduled'}`}>{consumed ? 'Consumed' : 'Outstanding'}</span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
      <div className="production-side">
        <span className="production-qty">{run.quantity}<small>{run.unit}</small></span>
        <span className="production-meta">{run.completedQuantity ?? 0} completed</span>
        <time className="production-updated" dateTime={run.updatedAt} title={fullDate(run.updatedAt)}>Updated {shortDate(run.updatedAt)}</time>
      </div>
      {onEdit ? <button type="button" className="button button-ghost button-small production-edit" onClick={() => onEdit(run)} aria-label={`Edit ${run.runNumber}`}>Edit</button> : null}
    </div>
  );
}
