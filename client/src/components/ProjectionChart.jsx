import { scheduleDate } from '../lib/format.js';

const WIDTH = 640;
const HEIGHT = 180;
const PAD = { top: 14, right: 12, bottom: 24, left: 50 };

/** Dependency-free projected-balance chart with an accessible text summary. */
export function ProjectionChart({ projection }) {
  const { item, unit, points, reorderLevel, startDate, endDate, minBalance, stockoutDates } = projection;
  if (!Array.isArray(points) || points.length === 0) return null;

  const values = points.map((point) => point.balance);
  const lowest = Math.min(0, minBalance ?? Math.min(...values));
  let highest = Math.max(0, ...values, reorderLevel ?? 0);
  if (highest === lowest) highest = lowest + 1;

  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (index) => PAD.left + (index / Math.max(1, points.length - 1)) * plotWidth;
  const y = (value) => PAD.top + ((highest - value) / (highest - lowest)) * plotHeight;
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(2)} ${y(point.balance).toFixed(2)}`).join(' ');
  const zeroY = y(0);
  const area = `${line} L${x(points.length - 1).toFixed(2)} ${zeroY.toFixed(2)} L${x(0).toFixed(2)} ${zeroY.toFixed(2)} Z`;
  const showZero = lowest < 0;
  const showReorder = reorderLevel != null && reorderLevel > lowest && reorderLevel < highest;
  const firstStockout = stockoutDates?.[0] || null;
  const summary = firstStockout
    ? `Stockout from ${scheduleDate(firstStockout.date)}${stockoutDates.length > 1 ? `, ${stockoutDates.length} days below zero` : ''}.`
    : 'No projected stockout.';

  return (
    <svg
      className="projection-chart"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`${item}: projected ${unit} on hand from ${scheduleDate(startDate)} to ${scheduleDate(endDate)}. Lowest ${Math.round(minBalance).toLocaleString()} ${unit}. ${summary}`}
    >
      <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(highest)} y2={y(highest)} className="chart-grid" />
      <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(lowest)} y2={y(lowest)} className="chart-grid" />
      {showZero ? <line x1={PAD.left} x2={WIDTH - PAD.right} y1={zeroY} y2={zeroY} className="chart-zero" /> : null}
      {showReorder ? (
        <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(reorderLevel)} y2={y(reorderLevel)} className="chart-reorder" />
      ) : null}
      <path d={area} className="chart-area" />
      <path d={line} className="chart-line" />
      {points.map((point, index) => (point.balance < 0 ? (
        <circle key={point.date} cx={x(index)} cy={y(point.balance)} r="3" className="chart-stockout">
          <title>{`${scheduleDate(point.date)}: ${point.balance.toLocaleString()} ${unit}`}</title>
        </circle>
      ) : null))}
      <text x={PAD.left - 8} y={y(highest) + 4} textAnchor="end" className="chart-label">{Math.round(highest).toLocaleString()}</text>
      <text x={PAD.left - 8} y={y(lowest) + 4} textAnchor="end" className="chart-label">{Math.round(lowest).toLocaleString()}</text>
      <text x={PAD.left} y={HEIGHT - 6} className="chart-label">{scheduleDate(startDate)}</text>
      <text x={WIDTH - PAD.right} y={HEIGHT - 6} textAnchor="end" className="chart-label">{scheduleDate(endDate)}</text>
    </svg>
  );
}
