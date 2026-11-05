import { useState } from 'react';
import { useSheetDialog } from '../hooks/useSheetDialog.js';

export function FloorProgressDialog({ run, busy, onClose, onSave }) {
  const dialogRef = useSheetDialog(onClose);
  const [completed, setCompleted] = useState(String(run.completedQuantity));
  const [formError, setFormError] = useState('');
  const titleId = `floor-progress-title-${run.id}`;

  async function submit(event) {
    event.preventDefault();
    setFormError('');
    try {
      await onSave(Number(completed));
    } catch (failure) {
      setFormError(failure.message);
    }
  }

  return (
    <dialog ref={dialogRef} className="detail floor-progress-dialog" aria-labelledby={titleId}>
      <header className="detail-head">
        <div><p className="eyebrow">{run.runNumber}</p><h2 id={titleId}>Update completed units</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close progress form" disabled={busy}>×</button>
      </header>
      <form className="detail-body" onSubmit={submit}>
        <div className="field">
          <label htmlFor={`floor-done-${run.id}`}>Units completed</label>
          <input id={`floor-done-${run.id}`} type="number" min="0" max={run.quantity} step="1" required autoFocus value={completed} onChange={(event) => setCompleted(event.target.value)} disabled={busy} />
          <p className="field-hint">Of {run.quantity} {run.unit} planned. Reaching the planned quantity marks the run Completed.</p>
        </div>
        {formError ? <p className="form-error" role="alert">{formError}</p> : null}
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save progress'}</button>
        </div>
      </form>
    </dialog>
  );
}
