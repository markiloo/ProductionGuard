import { useState } from 'react';
import { useSheetDialog } from '../hooks/useSheetDialog.js';
import { InventoryUnitDependencies, useInventoryUnitDependencies } from '../components/InventoryUnitDependencies.jsx';

export function InventoryDialog({ draft, busy, onClose, onSave, onDelete }) {
  const dialogRef = useSheetDialog(onClose);
  const editing = Boolean(draft.id);
  const [item, setItem] = useState(draft.item || '');
  const [sku, setSku] = useState(draft.sku || '');
  const [quantity, setQuantity] = useState(String(draft.quantity ?? 0));
  const [unit, setUnit] = useState(draft.unit || 'units');
  const [supplier, setSupplier] = useState(draft.supplier || '');
  const [reorderLevel, setReorderLevel] = useState(draft.reorderLevel == null ? '' : String(draft.reorderLevel));
  const [notes, setNotes] = useState(draft.notes || '');
  const [formError, setFormError] = useState('');
  const unitChange = useInventoryUnitDependencies(draft.id, draft, unit, quantity);

  async function submit(event) {
    event.preventDefault();
    if (unitChange.blocked) return;
    setFormError('');
    try {
      await onSave({ item, sku, quantity: Number(quantity), unit, supplier, reorderLevel: reorderLevel === '' ? null : Number(reorderLevel), notes });
    } catch (failure) {
      unitChange.updateFromError(failure);
      setFormError(failure.message);
    }
  }

  async function remove() {
    if (!globalThis.confirm(`Delete “${item}” from inventory? This cannot be undone.`)) return;
    setFormError('');
    try { await onDelete(); } catch (failure) { setFormError(failure.message); }
  }

  return (
    <dialog ref={dialogRef} className="detail inventory-dialog" aria-labelledby="inventory-dialog-title">
      <header className="detail-head">
        <div><p className="eyebrow">Inventory</p><h2 id="inventory-dialog-title">{editing ? 'Edit inventory item' : 'Add inventory item'}</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close inventory form" disabled={busy}>×</button>
      </header>
      <form className="detail-body inventory-form" onSubmit={submit}>
        <div className="form-grid">
          <div className="field field-wide">
            <label htmlFor="inventory-item">Item name</label>
            <input id="inventory-item" value={item} onChange={(event) => setItem(event.target.value)} maxLength={120} placeholder="e.g. Carton Glue" required autoFocus={!editing} />
          </div>
          <div className="field">
            <label htmlFor="inventory-sku">Item code (SKU)</label>
            <input id="inventory-sku" value={sku} onChange={(event) => setSku(event.target.value)} maxLength={60} placeholder="e.g. SKU-0001" required readOnly={editing && Boolean(draft.sku)} aria-readonly={editing && Boolean(draft.sku)} />
            <p className="field-hint">{editing && draft.sku ? 'The SKU is fixed for an existing inventory item.' : 'Adding this inventory item defines the SKU used by POs, deliveries, assemblies, and demand.'}</p>
          </div>
          <div className="field">
            <label htmlFor="inventory-supplier">Supplier</label>
            <input id="inventory-supplier" value={supplier} onChange={(event) => setSupplier(event.target.value)} maxLength={120} placeholder="Optional" />
          </div>
          <div className="field">
            <label htmlFor="inventory-quantity">Quantity on hand</label>
            <input id="inventory-quantity" type="number" min="0" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="inventory-unit">Unit</label>
            <input id="inventory-unit" value={unit} onChange={(event) => { setUnit(event.target.value); setFormError(''); }} maxLength={20} list="inventory-units" required aria-describedby={unitChange.changing ? 'inventory-unit-dependencies' : undefined} />
            <datalist id="inventory-units"><option value="units" /><option value="kg" /><option value="boxes" /><option value="liters" /></datalist>
            <InventoryUnitDependencies id="inventory-unit-dependencies" state={unitChange} />
          </div>
          <div className="field">
            <label htmlFor="inventory-reorder">Reorder level</label>
            <input id="inventory-reorder" type="number" min="0" step="1" value={reorderLevel} onChange={(event) => setReorderLevel(event.target.value)} placeholder="Optional" />
          </div>
          <div className="field field-wide">
            <label htmlFor="inventory-notes">Notes</label>
            <textarea id="inventory-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} rows={3} placeholder="Optional storage notes, bin location, etc." />
          </div>
        </div>
        {formError ? <p className="form-error" role="alert">{formError}</p> : null}
        <div className="dialog-actions">
          {editing ? <button type="button" className="button button-danger-ghost dialog-delete" onClick={remove} disabled={busy}>Delete</button> : null}
          <button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy || unitChange.blocked}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add item'}</button>
        </div>
      </form>
    </dialog>
  );
}
