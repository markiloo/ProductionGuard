import { useState } from 'react';
import { useSheetDialog } from '../hooks/useSheetDialog.js';
import { InventoryUnitDependencies, useInventoryUnitDependencies } from '../components/InventoryUnitDependencies.jsx';

export function ProductionItemDialog({ draft, skuOptions = [], busy, onClose, onSave, onDelete }) {
  const dialogRef = useSheetDialog(onClose);
  const editing = Boolean(draft.id);
  const [name, setName] = useState(draft.name || '');
  const [sku, setSku] = useState(draft.sku || '');
  const [unit, setUnit] = useState(draft.unit || 'units');
  const [notes, setNotes] = useState(draft.notes || '');
  const [requirements, setRequirements] = useState(() => (draft.requirements?.length ? draft.requirements : []).map((requirement) => ({
    itemSku: requirement.itemSku,
    quantity: String(requirement.quantity),
    unit: requirement.unit,
  })));
  const [formError, setFormError] = useState('');
  const unitChange = useInventoryUnitDependencies(draft.inventoryId, draft, unit, draft.stock ?? 0, true);

  function updateRequirement(index, patch) {
    setRequirements((current) => current.map((requirement, row) => (row === index ? { ...requirement, ...patch } : requirement)));
  }

  function chooseSku(index, itemSku) {
    const inventoryItem = skuOptions.find((option) => option.sku.toLowerCase() === itemSku.toLowerCase());
    updateRequirement(index, { itemSku, unit: inventoryItem?.unit || requirements[index].unit });
  }

  async function submit(event) {
    event.preventDefault();
    if (unitChange.blocked) return;
    setFormError('');
    try {
      await onSave({
        name,
        sku,
        unit,
        notes,
        requirements: requirements.map((requirement) => ({ itemSku: requirement.itemSku, quantity: Number(requirement.quantity), unit: requirement.unit })),
      });
    } catch (failure) {
      unitChange.updateFromError(failure);
      setFormError(failure.message);
    }
  }

  async function remove() {
    if (!globalThis.confirm(`Delete the assembly ${name}? This cannot be undone.`)) return;
    setFormError('');
    try { await onDelete(); } catch (failure) { setFormError(failure.message); }
  }

  return (
    <dialog ref={dialogRef} className="detail" aria-labelledby="production-item-dialog-title">
      <header className="detail-head">
        <div><p className="eyebrow">Assemblies</p><h2 id="production-item-dialog-title">{editing ? 'Edit assembly' : 'Define an assembly'}</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close assembly form" disabled={busy}>×</button>
      </header>
      <form className="detail-body" onSubmit={submit}>
        <div className="form-grid">
          <div className="field field-wide">
            <label htmlFor="production-item-name">Assembly name</label>
            <input id="production-item-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="e.g. Carton Packaging" required autoFocus />
          </div>
          <div className="field">
            <label htmlFor="production-item-sku">Finished-good SKU</label>
            <input id="production-item-sku" value={sku} onChange={(event) => setSku(event.target.value)} maxLength={60} placeholder="e.g. ASM-CARTON" required readOnly={editing && Boolean(draft.sku)} aria-readonly={editing && Boolean(draft.sku)} />
            <p className="field-hint">{editing && draft.sku ? 'The SKU is fixed for an existing assembly.' : 'Creates a finished-good item in Inventory so completed runs can add stock.'}{editing && draft.stock != null ? ` Current stock: ${draft.stock} ${draft.unit}.` : ''}</p>
          </div>
          <div className="field">
            <label htmlFor="production-item-unit">Unit</label>
            <input id="production-item-unit" value={unit} onChange={(event) => { setUnit(event.target.value); setFormError(''); }} maxLength={20} list="production-item-units" required aria-describedby={unitChange.changing ? 'assembly-unit-dependencies' : undefined} />
            <datalist id="production-item-units"><option value="units" /><option value="kg" /><option value="boxes" /><option value="liters" /></datalist>
            <InventoryUnitDependencies id="assembly-unit-dependencies" state={unitChange} />
          </div>
          <div className="field field-wide">
            <label htmlFor="production-item-notes">Notes</label>
            <input id="production-item-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} placeholder="Optional" />
          </div>
          <div className="field field-wide">
            <label>Materials per unit</label>
            <div className="requirement-editor">
              {requirements.map((requirement, index) => (
                <div className="requirement-row" key={index}>
                  <label className="sr-only" htmlFor={`production-requirement-sku-${index}`}>Item SKU</label>
                  <select id={`production-requirement-sku-${index}`} value={requirement.itemSku} onChange={(event) => chooseSku(index, event.target.value)} required>
                    <option value="">Choose inventory item</option>
                    {skuOptions.filter((option) => option.sku.toLowerCase() !== String(draft.sku || '').toLowerCase()).map((option) => <option key={option.id} value={option.sku}>{option.sku} — {option.item}</option>)}
                  </select>
                  <label className="sr-only" htmlFor={`production-requirement-qty-${index}`}>Quantity</label>
                  <input id={`production-requirement-qty-${index}`} type="number" min="1" step="1" value={requirement.quantity} onChange={(event) => updateRequirement(index, { quantity: event.target.value })} required />
                  <label className="sr-only" htmlFor={`production-requirement-unit-${index}`}>Unit</label>
                  <input id={`production-requirement-unit-${index}`} value={requirement.unit} onChange={(event) => updateRequirement(index, { unit: event.target.value })} maxLength={20} required />
                  <button type="button" className="button button-ghost button-small" onClick={() => setRequirements((current) => current.filter((_, row) => row !== index))} aria-label="Remove requirement">Remove</button>
                </div>
              ))}
              <button type="button" className="button button-secondary button-small" onClick={() => setRequirements((current) => [...current, { itemSku: '', quantity: '1', unit: 'units' }])}>Add requirement</button>
            </div>
          </div>
        </div>
        {formError ? <p className="form-error" role="alert">{formError}</p> : null}
        <div className="dialog-actions">
          {editing ? <button type="button" className="button button-danger-ghost dialog-delete" onClick={remove} disabled={busy}>Delete</button> : null}
          <button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy || unitChange.blocked}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Define assembly'}</button>
        </div>
      </form>
    </dialog>
  );
}
