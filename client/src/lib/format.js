export const fullDate = (value) => value
  ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
  : 'Not yet';

export const metricDate = (value) => value
  ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : 'Not yet';

export function scheduleDate(value) {
  if (!value) return '—';
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export function todayDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function shortDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function warningText(warning) {
  if (warning.type === 'early') return `Arriving Early — need date ${warning.needDate}, ${warning.daysEarly} day${warning.daysEarly === 1 ? '' : 's'} early`;
  if (warning.type === 'timing') return `Timing Conflict / Expedite Needed — ${warning.runNumber} on ${warning.runDate}${warning.stockout ? ' (stockout)' : ''}`;
  if (warning.type === 'duplicate') return `Potential Duplicate / Covered by Pending or Approved PO — ${warning.coveredAmount} covered`;
  if (warning.type === 'stockout') return `Projected Stockout — ${warning.runNumber} on ${warning.runDate} (${warning.balance})`;
  return warning.label || warning.type;
}
