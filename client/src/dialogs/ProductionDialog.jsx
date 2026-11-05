import { useState } from 'react';
import { PRODUCTION_STATUS } from '../lib/constants.js';
import { todayDate } from '../lib/format.js';
import { useSheetDialog } from '../hooks/useSheetDialog.js';

function scaleRunRequirements(productionItem, quantity) {
  const planned = Number(quantity);
  if (!productionItem || !Number.isInteger(planned) || planned <= 0) return [];
  return (productionItem.requirements || []).map((requirement) => ({
    itemSku: requirement.itemSku,
    perUnit: requirement.quantity,
    quantity: requirement.quantity * planned,
    unit: requirement.unit,
  }));
}

export function ProductionDialog({ draft, productionItems = [], busy, onClose, onSave, onDelete }) {
  const dialogRef = useSheetDialog(onClose);
  const editing = Boolean(draft.id);
  const runNumber = draft.runNumber || '';
  const initialSelected = productionItems.find((option) => option.id === draft.productionItemId) || null;
  const [productionItemId, setProductionItemId] = useState(draft.productionItemId || '');
  const [quantity, setQuantity] = useState(String(draft.quantity ?? 1));
  const [unit, setUnit] = useState(initialSelected?.unit || draft.unit || 'units');
  const [status, setStatus] = useState(draft.status || 'scheduled');
  const [scheduledDate, setScheduledDate] = useState(draft.scheduledDate || todayDate());
  const [notes, setNotes] = useState(draft.notes || '');
  const [requirements, setRequirements] = useState(() => {
    if (initialSelected) return scaleRunRequirements(initialSelected, draft.quantity ?? 1);
    return (draft.requirements || []).map((requirement) => ({
      itemSku: requirement.itemSku,
      perUnit: null,
      quantity: requirement.quantity,
      unit: requirement.unit,
    }));
  });
  const [formError, setFormError] = useState('');
  const selectedProductionItem = productionItems.find((option) => option.id === productionItemId) || null;

  function chooseProductionItem(value) {
    setProductionItemId(value);
    const selected = productionItems.find((option) => option.id === value);
    if (!selected) return;
    setUnit(selected.unit);
    setRequirements(scaleRunRequirements(selected, quantity));
  }

  function changeQuantity(value) {
    setQuantity(value);
    if (selectedProductionItem) setRequirements(scaleRunRequirements(selectedProductionItem, value));
  }

  async function submit(event) {
    event.preventDefault();
    setFormError('');
    try {
      await onSave({
        runNumber,
        productionItemId: productionItemId || null,
        quantity: Number(quantity),
        status,
        scheduledDate,
        notes,
      });
    } catch (failure) {
      setFormError(failure.message);
    }
  }

  async function remove() {
    if (!globalThis.confirm(`Delete run ${draft.runNumber}? This cannot be undone.`)) return;
    setFormError('');
    try { await onDelete(); } catch (failure) { setFormError(failure.message); }
  }

  return (
    <dialog ref={dialogRef} className="detail production-dialog" aria-labelledby="production-dialog-title">
      <header className="detail-head">
        <div><p className="eyebrow">Production</p><h2 id="production-dialog-title">{editing ? 'Edit production run' : 'Add production run'}</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close production form" disabled={busy}>×</button>
      </header>
      <form className="detail-body production-form" onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="production-run">Run number</label>
            <input id="production-run" value={runNumber} readOnly aria-readonly="true" required />
            <p className="field-hint">{editing ? 'Run numbers stay fixed.' : 'Generated automatically.'}</p>
          </div>
          <div className="field">
            <label htmlFor="production-status">Status</label>
            <select id="production-status" value={status} onChange={(event) => setStatus(event.target.value)}>
              {Object.entries(PRODUCTION_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div className="field field-wide">
            <label htmlFor="production-item">Assembly</label>
            <select id="production-item" value={productionItemId} onChange={(event) => chooseProductionItem(event.target.value)} required>
              <option value="">Choose an assembly</option>
              {productionItems.map((option) => <option key={option.id} value={option.id}>{option.name} — {option.unit}</option>)}
            </select>
            <p className="field-hint">Assemblies and their per-unit materials are defined under Assemblies.</p>
          </div>
          <div className="field">
            <label htmlFor="production-quantity">Planned quantity</label>
            <input id="production-quantity" type="number" min="1" step="1" value={quantity} onChange={(event) => changeQuantity(event.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="production-unit">Unit</label>
            <input id="production-unit" value={unit} readOnly aria-readonly="true" required />
          </div>
          <div className="field field-wide">
            <label htmlFor="production-date">Scheduled date</label>
            <input id="production-date" type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} required />
          </div>
          <div className="field field-wide">
            <label>Material requirements (scaled and locked)</label>
            {requirements.length ? (
              <ul className="locked-requirements" aria-label="Scaled material requirements">
                {requirements.map((requirement, index) => (
                  <li key={`${requirement.itemSku}-${index}`}>
                    <span className="requirement-sku">{requirement.itemSku}</span>
                    <span className="locked-requirement-math">
                      {requirement.perUnit != null ? `${requirement.perUnit} ${requirement.unit} × ${quantity || 0} = ` : ''}
                      <strong>{requirement.quantity} {requirement.unit}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="muted">No materials defined for this assembly.</p>}
            <p className="field-hint">Materials are scaled from the assembly's per-unit list by the planned quantity and locked to the run. Change the planned quantity to re-derive them.</p>
          </div>
          <div className="field field-wide">
            <label htmlFor="production-notes">Notes</label>
            <textarea id="production-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} rows={3} placeholder="Optional line, machine, or handoff notes." />
          </div>
        </div>
        {formError ? <p className="form-error" role="alert">{formError}</p> : null}
        {!productionItems.length ? <p className="form-error" role="alert">Define an assembly under Assemblies before adding a run.</p> : null}
        <div className="dialog-actions">
          {editing ? <button type="button" className="button button-danger-ghost dialog-delete" onClick={remove} disabled={busy}>Delete</button> : null}
          <button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy || !productionItems.length}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add run'}</button>
        </div>
      </form>
    </dialog>
  );
}
