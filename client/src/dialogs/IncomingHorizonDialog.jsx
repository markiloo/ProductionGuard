import { useState } from 'react';
import { useSheetDialog } from '../hooks/useSheetDialog.js';

export function IncomingHorizonDialog({ value, unit, onClose, onSave }) {
  const dialogRef = useSheetDialog(onClose);
  const [amount, setAmount] = useState(String(value));
  const [lengthUnit, setLengthUnit] = useState(unit);
  const [error, setError] = useState('');
  const max = lengthUnit === 'weeks' ? 52 : 365;
  function submit(event) {
    event.preventDefault();
    const number = Number(amount);
    if (!Number.isInteger(number) || number < 1 || number > max) {
      setError(`Choose between 1 and ${max} ${lengthUnit}.`);
      return;
    }
    onSave({ value: number, unit: lengthUnit });
  }
  return (
    <dialog ref={dialogRef} className="detail projection-dialog" aria-labelledby="incoming-horizon-title">
      <header className="detail-head">
        <h2 id="incoming-horizon-title">Edit incoming delivery horizon</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close horizon form">×</button>
      </header>
      <form className="detail-body" onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="incoming-window-value">In the next</label>
            <input id="incoming-window-value" type="number" min="1" max={max} step="1" value={amount} onChange={(event) => setAmount(event.target.value)} required autoFocus />
          </div>
          <div className="field">
            <label htmlFor="incoming-window-unit">Length unit</label>
            <select id="incoming-window-unit" value={lengthUnit} onChange={(event) => setLengthUnit(event.target.value)}>
              <option value="days">Days</option><option value="weeks">Weeks</option>
            </select>
          </div>
        </div>
        <p className="hint">Overdue deliveries are always included.</p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-primary">Save</button>
        </div>
      </form>
    </dialog>
  );
}
