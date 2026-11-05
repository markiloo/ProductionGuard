import { useEffect, useState } from 'react';
import { useSheetDialog } from '../hooks/useSheetDialog.js';

export function ReceiveDeliveryDialog({ delivery, busy, onClose, onConfirm }) {
  const dialogRef = useSheetDialog(onClose);
  const [quantity, setQuantity] = useState(String(delivery.quantity ?? 1));
  const [proofFile, setProofFile] = useState(null);
  const [proofPreview, setProofPreview] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => () => { if (proofPreview) globalThis.URL.revokeObjectURL(proofPreview); }, [proofPreview]);

  function chooseProof(event) {
    const file = event.target.files?.[0] || null;
    setFormError('');
    if (!file) {
      setProofFile(null);
      setProofPreview('');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFormError('Choose a JPEG, PNG, or WebP picture.');
      event.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFormError('Receipt pictures must be 5 MB or smaller.');
      event.target.value = '';
      return;
    }
    setProofFile(file);
    setProofPreview(globalThis.URL.createObjectURL(file));
  }

  async function submit(event) {
    event.preventDefault();
    setFormError('');
    const received = Number(quantity);
    if (!Number.isInteger(received) || received <= 0) {
      setFormError('Enter the confirmed received quantity.');
      return;
    }
    if (!proofFile) {
      setFormError('Upload a picture of proof that the delivery was received.');
      return;
    }
    try {
      await onConfirm(received, proofFile);
    } catch (failure) {
      setFormError(failure.message);
    }
  }

  return (
    <dialog ref={dialogRef} className="detail delivery-dialog" aria-labelledby="receive-dialog-title">
      <header className="detail-head">
        <div><p className="eyebrow">Incoming supply</p><h2 id="receive-dialog-title">Receive delivery</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close receive form" disabled={busy}>×</button>
      </header>
      <form className="detail-body" onSubmit={submit}>
        <p className="field-hint">Confirm the quantity physically received. If items are missing or extra, enter the actual count; stock will use this quantity.</p>
        <dl className="po-grid" aria-label="Delivery being received">
          <div className="po-field"><dt>Item SKU</dt><dd className="mono">{delivery.itemSku}</dd></div>
          <div className="po-field"><dt>Planned quantity</dt><dd>{delivery.quantity} {delivery.unit}</dd></div>
          <div className="po-field"><dt>Supplier</dt><dd>{delivery.supplier || '—'}</dd></div>
          <div className="po-field"><dt>Expected arrival</dt><dd>{delivery.expectedArrival}</dd></div>
          {delivery.poId ? <div className="po-field"><dt>PO</dt><dd className="mono">{delivery.poId}</dd></div> : null}
        </dl>
        <div className="form-grid">
          <div className="field field-wide">
            <label htmlFor="receive-quantity">Confirmed received quantity ({delivery.unit})</label>
            <input id="receive-quantity" type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required autoFocus />
            {Number(quantity) !== delivery.quantity && Number(quantity) > 0 ? (
              <p className="field-hint">Planned {delivery.quantity} {delivery.unit}; stock will increase by the confirmed quantity.</p>
            ) : null}
          </div>
          <div className="field field-wide">
            <label htmlFor="receive-proof">Receipt picture</label>
            <input id="receive-proof" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseProof} required />
            <p className="field-hint">JPEG, PNG, or WebP up to 5 MB. Stored locally as proof of receipt.</p>
            {proofPreview ? <img className="proof-preview" src={proofPreview} alt="Selected receipt preview" /> : null}
          </div>
        </div>
        {formError ? <p className="form-error" role="alert">{formError}</p> : null}
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Receiving…' : 'Confirm receipt'}</button>
        </div>
      </form>
    </dialog>
  );
}
