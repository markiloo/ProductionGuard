import { useState } from 'react';
import { useSheetDialog } from '../hooks/useSheetDialog.js';

export function ManualPoDialog({ skuOptions = [], busy, onClose, onSave }) {
  const dialogRef = useSheetDialog(onClose);
  const options = skuOptions.filter((option) => option.sku);
  const [sku, setSku] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('');
  const [etaDays, setEtaDays] = useState('5');
  const [supplier, setSupplier] = useState('');
  const [formError, setFormError] = useState('');

  function chooseSku(value) {
    const option = options.find((candidate) => candidate.sku === value);
    setSku(value);
    setUnit(option?.unit || '');
    if (option?.supplier) setSupplier((current) => current || option.supplier);
  }

  async function submit(event) {
    event.preventDefault();
    setFormError('');
    const option = options.find((candidate) => candidate.sku === sku);
    if (!option) {
      setFormError('Choose an inventory item.');
      return;
    }
    try {
      await onSave({ item: option.sku, mappedSku: option.sku, quantity: Number(quantity), unit, etaDays: Number(etaDays), supplier });
    } catch (failure) {
      setFormError(failure.message);
    }
  }

  return (
    <dialog ref={dialogRef} className="detail" aria-labelledby="manual-po-title">
      <header className="detail-head">
        <div><p className="eyebrow">Manual entry</p><h2 id="manual-po-title">Add purchase order</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close manual PO form" disabled={busy}>×</button>
      </header>
      <form className="detail-body" onSubmit={submit}>
        <p className="field-hint">A manual PO enters Pending Review immediately and does not need an approved sender. It uses an existing inventory SKU.</p>
        {!options.length ? (
          <p className="review-note">Add an inventory item first. Manual POs must use an inventory SKU so they can be assessed.</p>
        ) : (
          <>
            <div className="field">
              <label htmlFor="manual-po-sku">Inventory item</label>
              <select id="manual-po-sku" value={sku} onChange={(event) => chooseSku(event.target.value)} required autoFocus>
                <option value="">Choose an inventory SKU</option>
                {options.map((option) => <option key={option.id} value={option.sku}>{option.sku} — {option.item}</option>)}
              </select>
            </div>
            <div className="form-grid">
              <div className="field"><label htmlFor="manual-po-quantity">Quantity</label><input id="manual-po-quantity" type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></div>
              <div className="field"><label htmlFor="manual-po-eta">ETA days</label><input id="manual-po-eta" type="number" min="1" step="1" value={etaDays} onChange={(event) => setEtaDays(event.target.value)} required /></div>
              <div className="field"><label htmlFor="manual-po-unit">Unit</label><input id="manual-po-unit" value={unit} readOnly aria-readonly="true" required /></div>
              <div className="field"><label htmlFor="manual-po-supplier">Supplier</label><input id="manual-po-supplier" value={supplier} onChange={(event) => setSupplier(event.target.value)} maxLength={120} required /></div>
            </div>
          </>
        )}
        {formError ? <p className="form-error" role="alert">{formError}</p> : null}
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy || !options.length}>{busy ? 'Adding…' : 'Add PO'}</button>
        </div>
      </form>
    </dialog>
  );
}
