import { FLAG_LABEL, PO_STATES, PRODUCTION_STATUS } from '../lib/constants.js';

export function StateChip({ state }) {
  return <span className={`state-chip state-${state}`}>{PO_STATES[state] || state}</span>;
}

export function AssessmentChip({ assessment }) {
  if (!assessment) return null;
  return (
    <span className={`assessment-chip flag-${assessment.flag}`} title={assessment.note || assessment.reason || assessment.decision}>
      <span className="status-dot" aria-hidden="true" />
      {FLAG_LABEL[assessment.flag] || assessment.decision}
    </span>
  );
}

export function ProductionStatusChip({ status }) {
  return (
    <span className={`status-chip ${status.split('_').join('-')}`}>
      <span className="status-dot" aria-hidden="true" />
      {PRODUCTION_STATUS[status] || status}
    </span>
  );
}
