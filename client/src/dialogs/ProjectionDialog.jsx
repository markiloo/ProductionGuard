import { useState } from 'react';
import { useSheetDialog } from '../hooks/useSheetDialog.js';

function initialHorizon(days) {
  return days > 0 && days % 7 === 0
    ? { value: String(days / 7), unit: 'weeks' }
    : { value: String(days || 30), unit: 'days' };
}

export function ProjectionDialog({ draft, skuOptions, busy, onClose, onSave, onDelete }) {
  const dialogRef = useSheetDialog(onClose);
  const editing = Boolean(draft.id);
  const horizon = initialHorizon(Number(draft.horizonDays));
  const [sku, setSku] = useState(draft.sku || '');
  const [horizonValue, setHorizonValue] = useState(horizon.value);
  const [horizonUnit, setHorizonUnit] = useState(horizon.unit);
  const [formError, setFormError] = useState('');

  const maxValue = horizonUnit === 'weeks' ? 52 : 365;

  async function submit(event) {
    event.preventDefault();
    setFormError('');
    const amount = Number(horizonValue);
    const horizonDays = horizonUnit === 'weeks' ? amount * 7 : amount;
    if (!Number.isInteger(amount) || amount < 1 || !Number.isInteger(horizonDays) || horizonDays > 365) {
      setFormError(horizonUnit === 'weeks' ? 'Choose between 1 and 52 weeks.' : 'Choose between 1 and 365 days.');
      return;
    }
    try {
      await onSave({ sku, horizonDays });
    } catch (failure) {
      setFormError(failure.message);
    }
  }

  async function remove() {
    if (!globalThis.confirm('Remove this visualization from Home?')) return;
    setFormError('');
    try { await onDelete(); } catch (failure) { setFormError(failure.message); }
  }

  return (
    <dialog ref={dialogRef} className="detail projection-dialog" aria-labelledby="projection-dialog-title">
      <header className="detail-head">
        <div><p className="eyebrow">Home</p><h2 id="projection-dialog-title">{editing ? 'Edit visualization' : 'Add visualization'}</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close visualization form" disabled={busy}>×</button>
      </header>
      <form className="detail-body" onSubmit={submit}>
        <div className="form-grid">
          <div className="field field-wide">
            <label htmlFor="projection-sku">Inventory item</label>
            <select id="projection-sku" value={sku} onChange={(event) => setSku(event.target.value)} required autoFocus={!editing}>
              {skuOptions.map((item) => <option key={item.id} value={item.sku}>{item.item} · {item.sku}</option>)}
            </select>
            <p className="field-hint">Confirmed supply only: on-hand stock plus unreceived deliveries, minus outstanding production demand.</p>
          </div>
          <div className="field">
            <label htmlFor="projection-horizon">Projection length</label>
            <input
              id="projection-horizon"
              type="number"
              min="1"
              max={maxValue}
              step="1"
              value={horizonValue}
              onChange={(event) => setHorizonValue(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="projection-unit">Length unit</label>
            <select id="projection-unit" value={horizonUnit} onChange={(event) => setHorizonUnit(event.target.value)}>
              <option value="days">Days</option>
              <option value="weeks">Weeks</option>
            </select>
          </div>
        </div>
        {formError ? <p className="form-error" role="alert">{formError}</p> : null}
        <div className="dialog-actions">
          {editing ? <button type="button" className="button button-danger-ghost dialog-delete" onClick={remove} disabled={busy}>Delete</button> : null}
          <button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add visualization'}</button>
        </div>
      </form>
    </dialog>
  );
}
